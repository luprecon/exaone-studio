import { useEffect } from 'react';
import { Code2 } from 'lucide-react';
import { Header } from '@renderer/components/layout/Header';
import { StudioLayout } from '@renderer/components/studio/StudioLayout';
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
        {appMode === 'studio' ? (
          <StudioLayout />
        ) : (
          <section className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center space-y-3">
              <div className="mx-auto h-11 w-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Code2 className="w-5 h-5 text-emerald-400" />
              </div>
              <h1 className="text-lg font-semibold text-zinc-100">
                EXAONE Workspace 에이전틱 IDE 셸
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                로컬 폴더 탐색기, Monaco 에디터 및 에이전트 파일 도구가 Step 6~7에서 탑재됩니다.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
