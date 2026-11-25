import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ExaoneIPCBridge, StreamChunk } from '@shared/types';

const exaoneAPI: ExaoneIPCBridge = {
  hasApiKey: () => ipcRenderer.invoke('exaone:has-key'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('exaone:save-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('exaone:clear-key'),

  startChatStream: (req) => ipcRenderer.invoke('exaone:start-stream', req),
  abortChatStream: (requestId) => ipcRenderer.invoke('exaone:abort-stream', requestId),
  onStreamChunk: (callback) => {
    const listener = (
      _event: IpcRendererEvent,
      requestId: string,
      chunk: StreamChunk
    ) => {
      callback(requestId, chunk);
    };
    ipcRenderer.on('exaone:stream-chunk', listener);
    return () => {
      ipcRenderer.removeListener('exaone:stream-chunk', listener);
    };
  },

  openWorkspaceFolder: () => ipcRenderer.invoke('workspace:open-folder'),
  openSampleWorkspace: () => ipcRenderer.invoke('workspace:open-sample'),
  listWorkspaceFiles: (rootPath) =>
    ipcRenderer.invoke('workspace:list-files', rootPath),
  readWorkspaceFile: (rootPath, relativePath) =>
    ipcRenderer.invoke('workspace:read-file', rootPath, relativePath),
  writeWorkspaceFile: (rootPath, relativePath, content) =>
    ipcRenderer.invoke('workspace:write-file', rootPath, relativePath, content),
  setPreviewHtml: (html) =>
    ipcRenderer.invoke('workspace:set-preview-html', html)
};

contextBridge.exposeInMainWorld('exaoneAPI', exaoneAPI);
