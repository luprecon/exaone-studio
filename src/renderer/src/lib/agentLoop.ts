import type {
  ChatMessage,
  ReasoningEffort,
  RunMode,
  ToolCallRecord,
  WorkspaceFileNode
} from '@shared/types';
import { useAppStore } from '@renderer/store/useAppStore';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

export const MAX_AGENT_STEPS = 5;

export const WORKSPACE_TOOLS: Array<Record<string, unknown>> = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '현재 열린 워크스페이스 폴더의 파일 및 디렉터리 목록을 조회합니다.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '워크스페이스 내 특정 파일의 전체 텍스트 내용을 읽습니다.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '워크스페이스 루트 기준 상대 경로 (예: index.html)'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '워크스페이스 내 파일을 새로 생성하거나 전체 내용을 덮어씁니다.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '워크스페이스 루트 기준 상대 경로 (예: styles.css)'
          },
          content: {
            type: 'string',
            description: '파일에 기록할 전체 문자열 내용'
          }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_file',
      description: '기존 파일에서 지정한 문자열(target)을 찾아 replacement로 치환합니다.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '수정할 파일의 상대 경로'
          },
          target: {
            type: 'string',
            description: '기존 파일에서 정확히 일치하는 대상 문자열'
          },
          replacement: {
            type: 'string',
            description: '치환할 새 문자열'
          }
        },
        required: ['path', 'target', 'replacement'],
        additionalProperties: false
      }
    }
  }
];

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function flattenTree(nodes: WorkspaceFileNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      result.push(node.relativePath);
    } else if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

async function executeWorkspaceTool(
  rootPath: string,
  record: ToolCallRecord
): Promise<{ ok: boolean; output: string }> {
  let args: Record<string, unknown> = {};
  try {
    args = record.argumentsJson.trim()
      ? (JSON.parse(record.argumentsJson) as Record<string, unknown>)
      : {};
  } catch {
    return { ok: false, output: '도구 인자 JSON 파싱에 실패했습니다.' };
  }

  try {
    if (record.name === 'list_files') {
      const tree = await window.exaoneAPI.listWorkspaceFiles(rootPath);
      const files = flattenTree(tree);
      return { ok: true, output: JSON.stringify({ files }) };
    }

    if (record.name === 'read_file') {
      const path = String(args.path ?? '');
      if (!path) return { ok: false, output: 'path 인자가 비어 있습니다.' };
      const content = await window.exaoneAPI.readWorkspaceFile(rootPath, path);
      return { ok: true, output: content };
    }

    if (record.name === 'write_file') {
      const path = String(args.path ?? '');
      const content = String(args.content ?? '');
      if (!path) return { ok: false, output: 'path 인자가 비어 있습니다.' };
      await window.exaoneAPI.writeWorkspaceFile(rootPath, path, content);
      await useWorkspaceStore.getState().applyExternalWrite(path, content);
      return {
        ok: true,
        output: JSON.stringify({ status: 'written', path, bytes: content.length })
      };
    }

    if (record.name === 'update_file') {
      const path = String(args.path ?? '');
      const target = String(args.target ?? '');
      const replacement = String(args.replacement ?? '');
      if (!path || !target) {
        return { ok: false, output: 'path 또는 target 인자가 비어 있습니다.' };
      }

      const current = await window.exaoneAPI.readWorkspaceFile(rootPath, path);
      if (!current.includes(target)) {
        return {
          ok: false,
          output: `파일(${path})에서 대상 문자열을 찾을 수 없습니다.`
        };
      }
      const nextContent = current.split(target).join(replacement);
      await window.exaoneAPI.writeWorkspaceFile(rootPath, path, nextContent);
      await useWorkspaceStore.getState().applyExternalWrite(path, nextContent);
      return {
        ok: true,
        output: JSON.stringify({ status: 'updated', path })
      };
    }

    return { ok: false, output: `알 수 없는 도구입니다: ${record.name}` };
  } catch (err) {
    return {
      ok: false,
      output:
        err instanceof Error ? err.message : '도구 실행 중 오류가 발생했습니다.'
    };
  }
}

interface SingleStepOutcome {
  toolCalls: ToolCallRecord[];
  aborted: boolean;
}

async function runSingleAgentStep(options: {
  requestId: string;
  assistantMsgId: string;
  messages: ChatMessage[];
  runMode: RunMode;
  reasoningEffort: ReasoningEffort;
  scenarioId?: string;
  signal: AbortSignal;
}): Promise<SingleStepOutcome> {
  const {
    requestId,
    assistantMsgId,
    messages,
    runMode,
    reasoningEffort,
    scenarioId,
    signal
  } = options;

  const store = useWorkspaceStore.getState();
  const deltaMap = new Map<
    number,
    { id: string; name: string; argumentsJson: string }
  >();
  let thinkingStart: number | null = null;

  return new Promise<SingleStepOutcome>((resolve, reject) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;

    const cleanup = () => {
      unsubscribe();
      signal.removeEventListener('abort', onAbort);
    };

    const finish = (outcome: SingleStepOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onAbort = () => {
      void window.exaoneAPI.abortChatStream(requestId);
      finish({ toolCalls: [], aborted: true });
    };

    signal.addEventListener('abort', onAbort, { once: true });

    const syncToolCallsToMessage = () => {
      const records: ToolCallRecord[] = [...deltaMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, val]) => ({
          id: val.id,
          name: val.name,
          argumentsJson: val.argumentsJson,
          status: 'running'
        }));

      useWorkspaceStore.getState().setAgentMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, toolCalls: records } : m
        )
      );
      return records;
    };

    unsubscribe = window.exaoneAPI.onStreamChunk((chunkReqId, chunk) => {
      if (chunkReqId !== requestId) return;

      switch (chunk.type) {
        case 'thinking': {
          thinkingStart = thinkingStart ?? Date.now();
          const elapsed = Date.now() - thinkingStart;
          store.setAgentMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    thinking: (m.thinking ?? '') + chunk.text,
                    thinkingDurationMs: elapsed
                  }
                : m
            )
          );
          break;
        }
        case 'content': {
          store.setAgentMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + chunk.text }
                : m
            )
          );
          break;
        }
        case 'tool_call': {
          const { index, id, name, argumentsChunk } = chunk.delta;
          const current = deltaMap.get(index) ?? {
            id: id ?? createId('call'),
            name: name ?? 'write_file',
            argumentsJson: ''
          };
          if (id) current.id = id;
          if (name) current.name = name;
          if (argumentsChunk) current.argumentsJson += argumentsChunk;
          deltaMap.set(index, current);
          syncToolCallsToMessage();
          break;
        }
        case 'rate_limit': {
          useAppStore.getState().setRateLimit(chunk.info);
          break;
        }
        case 'error': {
          fail(new Error(chunk.message));
          break;
        }
        case 'done': {
          const records = syncToolCallsToMessage();
          finish({
            toolCalls: records,
            aborted: chunk.finishReason === 'aborted' || signal.aborted
          });
          break;
        }
        default:
          break;
      }
    });

    void window.exaoneAPI
      .startChatStream({
        requestId,
        runMode,
        model: 'k-exaone_v2.5',
        messages,
        reasoningEffort,
        temperature: 0.3,
        maxTokens: 16384,
        tools: WORKSPACE_TOOLS,
        scenarioId
      })
      .catch((err) => {
        fail(
          err instanceof Error ? err : new Error('에이전트 스트림 시작 실패')
        );
      });
  });
}

export async function runWorkspaceAgentLoop(params: {
  userPrompt: string;
  runMode: RunMode;
  reasoningEffort: ReasoningEffort;
  scenarioId?: string;
  signal: AbortSignal;
}): Promise<void> {
  const wsStore = useWorkspaceStore.getState();
  const rootPath = wsStore.rootPath;
  if (!rootPath) {
    wsStore.setErrorMessage('먼저 로컬 워크스페이스 폴더를 열어 주세요.');
    return;
  }

  const userMsg: ChatMessage = {
    id: createId('ws_user'),
    role: 'user',
    content: params.userPrompt.trim(),
    createdAt: Date.now()
  };

  wsStore.setErrorMessage(null);
  wsStore.setAgentMessages((prev) => [...prev, userMsg]);
  wsStore.setAgentExecutionState({ isAgentRunning: true, agentStep: 0 });

  const fileNames = flattenTree(useWorkspaceStore.getState().tree);
  const systemMsg: ChatMessage = {
    id: 'ws_system',
    role: 'system',
    content: [
      '당신은 EXAONE Workspace 코딩 에이전트입니다.',
      `현재 열린 로컬 폴더 파일 목록: ${fileNames.join(', ') || '(비어 있음)'}`,
      '필요할 때 list_files, read_file, write_file, update_file 도구를 호출하여 index.html, styles.css, app.js 등의 웹 파일을 생성/수정하고 간결한 한국어로 보고하세요.'
    ].join('\n'),
    createdAt: Date.now()
  };

  try {
    for (let step = 1; step <= MAX_AGENT_STEPS; step += 1) {
      if (params.signal.aborted) break;

      const requestId = createId('ws_req');
      const assistantMsgId = createId('ws_assistant');
      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        thinking: '',
        thinkingDurationMs: 0,
        createdAt: Date.now()
      };

      const historyBeforeStep = useWorkspaceStore.getState().agentMessages;
      useWorkspaceStore.getState().setAgentExecutionState({
        isAgentRunning: true,
        agentStep: step,
        activeAgentRequestId: requestId
      });
      useWorkspaceStore
        .getState()
        .setAgentMessages((prev) => [...prev, assistantPlaceholder]);

      const outcome = await runSingleAgentStep({
        requestId,
        assistantMsgId,
        messages: [systemMsg, ...historyBeforeStep],
        runMode: params.runMode,
        reasoningEffort: params.reasoningEffort,
        scenarioId: params.scenarioId,
        signal: params.signal
      });

      if (outcome.aborted || outcome.toolCalls.length === 0) {
        break;
      }

      // 도구 실행 및 결과 메시지 첨부
      for (const toolCall of outcome.toolCalls) {
        if (params.signal.aborted) break;
        const result = await executeWorkspaceTool(rootPath, toolCall);

        useWorkspaceStore.getState().setAgentMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantMsgId || !msg.toolCalls) return msg;
            return {
              ...msg,
              toolCalls: msg.toolCalls.map((tc) =>
                tc.id === toolCall.id
                  ? {
                      ...tc,
                      status: result.ok ? ('success' as const) : ('error' as const),
                      resultSummary: result.output.slice(0, 160)
                    }
                  : tc
              )
            };
          });

          const toolResultMsg: ChatMessage = {
            id: createId('ws_tool'),
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: result.output,
            createdAt: Date.now()
          };

          return [...updated, toolResultMsg];
        });
      }

      if (step === MAX_AGENT_STEPS) {
        useWorkspaceStore.getState().setAgentMessages((prev) => [
          ...prev,
          {
            id: createId('ws_limit'),
            role: 'assistant',
            content: `에이전트 안전 상한(최대 ${MAX_AGENT_STEPS}단계)에 도달해 작업을 종료했습니다.`,
            createdAt: Date.now()
          }
        ]);
      }
    }
  } catch (err) {
    useWorkspaceStore
      .getState()
      .setErrorMessage(
        err instanceof Error ? err.message : '에이전트 실행 중 오류가 발생했습니다.'
      );
  } finally {
    useWorkspaceStore.getState().setAgentExecutionState({
      isAgentRunning: false,
      agentStep: 0,
      activeAgentRequestId: null
    });
  }
}
