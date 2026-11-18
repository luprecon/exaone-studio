import { contextBridge, ipcRenderer } from 'electron';
import type { ExaoneIPCBridge } from '@shared/types';

const exaoneAPI: ExaoneIPCBridge = {
  hasApiKey: () => ipcRenderer.invoke('exaone:has-key')
};

contextBridge.exposeInMainWorld('exaoneAPI', exaoneAPI);
