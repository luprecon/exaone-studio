import { useEffect, useRef } from 'react';
import type * as monacoType from 'monaco-editor';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Save, FileCode2, FolderOpen, Eye } from 'lucide-react';
import { ensureMonacoSetup } from '@renderer/lib/monacoSetup';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

ensureMonacoSetup();

interface CodeEditorPaneProps {
  isPreviewVisible?: boolean;
  onTogglePreview?: () => void;
}

function inferLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext';
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'py':
      return 'python';
    case 'yml':
    case 'yaml':
      return 'yaml';
    default:
      return 'plaintext';
  }
}

export function CodeEditorPane({
  isPreviewVisible = false,
  onTogglePreview
}: CodeEditorPaneProps) {
  const {
    rootPath,
    selectedFilePath,
    fileContents,
    dirtyFiles,
    isSaving,
    updateFileDraft,
    saveActiveFile,
    openSampleFolder
  } = useWorkspaceStore();

  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoType | null>(null);
  const prevRootRef = useRef<string | null>(rootPath);

  useEffect(() => {
    if (prevRootRef.current && prevRootRef.current !== rootPath) {
      const activeModel = editorRef.current?.getModel();
      monacoRef.current?.editor.getModels().forEach((model) => {
        if (model !== activeModel) {
          model.dispose();
        }
      });
    }
    prevRootRef.current = rootPath;
  }, [rootPath]);

  const isMac =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
  const saveShortcutLabel = isMac ? '⌘S' : 'Ctrl+S';

  const currentContent = selectedFilePath
    ? (fileContents[selectedFilePath] ?? '')
    : '';
  const isDirty = selectedFilePath
    ? Boolean(dirtyFiles[selectedFilePath])
    : false;
  const language = inferLanguage(selectedFilePath);
  const scopedModelPath =
    rootPath && selectedFilePath
      ? `workspace_${encodeURIComponent(rootPath)}/${selectedFilePath}`
      : undefined;

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => {
        void useWorkspaceStore.getState().saveActiveFile();
      }
    );
  };

  if (!rootPath || !selectedFilePath) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <FileCode2 className="w-6 h-6 text-zinc-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-zinc-200">
            편집할 파일을 선택하세요
          </h3>
          <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
            좌측 Explorer에서 로컬 폴더를 열거나 샘플 폴더를 실행해 Monaco 코드 에디터로 편집·저장할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!rootPath && (
            <button
              type="button"
              onClick={() => void openSampleFolder()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>샘플 프로젝트 열기</span>
            </button>
          )}
          {rootPath && onTogglePreview && (
            <button
              type="button"
              onClick={onTogglePreview}
              className="xl:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isPreviewVisible ? '프리뷰 닫기' : '프리뷰 열기'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-zinc-950">
      <div className="h-10 shrink-0 px-3 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-mono text-zinc-200 truncate">
            {selectedFilePath}
          </span>
          {isDirty && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] text-amber-300 shrink-0">
              수정됨
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onTogglePreview && (
            <button
              type="button"
              onClick={onTogglePreview}
              className={`xl:hidden flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                isPreviewVisible
                  ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                  : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <Eye className="w-3 h-3 text-indigo-400" />
              <span>프리뷰</span>
            </button>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            {language}
          </span>
          <button
            type="button"
            disabled={!isDirty || isSaving}
            onClick={() => void saveActiveFile()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-[11px] font-medium text-white transition-colors cursor-pointer"
          >
            <Save className="w-3 h-3" />
            <span>
              {isSaving ? '저장 중...' : `저장 (${saveShortcutLabel})`}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          theme="vs-dark"
          path={scopedModelPath}
          language={language}
          value={currentContent}
          onChange={(val) => updateFileDraft(selectedFilePath, val ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            tabSize: 2,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12 }
          }}
        />
      </div>
    </div>
  );
}
