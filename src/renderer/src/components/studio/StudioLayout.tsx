import { SlidersHorizontal, History } from 'lucide-react';
import { ChatPanel } from '@renderer/components/studio/ChatPanel';
import { useStudioStore } from '@renderer/store/useStudioStore';

export function StudioLayout() {
  const { reasoningEffort, temperature, maxTokens } = useStudioStore();

  return (
    <div className="flex-1 min-h-0 flex bg-zinc-950">
      {/* 좌측 히스토리 & 템플릿 사이드바 셸 (Step 5에서 확장) */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-zinc-800/80 bg-zinc-950/60 flex-col">
        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2 text-xs font-medium text-zinc-400">
          <History className="w-3.5 h-3.5 text-zinc-400" />
          <span>세션 &amp; 템플릿</span>
        </div>
        <div className="p-4 text-xs text-zinc-500 leading-relaxed">
          프롬프트 템플릿과 대화 히스토리 목록이 Step 5에서 연결됩니다.
        </div>
      </aside>

      {/* 중앙 멀티턴 채팅 영역 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPanel />
      </div>

      {/* 우측 파라미터 제어 패널 셸 (Step 5에서 확장) */}
      <aside className="hidden md:flex w-72 shrink-0 border-l border-zinc-800/80 bg-zinc-950/60 flex-col">
        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2 text-xs font-medium text-zinc-400">
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
          <span>모델 파라미터</span>
        </div>
        <div className="p-4 space-y-3 text-xs text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Model</span>
            <span className="font-mono text-indigo-300">k-exaone_v2.5</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Reasoning Effort</span>
            <span className="font-mono text-zinc-200">{reasoningEffort}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Temperature</span>
            <span className="font-mono text-zinc-200">{temperature}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Max Tokens</span>
            <span className="font-mono text-zinc-200">
              {maxTokens.toLocaleString()}
            </span>
          </div>
          <p className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500 leading-relaxed">
            세부 슬라이더, 512K 컨텍스트 바, JSON Schema 및 코드 내보내기는 Step 5에서 활성화됩니다.
          </p>
        </div>
      </aside>
    </div>
  );
}
