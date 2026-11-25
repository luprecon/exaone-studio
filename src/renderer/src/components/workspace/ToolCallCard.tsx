import { useMemo, useState } from 'react';
import {
  FileEdit,
  FilePlus2,
  FileSearch,
  FolderTree,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { ToolCallRecord } from '@shared/types';
import { normalizeWorkspaceRelPath } from '@renderer/lib/workspaceToolUtils';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

interface ToolCallCardProps {
  toolCall: ToolCallRecord;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { selectFile } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(false);

  const parsedInfo = useMemo(() => {
    try {
      const obj = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>;
      const rawPath = typeof obj.path === 'string' ? obj.path : undefined;
      return {
        path: rawPath ? normalizeWorkspaceRelPath(rawPath) || rawPath : undefined,
        preview: JSON.stringify(obj, null, 2)
      };
    } catch {
      return {
        path: undefined,
        preview: toolCall.argumentsJson
      };
    }
  }, [toolCall.argumentsJson]);

  const Icon =
    toolCall.name === 'write_file'
      ? FilePlus2
      : toolCall.name === 'update_file'
        ? FileEdit
        : toolCall.name === 'read_file'
          ? FileSearch
          : FolderTree;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden text-xs">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-zinc-500 hover:text-zinc-200 cursor-pointer shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          <Icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-mono text-[11px] font-medium text-zinc-200 shrink-0">
            {toolCall.name}
          </span>
          {parsedInfo.path && (
            <button
              type="button"
              onClick={() => void selectFile(parsedInfo.path!)}
              title="에디터에서 파일 열기"
              className="font-mono text-[11px] text-indigo-300 hover:text-indigo-200 hover:underline truncate cursor-pointer"
            >
              {parsedInfo.path}
            </button>
          )}
        </div>

        <span className="shrink-0">
          {toolCall.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              실행 중
            </span>
          )}
          {toolCall.status === 'success' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              완료
            </span>
          )}
          {toolCall.status === 'error' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-rose-400">
              <XCircle className="w-3 h-3" />
              오류
            </span>
          )}
        </span>
      </div>

      {expanded && (
        <div className="px-3 py-2 border-t border-zinc-800/80 bg-zinc-900/40 space-y-1.5">
          <pre className="font-mono text-[10px] text-zinc-400 whitespace-pre-wrap max-h-36 overflow-y-auto">
            {parsedInfo.preview || '{}'}
          </pre>
          {toolCall.resultSummary && (
            <div className="text-[10px] font-mono text-zinc-500 border-t border-zinc-800/80 pt-1.5 truncate">
              결과: {toolCall.resultSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
