import { Play, Sparkles, Code2, X } from 'lucide-react';
import { DEMO_SCENARIOS, type DemoScenarioMeta } from '@renderer/lib/mockScenarios';
import { useAppStore } from '@renderer/store/useAppStore';
import { useStudioStore } from '@renderer/store/useStudioStore';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

export function DemoScenariosModal() {
  const {
    isScenariosModalOpen,
    setScenariosModalOpen,
    setAppMode,
    setRunMode
  } = useAppStore();
  const { isStreaming, createSession } = useStudioStore();
  const { isAgentRunning, setPendingAutoRun, resetAgentMessages } =
    useWorkspaceStore();

  if (!isScenariosModalOpen) {
    return null;
  }

  const handleLaunch = (scenario: DemoScenarioMeta) => {
    if (isStreaming || isAgentRunning) return;

    setRunMode('demo');
    setScenariosModalOpen(false);

    if (scenario.mode === 'studio') {
      setAppMode('studio');
      createSession({
        title: scenario.title.replace(/^시나리오 \d+:\s*/, ''),
        systemPrompt: scenario.systemPrompt,
        reasoningEffort: scenario.recommendedEffort,
        scenarioId: scenario.id,
        autoRunPrompt: scenario.userPrompt
      });
    } else {
      useStudioStore.getState().setReasoningEffort(scenario.recommendedEffort);
      setAppMode('workspace');
      resetAgentMessages();
      setPendingAutoRun({
        prompt: scenario.userPrompt,
        scenarioId: scenario.id
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-scenarios-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2
                id="demo-scenarios-title"
                className="text-sm font-semibold text-zinc-100"
              >
                K-EXAONE 2.5 프리셋 데모 시나리오 (3종)
              </h2>
              <p className="text-[11px] text-zinc-400">
                API 키 없이도 512K 컨텍스트, 추론 깊이 비교, 로컬 에이전트 IDE를 즉시 시연합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setScenariosModalOpen(false)}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {DEMO_SCENARIOS.map((sc) => {
            const isStudio = sc.mode === 'studio';
            return (
              <div
                key={sc.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                        isStudio
                          ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      {isStudio ? (
                        <Sparkles className="w-2.5 h-2.5" />
                      ) : (
                        <Code2 className="w-2.5 h-2.5" />
                      )}
                      {sc.mode === 'studio' ? 'Studio' : 'Workspace'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800 text-zinc-300">
                      {sc.badge}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800 text-amber-300">
                      effort: {sc.recommendedEffort}
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-zinc-100">
                    {sc.title}
                  </h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {sc.description}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isStreaming || isAgentRunning}
                  onClick={() => handleLaunch(sc)}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>실행</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
