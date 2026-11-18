import {
  Plus,
  MessageSquare,
  Trash2,
  BookOpen,
  Sparkles
} from 'lucide-react';
import type { PromptTemplate } from '@shared/types';
import { useStudioStore } from '@renderer/store/useStudioStore';

const STARTER_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-code-review',
    title: 'TypeScript 보안·성능 리뷰',
    description: '비동기 처리, 메모리 누수 및 타입 안전성 점검',
    systemPrompt:
      '당신은 시니어 TypeScript/Node.js 아키텍트입니다. 잠재적 레이스 컨디션, 메모리 누수, 타입 결함을 우선순위로 지적하고 수정 코드를 제시하세요.',
    userPrompt:
      '아래 비동기 작업 큐에서 발생할 수 있는 메모리 누수와 재시도 폭풍 문제를 분석해 줘.',
    recommendedEffort: 'high'
  },
  {
    id: 'tpl-json-extract',
    title: '구조화 JSON 엔티티 추출',
    description: 'Schema 강제를 통한 장애 리포트 정형화',
    systemPrompt:
      '비정형 장애 보고 텍스트를 분석하여 지정된 JSON Schema 규격에 정확히 맞는 JSON만 출력하세요.',
    userPrompt:
      '2026-11-19 02:14 KST 결제 게이트웨이 타임아웃(HTTP 504) 412건 발생, 원인: Redis 커넥션 풀 고갈, 복구 시간 14분.',
    recommendedEffort: 'low'
  },
  {
    id: 'tpl-algo-deep',
    title: '심층 알고리즘 증명 및 최적화',
    description: 'MAX 추론 모드로 반례 및 시간 복잡도 검증',
    systemPrompt:
      '당신은 알고리즘 및 시스템 최적화 전문가입니다. 시간/공간 복잡도 증명과 반례 검증 후 최적 해법을 제시하세요.',
    userPrompt:
      '초당 50,000건 이벤트가 유입되는 환경에서 슬라이딩 윈도우 기반 Rate Limiter를 O(1) 근사 시간으로 설계해 줘.',
    recommendedEffort: 'max'
  }
];

export function HistorySidebar() {
  const {
    sessions,
    activeSessionId,
    isStreaming,
    createSession,
    selectSession,
    deleteSession
  } = useStudioStore();

  const handleApplyTemplate = (tpl: PromptTemplate) => {
    if (isStreaming) return;
    createSession({
      title: tpl.title,
      systemPrompt: tpl.systemPrompt,
      reasoningEffort: tpl.recommendedEffort,
      scenarioId: tpl.scenarioId,
      draftInput: tpl.userPrompt
    });
  };

  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-zinc-800/80 bg-zinc-950/70 flex-col min-h-0">
      <div className="p-3 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={() => createSession()}
          disabled={isStreaming}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>새 세션</span>
        </button>
      </div>

      {/* 대화 히스토리 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between text-[11px] font-medium text-zinc-400">
          <span>세션 히스토리</span>
          <span className="text-zinc-600">{sessions.length}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  isActive
                    ? 'bg-zinc-800/90 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={() => selectSession(session.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer disabled:cursor-not-allowed"
                >
                  <MessageSquare
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-indigo-400' : 'text-zinc-500'
                    }`}
                  />
                  <span className="truncate">{session.title}</span>
                </button>

                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={() => deleteSession(session.id)}
                  title="세션 삭제"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-opacity cursor-pointer disabled:opacity-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* 프롬프트 템플릿 */}
        <div className="border-t border-zinc-800/80 p-3 space-y-2 bg-zinc-950/90">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>프롬프트 템플릿</span>
          </div>

          <div className="space-y-1.5">
            {STARTER_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={isStreaming}
                onClick={() => handleApplyTemplate(tpl)}
                className="w-full text-left p-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900 hover:border-indigo-500/40 transition-colors cursor-pointer disabled:opacity-40"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-zinc-200 truncate">
                    {tpl.title}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 shrink-0">
                    <Sparkles className="w-2.5 h-2.5" />
                    {tpl.recommendedEffort}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">
                  {tpl.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
