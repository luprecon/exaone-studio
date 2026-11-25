import { randomUUID } from 'node:crypto';
import {
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent
} from 'electron';
import type {
  ChatCompletionRequest,
  ChatMessage,
  StreamChunk
} from '@shared/types';
import { runLiveExaoneStream } from './exaoneClient';
import { clearApiKey, hasStoredApiKey, saveApiKey } from './keyStore';
import { runMockChatStream } from './mockEngine';
import {
  listWorkspaceFiles,
  openSampleWorkspace,
  openWorkspaceFolder,
  readWorkspaceFile,
  writeWorkspaceFile
} from './workspaceFs';

const MAX_PREVIEW_HTML_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_ENTRIES = 5;
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool']);

const activeControllers = new Map<string, AbortController>();
const previewHtmlStore = new Map<string, string>();

export function abortAllActiveStreams(): void {
  for (const controller of activeControllers.values()) {
    controller.abort();
  }
  activeControllers.clear();
}

export function getPreviewHtml(id: string): string | undefined {
  return previewHtmlStore.get(id);
}

export function clearPreviewStore(): void {
  previewHtmlStore.clear();
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null,
  isAllowedUrl: (url: string) => boolean
): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('허용되지 않은 렌더러 송신자입니다.');
  }
  const frameUrl = event.senderFrame?.url ?? '';
  if (!isAllowedUrl(frameUrl)) {
    throw new Error('신뢰할 수 없는 프레임 출처의 IPC 요청이 차단되었습니다.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertValidChatRequest(req: unknown): asserts req is ChatCompletionRequest {
  if (!isRecord(req)) {
    throw new Error('유효하지 않은 요청 객체입니다.');
  }
  if (
    typeof req.requestId !== 'string' ||
    req.requestId.trim().length === 0 ||
    req.requestId.length > 128
  ) {
    throw new Error('유효하지 않은 requestId입니다.');
  }
  if (req.runMode !== 'demo' && req.runMode !== 'live') {
    throw new Error('유효하지 않은 runMode입니다.');
  }
  if (!Array.isArray(req.messages)) {
    throw new Error('messages는 배열이어야 합니다.');
  }
  for (const item of req.messages as ChatMessage[]) {
    if (
      !isRecord(item) ||
      typeof item.role !== 'string' ||
      !ALLOWED_ROLES.has(item.role) ||
      typeof item.content !== 'string'
    ) {
      throw new Error('messages 항목 형식이 올바르지 않습니다.');
    }
  }
  if (typeof req.temperature !== 'number' || !Number.isFinite(req.temperature)) {
    throw new Error('유효하지 않은 temperature 값입니다.');
  }
  if (
    typeof req.maxTokens !== 'number' ||
    !Number.isFinite(req.maxTokens) ||
    req.maxTokens <= 0
  ) {
    throw new Error('유효하지 않은 maxTokens 값입니다.');
  }
  if (
    req.responseSchemaJson !== undefined &&
    typeof req.responseSchemaJson !== 'string'
  ) {
    throw new Error('responseSchemaJson은 문자열이어야 합니다.');
  }
  if (req.scenarioId !== undefined && typeof req.scenarioId !== 'string') {
    throw new Error('scenarioId는 문자열이어야 합니다.');
  }
  if (req.tools !== undefined && !Array.isArray(req.tools)) {
    throw new Error('tools는 배열이어야 합니다.');
  }
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  isAllowedUrl: (url: string) => boolean
): void {
  ipcMain.handle('exaone:has-key', async (event) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    return hasStoredApiKey();
  });

  ipcMain.handle('exaone:save-key', async (event, apiKey: unknown) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    if (typeof apiKey !== 'string') {
      return { ok: false, error: '유효하지 않은 API 키 형식입니다.' };
    }
    return saveApiKey(apiKey);
  });

  ipcMain.handle('exaone:clear-key', async (event) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    return clearApiKey();
  });

  ipcMain.handle('exaone:start-stream', async (event, req: unknown) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    assertValidChatRequest(req);

    const existing = activeControllers.get(req.requestId);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    activeControllers.set(req.requestId, controller);

    const emit = (chunk: StreamChunk) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('exaone:stream-chunk', req.requestId, chunk);
      }
    };

    void (async () => {
      try {
        if (req.runMode === 'demo') {
          await runMockChatStream(req, emit, controller.signal);
        } else {
          await runLiveExaoneStream(req, emit, controller.signal);
        }
      } catch (err) {
        emit({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : '스트림 처리 중 예기치 않은 오류가 발생했습니다.'
        });
      } finally {
        if (activeControllers.get(req.requestId) === controller) {
          activeControllers.delete(req.requestId);
        }
      }
    })();
  });

  ipcMain.handle('exaone:abort-stream', async (event, requestId: unknown) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    if (typeof requestId !== 'string' || !requestId.trim()) {
      return;
    }
    const controller = activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeControllers.delete(requestId);
    }
  });

  ipcMain.handle('workspace:open-folder', async (event) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    return openWorkspaceFolder(getMainWindow());
  });

  ipcMain.handle('workspace:open-sample', async (event) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    return openSampleWorkspace();
  });

  ipcMain.handle('workspace:list-files', async (event, rootPath: unknown) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    if (typeof rootPath !== 'string') {
      throw new Error('유효하지 않은 워크스페이스 경로 인자입니다.');
    }
    return listWorkspaceFiles(rootPath);
  });

  ipcMain.handle(
    'workspace:read-file',
    async (event, rootPath: unknown, relativePath: unknown) => {
      assertTrustedSender(event, getMainWindow, isAllowedUrl);
      if (typeof rootPath !== 'string' || typeof relativePath !== 'string') {
        throw new Error('유효하지 않은 파일 읽기 인자입니다.');
      }
      return readWorkspaceFile(rootPath, relativePath);
    }
  );

  ipcMain.handle(
    'workspace:write-file',
    async (event, rootPath: unknown, relativePath: unknown, content: unknown) => {
      assertTrustedSender(event, getMainWindow, isAllowedUrl);
      if (
        typeof rootPath !== 'string' ||
        typeof relativePath !== 'string' ||
        typeof content !== 'string'
      ) {
        throw new Error('유효하지 않은 파일 쓰기 인자입니다.');
      }
      return writeWorkspaceFile(rootPath, relativePath, content);
    }
  );

  ipcMain.handle('workspace:set-preview-html', async (event, html: unknown) => {
    assertTrustedSender(event, getMainWindow, isAllowedUrl);
    if (typeof html !== 'string') {
      throw new Error('유효하지 않은 프리뷰 HTML 형식입니다.');
    }
    if (Buffer.byteLength(html, 'utf-8') > MAX_PREVIEW_HTML_BYTES) {
      throw new Error('프리뷰 HTML 크기가 5MB 상한을 초과했습니다.');
    }
    if (previewHtmlStore.size >= MAX_PREVIEW_ENTRIES) {
      const oldestKey = previewHtmlStore.keys().next().value;
      if (oldestKey !== undefined) {
        previewHtmlStore.delete(oldestKey);
      }
    }
    const id = randomUUID();
    previewHtmlStore.set(id, html);
    return `exaone-preview://sandbox/${id}`;
  });
}
