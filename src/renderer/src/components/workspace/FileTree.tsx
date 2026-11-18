import { useState } from 'react';
import {
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Folder,
  FolderClosed,
  FileCode2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { WorkspaceFileNode } from '@shared/types';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

interface TreeItemProps {
  node: WorkspaceFileNode;
  depth: number;
}

function TreeItem({ node, depth }: TreeItemProps) {
  const { selectedFilePath, dirtyFiles, selectFile } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(depth < 2);

  const paddingLeft = 10 + depth * 12;

  if (node.kind === 'directory') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          style={{ paddingLeft }}
          className="w-full py-1.5 pr-2 flex items-center gap-1.5 text-xs text-zinc-300 hover:bg-zinc-900 rounded-md cursor-pointer text-left"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
          )}
          {expanded ? (
            <Folder className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
          ) : (
            <FolderClosed className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {expanded &&
          node.children?.map((child) => (
            <TreeItem
              key={child.relativePath}
              node={child}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  const isSelected = selectedFilePath === node.relativePath;
  const isDirty = Boolean(dirtyFiles[node.relativePath]);

  return (
    <button
      type="button"
      onClick={() => void selectFile(node.relativePath)}
      style={{ paddingLeft: paddingLeft + 14 }}
      className={`w-full py-1.5 pr-2 flex items-center justify-between gap-2 text-xs rounded-md transition-colors cursor-pointer text-left ${
        isSelected
          ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FileCode2
          className={`w-3.5 h-3.5 shrink-0 ${
            isSelected ? 'text-indigo-400' : 'text-zinc-500'
          }`}
        />
        <span className="truncate">{node.name}</span>
      </div>
      {isDirty && (
        <span
          title="저장되지 않은 변경 사항"
          className="text-amber-400 font-bold leading-none shrink-0"
        >
          •
        </span>
      )}
    </button>
  );
}

export function FileTree() {
  const { rootPath, tree, openFolder, openSampleFolder, refreshTree } =
    useWorkspaceStore();

  const folderName = rootPath
    ? rootPath.split(/[/\\]/).filter(Boolean).pop() ?? rootPath
    : null;

  return (
    <div className="w-56 shrink-0 border-r border-zinc-800/80 bg-zinc-950/80 flex flex-col min-h-0">
      <div className="p-2.5 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Explorer
          </span>
          {rootPath && (
            <button
              type="button"
              onClick={() => void refreshTree()}
              title="파일 트리 새로고침"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => void openFolder()}
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-medium text-zinc-200 cursor-pointer"
          >
            <FolderOpen className="w-3 h-3 text-emerald-400" />
            <span>폴더 열기</span>
          </button>
          <button
            type="button"
            onClick={() => void openSampleFolder()}
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-medium text-zinc-200 cursor-pointer"
          >
            <FolderPlus className="w-3 h-3 text-indigo-400" />
            <span>샘플 폴더</span>
          </button>
        </div>

        {rootPath && (
          <div
            title={rootPath}
            className="px-2 py-1 rounded bg-zinc-900/70 border border-zinc-800/80 text-[11px] font-mono text-zinc-300 truncate"
          >
            /{folderName}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
        {!rootPath ? (
          <div className="p-3 text-center text-[11px] text-zinc-500 leading-relaxed">
            내 PC의 폴더를 열거나 [샘플 폴더]를 눌러 로컬 탐색기를 시작하세요.
          </div>
        ) : tree.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-zinc-500">
            비어 있는 폴더입니다.
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem key={node.relativePath} node={node} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
