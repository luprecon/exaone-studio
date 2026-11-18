import { create } from 'zustand';
import type { AppMode, RateLimitInfo, RunMode } from '@shared/types';

interface AppState {
  appMode: AppMode;
  runMode: RunMode;
  hasApiKey: boolean;
  isApiKeyModalOpen: boolean;
  rateLimit: RateLimitInfo | null;
  setAppMode: (mode: AppMode) => void;
  setRunMode: (mode: RunMode) => void;
  setHasApiKey: (hasKey: boolean) => void;
  setApiKeyModalOpen: (open: boolean) => void;
  setRateLimit: (info: RateLimitInfo | null) => void;
  syncApiKeyStatus: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  appMode: 'studio',
  runMode: 'demo',
  hasApiKey: false,
  isApiKeyModalOpen: false,
  rateLimit: null,
  setAppMode: (appMode) => set({ appMode }),
  setRunMode: (runMode) => set({ runMode }),
  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setApiKeyModalOpen: (isApiKeyModalOpen) => set({ isApiKeyModalOpen }),
  setRateLimit: (rateLimit) => set({ rateLimit }),
  syncApiKeyStatus: async () => {
    try {
      const hasApiKey = await window.exaoneAPI.hasApiKey();
      set({ hasApiKey });
    } catch {
      set({ hasApiKey: false });
    }
  }
}));
