import type {
  ChatMessage,
  ReasoningEffort,
  RunMode,
  ToolCallRecord,
  WorkspaceFileNode
} from '@shared/types';
import {
  applyUpdateFileReplacement,
  validateToolArgs
} from '@renderer/lib/workspaceToolUtils';
import { useAppStore } from '@renderer/store/useAppStore';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

export const MAX_AGENT_STEPS = 5;

let activeAgentAbortController: AbortController | null = null;

export function abortWorkspaceAgent(): void {
  activeAgentAbortController?.abort();
}

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
    const parsed = record.argumentsJson.trim()
      ? (JSON.parse(record.argumentsJson) as unknown)
      : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, output: '도구 인자는 JSON 객체여야 합니다.' };
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, output: '도구 인자 JSON 파싱에 실패했습니다.' };
  }

  const validated = validateToolArgs(record.name, args);
  if (!validated.ok) {
    return { ok: false, output: validated.error };
  }

  try {
    if (validated.toolName === 'list_files') {
      const tree = await window.exaoneAPI.listWorkspaceFiles(rootPath);
      const files = flattenTree(tree);
      return { ok: true, output: JSON.stringify({ files }) };
    }

    if (validated.toolName === 'read_file') {
      const content = await window.exaoneAPI.readWorkspaceFile(
        rootPath,
        validated.path
      );
      return { ok: true, output: content };
    }

    if (validated.toolName === 'write_file') {
      await window.exaoneAPI.writeWorkspaceFile(
        rootPath,
        validated.path,
        validated.content
      );
      await useWorkspaceStore
        .getState()
        .applyExternalWrite(validated.path, validated.content);
      return {
        ok: true,
        output: JSON.stringify({
          status: 'written',
          path: validated.path,
          bytes: validated.content.length
        })
      };
    }

    const current = await window.exaoneAPI.readWorkspaceFile(
      rootPath,
      validated.path
    );
    const updated = applyUpdateFileReplacement(
      current,
      validated.target,
      validated.replacement
    );
    if (!updated.ok) {
      return { ok: false, output: `${updated.error} (${validated.path})` };
    }

    await window.exaoneAPI.writeWorkspaceFile(
      rootPath,
      validated.path,
      updated.nextContent
    );
    await useWorkspaceStore
      .getState()
      .applyExternalWrite(validated.path, updated.nextContent);
    return {
      ok: true,
      output: JSON.stringify({ status: 'updated', path: validated.path })
    };
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

function stripIncompleteAssistantTurn(assistantMsgId: string): void {
  useWorkspaceStore.getState().setAgentMessages((prev) =>
    prev.flatMap((m) => {
      if (m.id !== assistantMsgId) return [m];
      if (!m.content && !(m.thinking ?? '')) return [];
      const { toolCalls: _dropped, ...rest } = m;
      return [rest];
    })
  );
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
      stripIncompleteAssistantTurn(assistantMsgId);
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
      if (chunkReqId !== requestId || settled) return;

      switch (chunk.type) {
        case 'thinking': {
          thinkingStart = thinkingStart ?? Date.now();
          const elapsed = Date.now() - thinkingStart;
          useWorkspaceStore.getState().setAgentMessages((prev) =>
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
          useWorkspaceStore.getState().setAgentMessages((prev) =>
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
            name: name ?? '',
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
          stripIncompleteAssistantTurn(assistantMsgId);
          fail(new Error(chunk.message));
          break;
        }
        case 'done': {
          if (chunk.finishReason === 'aborted' || signal.aborted) {
            stripIncompleteAssistantTurn(assistantMsgId);
            finish({ toolCalls: [], aborted: true });
            break;
          }
          const records = syncToolCallsToMessage();
          finish({
            toolCalls: records,
            aborted: false
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
        stripIncompleteAssistantTurn(assistantMsgId);
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
  signal?: AbortSignal;
}): Promise<void> {
  const wsStore = useWorkspaceStore.getState();
  const rootPath = wsStore.rootPath;
  if (!rootPath) {
    wsStore.setErrorMessage('먼저 로컬 워크스페이스 폴더를 열어 주세요.');
    return;
  }

  const controller = new AbortController();
  activeAgentAbortController = controller;
  const forwardExternalAbort = () => controller.abort();
  if (params.signal) {
    if (params.signal.aborted) {
      controller.abort();
    } else {
      params.signal.addEventListener('abort', forwardExternalAbort, {
        once: true
      });
    }
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
      if (controller.signal.aborted) break;

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
        agentStep: step
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
        signal: controller.signal
      });

      if (outcome.aborted || outcome.toolCalls.length === 0) {
        break;
      }

      // 도구 실행 및 결과 메시지 첨부 (중단 시 미실행 도구에 대한 취소 응답 보완)
      for (let idx = 0; idx < outcome.toolCalls.length; idx += 1) {
        const toolCall = outcome.toolCalls[idx];
        if (controller.signal.aborted) {
          const remainingCalls = outcome.toolCalls.slice(idx);
          const remainingIds = new Set(remainingCalls.map((tc) => tc.id));

          useWorkspaceStore.getState().setAgentMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id !== assistantMsgId || !msg.toolCalls) return msg;
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  remainingIds.has(tc.id)
                    ? {
                        ...tc,
                        status: 'error' as const,
                        resultSummary: '사용자에 의해 중지됨'
                      }
                    : tc
                )
              };
            });

            const cancelMessages: ChatMessage[] = remainingCalls.map((tc) => ({
              id: createId('ws_tool'),
              role: 'tool',
              toolCallId: tc.id,
              toolName: tc.name,
              content: JSON.stringify({ error: 'aborted_by_user' }),
              createdAt: Date.now()
            }));

            return [...updated, ...cancelMessages];
          });
          break;
        }

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

      if (step === MAX_AGENT_STEPS && !controller.signal.aborted) {
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
    params.signal?.removeEventListener('abort', forwardExternalAbort);
    if (activeAgentAbortController === controller) {
      activeAgentAbortController = null;
    }
    useWorkspaceStore.getState().setAgentExecutionState({
      isAgentRunning: false,
      agentStep: 0
    });
  }
}
