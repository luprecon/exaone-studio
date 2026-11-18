import { useEffect } from 'react';
import { Header } from '@renderer/components/layout/Header';
import { ApiKeyModal } from '@renderer/components/layout/ApiKeyModal';
import { StudioLayout } from '@renderer/components/studio/StudioLayout';
import { WorkspaceLayout } from '@renderer/components/workspace/WorkspaceLayout';
import { useAppStore } from '@renderer/store/useAppStore';

export function App() {
  const { appMode, syncApiKeyStatus } = useAppStore();

  useEffect(() => {
    void syncApiKeyStatus();
  }, [syncApiKeyStatus]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <Header />

      <main className="flex-1 min-h-0 flex flex-col">
        {appMode === 'studio' ? <StudioLayout /> : <WorkspaceLayout />}
      </main>

      <ApiKeyModal />
    </div>
  );
}

export default App;
