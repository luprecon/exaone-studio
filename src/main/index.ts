import { app, BrowserWindow, Menu, nativeImage, net, protocol, shell } from 'electron';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  abortAllActiveStreams,
  clearPreviewStore,
  getPreviewHtml,
  registerIpcHandlers
} from './ipcHandlers';
import {
  APP_ORIGIN,
  isAllowedInAppUrl as checkAllowedInAppUrl
} from './urlGuard';
import { isOutsideRoot } from './workspacePathGuard';

export { APP_ORIGIN };
const PREVIEW_URL_PREFIX = 'exaone-preview://sandbox/';

const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ');

let mainWindowRef: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'exaone-preview',
    privileges: {
      standard: true,
      secure: true
    }
  }
]);

function setupMacApplicationMenu(): void {
  if (process.platform !== 'darwin') return;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function isAllowedInAppUrl(targetUrl: string): boolean {
  return checkAllowedInAppUrl(targetUrl, process.env['ELECTRON_RENDERER_URL']);
}

function registerAppProtocols(): void {
  const rendererDir = resolve(__dirname, '../renderer');

  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'exaone') {
        return new Response('Forbidden', { status: 403 });
      }

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(url.pathname);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const relPath =
        !decodedPath || decodedPath === '/'
          ? 'index.html'
          : decodedPath.replace(/^\/+/, '');

      const candidate = resolve(rendererDir, relPath);
      const rel = relative(rendererDir, candidate);
      if (!rel || isOutsideRoot(rel)) {
        return new Response('Forbidden', { status: 403 });
      }

      return await net.fetch(pathToFileURL(candidate).toString());
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  protocol.handle('exaone-preview', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'sandbox') {
        return new Response('Forbidden', { status: 403 });
      }

      const id = url.pathname.replace(/^\/+/, '');
      const html = getPreviewHtml(id);
      if (html === undefined) {
        return new Response('<!doctype html><html><body></body></html>', {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': PREVIEW_CSP
          }
        });
      }

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': PREVIEW_CSP
        }
      });
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });
}

function createMainWindow(): BrowserWindow {
  const iconPath = join(__dirname, '../../build/icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedInAppUrl(url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) {
      if (!isAllowedInAppUrl(details.url)) {
        details.preventDefault();
      }
      return;
    }

    if (!details.url.startsWith(PREVIEW_URL_PREFIX)) {
      details.preventDefault();
    }
  });

  mainWindow.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      abortAllActiveStreams();
    }
  });

  mainWindow.webContents.on('render-process-gone', () => {
    abortAllActiveStreams();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      // 비정상 URL 차단
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    abortAllActiveStreams();
    clearPreviewStore();
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null;
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  mainWindowRef = mainWindow;
  return mainWindow;
}

app.whenReady().then(() => {
  setupMacApplicationMenu();
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      join(__dirname, '../../build/icon.png')
    );
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
  registerAppProtocols();
  registerIpcHandlers(() => mainWindowRef, isAllowedInAppUrl);
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
