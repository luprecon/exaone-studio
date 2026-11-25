import { Suspense, lazy, useEffect, useState } from 'react';
import { Header } from '@renderer/components/layout/Header';
import { ApiKeyModal } from '@renderer/components/layout/ApiKeyModal';
import { DemoScenariosModal } from '@renderer/components/layout/DemoScenariosModal';
import { StudioLayout } from '@renderer/components/studio/StudioLayout';
import { initStudioStreamListener } from '@renderer/lib/studioStream';
import { useAppStore } from '@renderer/store/useAppStore';

const WorkspaceLayout = lazy(() =>
  import('@renderer/components/workspace/WorkspaceLayout').then((m) => ({
    default: m.WorkspaceLayout
  }))
);

export function App() {
  const { appMode, syncApiKeyStatus } = useAppStore();
  const [hasVisitedWorkspace, setHasVisitedWorkspace] = useState(
    appMode === 'workspace'
  );

  useEffect(() => {
    if (appMode === 'workspace') {
      setHasVisitedWorkspace(true);
    }
  }, [appMode]);

  useEffect(() => {
    void syncApiKeyStatus();
  }, [syncApiKeyStatus]);

  useEffect(() => {
    const unsubscribe = initStudioStreamListener();
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <Header />

      <main className="flex-1 min-h-0 flex flex-col">
        <div
          className={
            appMode === 'studio' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'
          }
        >
          <StudioLayout />
        </div>

        {hasVisitedWorkspace && (
          <div
            className={
              appMode === 'workspace'
                ? 'flex-1 min-h-0 flex flex-col'
                : 'hidden'
            }
          >
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-xs text-zinc-400">
                  Workspace 에디터를 불러오는 중...
                </div>
              }
            >
              <WorkspaceLayout />
            </Suspense>
          </div>
        )}
      </main>

      <ApiKeyModal />
      <DemoScenariosModal />
    </div>
  );
}

export default App;
