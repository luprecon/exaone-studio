import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

function registerStubIpcHandlers(): void {
  ipcMain.handle('exaone:has-key', async () => false);
  ipcMain.handle('exaone:save-key', async () => ({
    ok: false,
    error: '키 저장소 기능이 아직 연결되지 않았습니다.'
  }));
  ipcMain.handle('exaone:clear-key', async () => undefined);
  ipcMain.handle('exaone:start-stream', async () => undefined);
  ipcMain.handle('exaone:abort-stream', async () => undefined);
  ipcMain.handle('workspace:open-folder', async () => null);
  ipcMain.handle('workspace:list-files', async () => []);
  ipcMain.handle('workspace:read-file', async () => '');
  ipcMain.handle('workspace:write-file', async () => undefined);
}

app.whenReady().then(() => {
  registerStubIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
