import type { StreamChunk, TokenUsage } from '@shared/types';

interface ExaoneDeltaToolCall {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ExaoneStreamPayload {
  choices?: Array<{
    delta?: {
      reasoning_content?: string | null;
      content?: string | null;
      tool_calls?: ExaoneDeltaToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  } | null;
  error?: {
    message?: string;
  };
}

function processSseLine(
  line: string,
  emit: (chunk: StreamChunk) => void,
  state: { finishReason?: string }
): 'done' | 'continue' {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return 'continue';
  }
  if (!trimmed.startsWith('data:')) {
    return 'continue';
  }

  const dataStr = trimmed.slice(5).trim();
  if (!dataStr) return 'continue';
  if (dataStr === '[DONE]') {
    return 'done';
  }

  try {
    const parsed = JSON.parse(dataStr) as ExaoneStreamPayload;

    if (parsed.error?.message) {
      emit({ type: 'error', message: parsed.error.message });
      return 'done';
    }

    const choice = parsed.choices?.[0];
    if (choice?.delta) {
      const { reasoning_content, content, tool_calls } = choice.delta;

      if (typeof reasoning_content === 'string' && reasoning_content.length > 0) {
        emit({ type: 'thinking', text: reasoning_content });
      }
      if (typeof content === 'string' && content.length > 0) {
        emit({ type: 'content', text: content });
      }
      if (Array.isArray(tool_calls)) {
        for (const tc of tool_calls) {
          emit({
            type: 'tool_call',
            delta: {
              index: tc.index ?? 0,
              id: tc.id,
              name: tc.function?.name,
              argumentsChunk: tc.function?.arguments
            }
          });
        }
      }
    }

    if (choice?.finish_reason) {
      state.finishReason = choice.finish_reason;
    }

    if (parsed.usage) {
      const usage: TokenUsage = {
        promptTokens: parsed.usage.prompt_tokens ?? 0,
        completionTokens: parsed.usage.completion_tokens ?? 0,
        reasoningTokens:
          parsed.usage.completion_tokens_details?.reasoning_tokens,
        totalTokens: parsed.usage.total_tokens ?? 0
      };
      emit({ type: 'usage', usage });
    }
  } catch {
    // 부분 JSON 또는 비표준 SSE 메타 라인 무시
  }

  return 'continue';
}

export async function parseExaoneSseStream(
  body: ReadableStream<Uint8Array>,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: { finishReason?: string } = {};

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const result = processSseLine(line, emit, state);
        if (result === 'done') {
          emit({ type: 'done', finishReason: state.finishReason ?? 'stop' });
          return;
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processSseLine(buffer, emit, state);
    }

    emit({
      type: 'done',
      finishReason: signal.aborted ? 'aborted' : (state.finishReason ?? 'stop')
    });
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
