import { useAppStore } from '@renderer/store/useAppStore';
import { useStudioStore } from '@renderer/store/useStudioStore';

export function initStudioStreamListener(): () => void {
  return window.exaoneAPI.onStreamChunk((requestId, chunk) => {
    const state = useStudioStore.getState();
    if (state.activeRequestId !== requestId) return;

    switch (chunk.type) {
      case 'thinking':
        state.appendThinking(chunk.text);
        break;
      case 'content':
        state.appendContent(chunk.text);
        break;
      case 'usage':
        state.setLastUsage(chunk.usage);
        break;
      case 'rate_limit':
        useAppStore.getState().setRateLimit(chunk.info);
        break;
      case 'error':
        state.setErrorMessage(chunk.message);
        state.finalizeStream();
        break;
      case 'done':
        state.finalizeStream();
        break;
      default:
        break;
    }
  });
}

export async function abortStudioStream(): Promise<void> {
  const state = useStudioStore.getState();
  const requestId = state.activeRequestId;
  if (!requestId) {
    state.finalizeStream();
    return;
  }

  try {
    await window.exaoneAPI.abortChatStream(requestId);
  } finally {
    useStudioStore.getState().finalizeStream();
  }
}
