import { ipcMain, type BrowserWindow } from 'electron';
import type { ChatCompletionRequest, StreamChunk } from '@shared/types';
import { runMockChatStream } from './mockEngine';

const activeControllers = new Map<string, AbortController>();

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('exaone:has-key', async () => false);
  ipcMain.handle('exaone:save-key', async () => ({
    ok: false,
    error: '키 저장소 기능은 Step 4에서 연결됩니다.'
  }));
  ipcMain.handle('exaone:clear-key', async () => undefined);

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
            emit({
              type: 'error',
              status: 400,
              message:
                'Live API 직접 연동은 Step 4에서 활성화됩니다. 현재는 Demo Mode로 테스트해 주세요.'
            });
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

  ipcMain.handle('workspace:open-folder', async () => null);
  ipcMain.handle('workspace:list-files', async () => []);
  ipcMain.handle('workspace:read-file', async () => '');
  ipcMain.handle('workspace:write-file', async () => undefined);
}
