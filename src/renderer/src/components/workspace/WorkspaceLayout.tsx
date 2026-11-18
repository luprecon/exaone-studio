import { AlertCircle } from 'lucide-react';
import { AgentChatPanel } from '@renderer/components/workspace/AgentChatPanel';
import { FileTree } from '@renderer/components/workspace/FileTree';
import { CodeEditorPane } from '@renderer/components/workspace/CodeEditorPane';
import { LivePreviewPane } from '@renderer/components/workspace/LivePreviewPane';
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
        <AgentChatPanel />

        <div className="flex-1 min-w-0 flex">
          <FileTree />
          <CodeEditorPane />
        </div>

        <LivePreviewPane />
      </div>
    </div>
  );
}
