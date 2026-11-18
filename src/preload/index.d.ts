import type { ExaoneIPCBridge } from '@shared/types';

declare global {
  interface Window {
    exaoneAPI: ExaoneIPCBridge;
  }
}

export {};
