import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Send,
  Square,
  RotateCcw,
  Sparkles,
  User
} from 'lucide-react';
import { useAppStore } from '@renderer/store/useAppStore';
import { useStudioStore } from '@renderer/store/useStudioStore';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';
import { ThinkingAccordion } from '@renderer/components/studio/ThinkingAccordion';
import { ToolCallCard } from '@renderer/components/workspace/ToolCallCard';
import {
  MAX_AGENT_STEPS,
  runWorkspaceAgentLoop
} from '@renderer/lib/agentLoop';

const WORKSPACE_QUICK_TASKS = [
  {
    title: 'EXAONE 모니터링 대시보드 생성',
    prompt:
      'K-EXAONE 2.5 토큰 사용량, 추론 깊이, 일일 잔여 쿼터를 시뮬레이션하는 인터랙티브 모니터링 대시보드 UI를 만들어줘.'
  },
  {
    title: '할일(To-Do) 작업 플래너 앱',
    prompt:
      '다크 테마 기반의 할일(To-Do) 체크리스트 웹 앱을 index.html, styles.css, app.js로 만들어줘.'
  }
];

export function AgentChatPanel() {
  const { runMode, hasApiKey, setApiKeyModalOpen } = useAppStore();
  const { reasoningEffort } = useStudioStore();
  const {
    rootPath,
    agentMessages,
    isAgentRunning,
    agentStep,
    pendingWorkspacePrompt,
    pendingAutoRun,
    openSampleFolder,
    setPendingWorkspacePrompt,
    setPendingAutoRun,
    setErrorMessage,
    resetAgentMessages
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingWorkspacePrompt) {
      setInput(pendingWorkspacePrompt);
      setPendingWorkspacePrompt('');
    }
  }, [pendingWorkspacePrompt, setPendingWorkspacePrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    agentMessages.length,
    agentMessages[agentMessages.length - 1]?.content,
    agentMessages[agentMessages.length - 1]?.thinking,
    agentMessages[agentMessages.length - 1]?.toolCalls?.length
  ]);

  const handleRunAgent = async (
    overridePrompt?: string,
    scenarioId?: string
  ) => {
    const text = (overridePrompt ?? input).trim();
    if (!text || isAgentRunning) return;

    if (runMode === 'live' && !hasApiKey) {
      setErrorMessage(
        'Live API 모드에서는 API 키가 필요합니다. 키를 등록하거나 Demo Mode로 전환해 주세요.'
      );
      setApiKeyModalOpen(true);
      return;
    }

    if (!rootPath) {
      const opened = await openSampleFolder();
      if (!opened) return;
    }

    if (!overridePrompt) {
      setInput('');
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await runWorkspaceAgentLoop({
      userPrompt: text,
      runMode,
      reasoningEffort,
      scenarioId,
      signal: controller.signal
    });
  };

  useEffect(() => {
    if (pendingAutoRun && !isAgentRunning) {
      const task = pendingAutoRun;
      setPendingAutoRun(null);
      void handleRunAgent(task.prompt, task.scenarioId);
    }
  }, [pendingAutoRun, isAgentRunning]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleRunAgent();
    }
  };

  const visibleMessages = agentMessages.filter((m) => m.role !== 'tool');

  return (
    <aside className="w-80 lg:w-96 shrink-0 border-r border-zinc-800/80 bg-zinc-950/80 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="h-10 shrink-0 px-3.5 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-zinc-200">
            에이전트 채팅
          </span>
          {isAgentRunning && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
              Step {agentStep}/{MAX_AGENT_STEPS}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={resetAgentMessages}
          disabled={isAgentRunning || agentMessages.length === 0}
          title="에이전트 대화 초기화"
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-35 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 메시지 리스트 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
        {visibleMessages.length === 0 ? (
          <div className="py-6 space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span>로컬 파일 제어 에이전트</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                폴더가 열려 있지 않으면 실행 시 자동으로 샘플 프로젝트가 열리며, 에이전트가 실제 디스크 파일을 생성·수정하고 우측 프리뷰를 즉시 갱신합니다.
              </p>
            </div>

            <div className="space-y-2">
              {WORKSPACE_QUICK_TASKS.map((task) => (
                <button
                  key={task.title}
                  type="button"
                  onClick={() => void handleRunAgent(task.prompt)}
                  className="w-full text-left p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-emerald-500/40 transition-colors cursor-pointer space-y-1"
                >
                  <div className="text-xs font-medium text-zinc-200">
                    {task.title}
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {task.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLast = idx === visibleMessages.length - 1;
            const isThinkingActive =
              !isUser &&
              isAgentRunning &&
              isLast &&
              msg.content.length === 0 &&
              (!msg.toolCalls || msg.toolCalls.length === 0);

            return (
              <div key={msg.id} className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-400">
                  {isUser ? (
                    <>
                      <User className="w-3.5 h-3.5 text-zinc-300" />
                      <span>User</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">EXAONE Agent</span>
                    </>
                  )}
                </div>

                {isUser ? (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-600/15 px-3 py-2.5 text-xs text-zinc-100 leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <ThinkingAccordion
                      thinking={msg.thinking ?? ''}
                      durationMs={msg.thinkingDurationMs}
                      isThinkingActive={isThinkingActive}
                    />

                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1.5">
                        {msg.toolCalls.map((tc) => (
                          <ToolCallCard key={tc.id} toolCall={tc} />
                        ))}
                      </div>
                    )}

                    {msg.content && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                        <div className="markdown-content text-xs break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2 focus-within:border-emerald-500/60 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="수정할 기능이나 새로 만들 UI를 지시하세요..."
            className="flex-1 bg-transparent px-1.5 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none max-h-32"
          />
          {isAgentRunning ? (
            <button
              type="button"
              onClick={handleStop}
              className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>중지</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleRunAgent()}
              disabled={!input.trim()}
              className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Send className="w-3 h-3" />
              <span>실행</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
