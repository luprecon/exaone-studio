import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  Sparkles,
  TerminalSquare
} from 'lucide-react';
import { useStudioStore } from '@renderer/store/useStudioStore';
import { useAppStore } from '@renderer/store/useAppStore';

const QUICK_PROMPTS = [
  {
    title: 'TypeScript 비동기 스트림 패턴',
    prompt: 'TypeScript에서 AsyncIterable을 사용해 SSE 스트림을 안전하게 소비하는 예제를 작성해줘.'
  },
  {
    title: '동시성 레이스 컨디션 분석',
    prompt: '비동기 캐시 갱신 시 발생하는 Cache Stampede 현상과 Mutex 기반 해결 패턴을 설명해줘.'
  },
  {
    title: '512K 컨텍스트 로그 점검 전략',
    prompt: '대용량 마이크로서비스 에러 로그에서 근본 원인을 단계적으로 추적하는 체크리스트를 만들어줘.'
  }
];

export function ChatPanel() {
  const { runMode } = useAppStore();
  const {
    sessions,
    activeSessionId,
    isStreaming,
    updateSystemPrompt,
    addUserMessage,
    resetActiveSession
  } = useStudioStore();

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const [input, setInput] = useState('');
  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // 클립보드 권한 실패 무시
    }
  };

  const handleSubmit = (overridePrompt?: string) => {
    const text = (overridePrompt ?? input).trim();
    if (!text || isStreaming) return;

    addUserMessage(text);
    if (!overridePrompt) {
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-950">
      {/* 상단 접이식 System Prompt 바 */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="px-4 py-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsSystemOpen((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
          >
            {isSystemOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <TerminalSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>System Instructions</span>
            {!isSystemOpen && activeSession?.systemPrompt && (
              <span className="text-[11px] text-zinc-500 truncate max-w-md font-normal">
                — {activeSession.systemPrompt}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={resetActiveSession}
            disabled={isStreaming}
            title="현재 대화 초기화"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>대화 초기화</span>
          </button>
        </div>

        {isSystemOpen && (
          <div className="px-4 pb-3">
            <textarea
              value={activeSession?.systemPrompt ?? ''}
              onChange={(e) => updateSystemPrompt(e.target.value)}
              rows={2}
              placeholder="모델의 역할, 응답 형식, 제약 조건을 입력하세요..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 resize-none"
            />
          </div>
        )}
      </div>

      {/* 중앙 멀티턴 메시지 스크롤 목록 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5">
        {!activeSession || activeSession.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6">
            <div className="space-y-2">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">
                EXAONE Studio 멀티턴 채팅
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                현재 모드:{' '}
                <span className="text-zinc-200 font-medium">
                  {runMode === 'demo' ? 'Demo Mode' : 'Live API'}
                </span>
                {' · '}
                아래 예시 카드를 클릭하거나 프롬프트를 입력해 대화를 시작하세요.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-left">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => handleSubmit(item.prompt)}
                  className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-indigo-500/40 transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="text-xs font-medium text-zinc-200">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {item.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {activeSession.messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="h-7 w-7 shrink-0 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mt-0.5">
                      <Bot className="w-4 h-4 text-indigo-400" />
                    </div>
                  )}

                  <div
                    className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      isUser
                        ? 'bg-indigo-600/20 border border-indigo-500/30 text-zinc-100'
                        : 'bg-zinc-900/70 border border-zinc-800 text-zinc-200 w-full'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className="text-[11px] font-medium text-zinc-400">
                        {isUser ? 'User' : 'K-EXAONE 2.5'}
                      </span>
                      {msg.content && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          title="내용 복사"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="prose prose-invert prose-sm max-w-none leading-relaxed break-words [&>pre]:bg-zinc-950 [&>pre]:border [&>pre]:border-zinc-800 [&>pre]:rounded-lg [&>pre]:p-3 [&>pre]:overflow-x-auto [&>p]:my-1.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {isUser && (
                    <div className="h-7 w-7 shrink-0 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center mt-0.5">
                      <User className="w-4 h-4 text-zinc-300" />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 하단 프롬프트 입력창 */}
      <div className="border-t border-zinc-800/80 bg-zinc-950 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2 focus-within:border-indigo-500/60 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="K-EXAONE 2.5에게 질문하거나 작업을 지시하세요... (Enter 전송 · Shift+Enter 줄바꿈)"
              className="flex-1 bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none max-h-40"
            />
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isStreaming}
              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>전송</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
