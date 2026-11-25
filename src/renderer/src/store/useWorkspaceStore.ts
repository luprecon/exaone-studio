import { create } from 'zustand';
import type { ChatMessage, WorkspaceFileNode } from '@shared/types';
import { normalizeWorkspaceRelPath } from '@renderer/lib/workspaceToolUtils';

const TEXT_CODE_EXT_RE =
  /\.(html?|tsx?|jsx?|mjs|cjs|css|scss|json|md|txt|py|ya?ml|xml|svg|sh|bat)$/i;

function findDefaultFilePath(nodes: WorkspaceFileNode[]): string | null {
  const flatFiles: string[] = [];
  const walk = (list: WorkspaceFileNode[]) => {
    for (const node of list) {
      if (node.kind === 'file') {
        flatFiles.push(node.relativePath);
      } else if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);

  if (flatFiles.includes('index.html')) return 'index.html';
  const textCandidate = flatFiles.find((file) => TEXT_CODE_EXT_RE.test(file));
  return textCandidate ?? flatFiles[0] ?? null;
}

interface WorkspaceState {
  rootPath: string | null;
  tree: WorkspaceFileNode[];
  selectedFilePath: string | null;
  fileContents: Record<string, string>;
  dirtyFiles: Record<string, boolean>;
  isSaving: boolean;
  previewRevision: number;
  errorMessage: string | null;

  agentMessages: ChatMessage[];
  isAgentRunning: boolean;
  agentStep: number;
  pendingAutoRun: { prompt: string; scenarioId?: string } | null;

  openFolder: () => Promise<boolean>;
  openSampleFolder: () => Promise<boolean>;
  refreshTree: () => Promise<void>;
  selectFile: (relativePath: string) => Promise<void>;
  updateFileDraft: (relativePath: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  applyExternalWrite: (relativePath: string, content: string) => Promise<void>;
  bumpPreviewRevision: () => void;
  setErrorMessage: (message: string | null) => void;

  setPendingAutoRun: (
    task: { prompt: string; scenarioId?: string } | null
  ) => void;
  setAgentMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  setAgentExecutionState: (patch: {
    isAgentRunning?: boolean;
    agentStep?: number;
  }) => void;
  resetAgentMessages: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  tree: [],
  selectedFilePath: null,
  fileContents: {},
  dirtyFiles: {},
  isSaving: false,
  previewRevision: 0,
  errorMessage: null,

  agentMessages: [],
  isAgentRunning: false,
  agentStep: 0,
  pendingAutoRun: null,

  openFolder: async () => {
    if (get().isAgentRunning) return false;
    try {
      const result = await window.exaoneAPI.openWorkspaceFolder();
      if (!result) return false;

      const defaultFile = findDefaultFilePath(result.tree);
      set({
        rootPath: result.rootPath,
        tree: result.tree,
        selectedFilePath: null,
        fileContents: {},
        dirtyFiles: {},
        errorMessage: null,
        previewRevision: get().previewRevision + 1
      });

      if (defaultFile) {
        await get().selectFile(defaultFile);
      }
      return true;
    } catch (err) {
      set({
        errorMessage:
          err instanceof Error ? err.message : '폴더를 여는 중 오류가 발생했습니다.'
      });
      return false;
    }
  },

  openSampleFolder: async () => {
    if (get().isAgentRunning) return false;
    try {
      const result = await window.exaoneAPI.openSampleWorkspace();
      const defaultFile = findDefaultFilePath(result.tree);
      set({
        rootPath: result.rootPath,
        tree: result.tree,
        selectedFilePath: null,
        fileContents: {},
        dirtyFiles: {},
        errorMessage: null,
        previewRevision: get().previewRevision + 1
      });

      if (defaultFile) {
        await get().selectFile(defaultFile);
      }
      return true;
    } catch (err) {
      set({
        errorMessage:
          err instanceof Error
            ? err.message
            : '샘플 워크스페이스를 여는 중 오류가 발생했습니다.'
      });
      return false;
    }
  },

  refreshTree: async () => {
    const { rootPath, dirtyFiles, fileContents, selectedFilePath } = get();
    if (!rootPath) return;
    try {
      const tree = await window.exaoneAPI.listWorkspaceFiles(rootPath);
      const nextContents: Record<string, string> = {};
      for (const [path, content] of Object.entries(fileContents)) {
        if (dirtyFiles[path]) {
          nextContents[path] = content;
        }
      }

      let nextSelected = selectedFilePath;
      if (nextSelected && !dirtyFiles[nextSelected]) {
        try {
          const freshContent = await window.exaoneAPI.readWorkspaceFile(
            rootPath,
            nextSelected
          );
          nextContents[nextSelected] = freshContent;
        } catch {
          nextSelected = null;
        }
      }

      set((state) => ({
        tree,
        selectedFilePath: nextSelected,
        fileContents: nextContents,
        errorMessage: null,
        previewRevision: state.previewRevision + 1
      }));
    } catch (err) {
      set({
        errorMessage:
          err instanceof Error
            ? err.message
            : '파일 목록을 갱신하는 중 오류가 발생했습니다.'
      });
    }
  },

  selectFile: async (relativePath) => {
    const { rootPath, fileContents } = get();
    if (!rootPath) return;

    const normalizedPath = normalizeWorkspaceRelPath(relativePath);
    if (!normalizedPath) return;

    if (normalizedPath in fileContents) {
      set({ selectedFilePath: normalizedPath, errorMessage: null });
      return;
    }

    try {
      const content = await window.exaoneAPI.readWorkspaceFile(
        rootPath,
        normalizedPath
      );
      set((state) => ({
        selectedFilePath: normalizedPath,
        fileContents: { ...state.fileContents, [normalizedPath]: content },
        errorMessage: null
      }));
    } catch (err) {
      set({
        errorMessage:
          err instanceof Error ? err.message : '파일을 읽는 중 오류가 발생했습니다.'
      });
    }
  },

  updateFileDraft: (relativePath, content) => {
    const normalizedPath = normalizeWorkspaceRelPath(relativePath);
    if (!normalizedPath) return;
    set((state) => ({
      fileContents: { ...state.fileContents, [normalizedPath]: content },
      dirtyFiles: { ...state.dirtyFiles, [normalizedPath]: true }
    }));
  },

  saveActiveFile: async () => {
    const { rootPath, selectedFilePath, fileContents } = get();
    if (!rootPath || !selectedFilePath) return;
    const content = fileContents[selectedFilePath] ?? '';

    set({ isSaving: true, errorMessage: null });
    try {
      await window.exaoneAPI.writeWorkspaceFile(
        rootPath,
        selectedFilePath,
        content
      );
      set((state) => {
        const nextDirty = { ...state.dirtyFiles };
        delete nextDirty[selectedFilePath];
        return {
          dirtyFiles: nextDirty,
          isSaving: false,
          previewRevision: state.previewRevision + 1
        };
      });
    } catch (err) {
      set({
        isSaving: false,
        errorMessage:
          err instanceof Error ? err.message : '파일 저장 중 오류가 발생했습니다.'
      });
    }
  },

  applyExternalWrite: async (relativePath, content) => {
    const { rootPath } = get();
    if (!rootPath) return;

    const normalizedPath = normalizeWorkspaceRelPath(relativePath);
    if (!normalizedPath) return;

    const tree = await window.exaoneAPI.listWorkspaceFiles(rootPath);
    set((state) => {
      const nextDirty = { ...state.dirtyFiles };
      delete nextDirty[normalizedPath];
      return {
        tree,
        selectedFilePath: normalizedPath,
        fileContents: { ...state.fileContents, [normalizedPath]: content },
        dirtyFiles: nextDirty,
        previewRevision: state.previewRevision + 1
      };
    });
  },

  bumpPreviewRevision: () =>
    set((state) => ({ previewRevision: state.previewRevision + 1 })),

  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setPendingAutoRun: (pendingAutoRun) => set({ pendingAutoRun }),

  setAgentMessages: (updater) =>
    set((state) => ({
      agentMessages:
        typeof updater === 'function' ? updater(state.agentMessages) : updater
    })),

  setAgentExecutionState: (patch) => set(patch),

  resetAgentMessages: () =>
    set({
      agentMessages: [],
      isAgentRunning: false,
      agentStep: 0
    })
}));
