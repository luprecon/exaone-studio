import { ipcMain, type BrowserWindow } from 'electron';
import type { ChatCompletionRequest, StreamChunk } from '@shared/types';
import { runMockChatStream } from './mockEngine';
import { runLiveExaoneStream } from './exaoneClient';
import { clearApiKey, hasStoredApiKey, saveApiKey } from './keyStore';
import {
  listWorkspaceFiles,
  openSampleWorkspace,
  openWorkspaceFolder,
  readWorkspaceFile,
  writeWorkspaceFile
} from './workspaceFs';

const activeControllers = new Map<string, AbortController>();

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('exaone:has-key', async () => hasStoredApiKey());
  ipcMain.handle('exaone:save-key', async (_event, apiKey: string) =>
    saveApiKey(apiKey)
  );
  ipcMain.handle('exaone:clear-key', async () => clearApiKey());

  ipcMain.handle(
    'exaone:start-stream',
    async (_event, req: ChatCompletionRequest) => {
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
        } finally {
          if (activeControllers.get(req.requestId) === controller) {
            activeControllers.delete(req.requestId);
          }
        }
      })();
    }
  );

  ipcMain.handle('exaone:abort-stream', async (_event, requestId: string) => {
    const controller = activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeControllers.delete(requestId);
    }
  });

  ipcMain.handle('workspace:open-folder', async () =>
    openWorkspaceFolder(getMainWindow())
  );
  ipcMain.handle('workspace:open-sample', async () => openSampleWorkspace());
  ipcMain.handle('workspace:list-files', async (_event, rootPath: string) =>
    listWorkspaceFiles(rootPath)
  );
  ipcMain.handle(
    'workspace:read-file',
    async (_event, rootPath: string, relativePath: string) =>
      readWorkspaceFile(rootPath, relativePath)
  );
  ipcMain.handle(
    'workspace:write-file',
    async (_event, rootPath: string, relativePath: string, content: string) =>
      writeWorkspaceFile(rootPath, relativePath, content)
  );
}
