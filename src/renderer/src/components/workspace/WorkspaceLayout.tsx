import { Bot, Eye, AlertCircle } from 'lucide-react';
import { FileTree } from '@renderer/components/workspace/FileTree';
import { CodeEditorPane } from '@renderer/components/workspace/CodeEditorPane';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

export function WorkspaceLayout() {
  const { errorMessage, setErrorMessage } = useWorkspaceStore();

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-950">
      {errorMessage && (
        <div className="mx-4 mt-2.5 px-3.5 py-2 rounded-xl border border-rose-500/30 bg-rose-950/30 flex items-center justify-between gap-3 text-xs text-rose-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[11px] text-rose-300 hover:text-white cursor-pointer"
          >
            닫기
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* 좌측 에이전트 채팅 슬롯 (Step 7에서 확장) */}
        <aside className="hidden lg:flex w-80 shrink-0 border-r border-zinc-800/80 bg-zinc-950/70 flex-col">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
            <span>에이전트 채팅</span>
          </div>
          <div className="p-4 text-xs text-zinc-500 leading-relaxed">
            로컬 파일 도구(write_file, update_file) 멀티턴 에이전트 루프가 Step 7에서 연결됩니다.
          </div>
        </aside>

        {/* 중앙 파일 트리 + Monaco 코드 에디터 */}
        <div className="flex-1 min-w-0 flex">
          <FileTree />
          <CodeEditorPane />
        </div>

        {/* 우측 실시간 프리뷰 슬롯 (Step 7에서 확장) */}
        <aside className="hidden xl:flex w-96 shrink-0 border-l border-zinc-800/80 bg-zinc-950/70 flex-col">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>실시간 프리뷰</span>
          </div>
          <div className="p-4 text-xs text-zinc-500 leading-relaxed">
            로컬 index.html · CSS · JS 실시간 샌드박스 프리뷰가 Step 7에서 탑재됩니다.
          </div>
        </aside>
      </div>
    </div>
  );
}
