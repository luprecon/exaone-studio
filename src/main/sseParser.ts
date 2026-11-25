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
  message?: string;
}

interface ParserState {
  finishReason?: string;
  hadError: boolean;
  hadSseData: boolean;
  rawNonSse: string;
  eventDataLines: string[];
}

function dispatchSsePayload(
  dataStr: string,
  emit: (chunk: StreamChunk) => void,
  state: ParserState
): 'done' | 'error' | 'continue' {
  const trimmed = dataStr.trim();
  if (!trimmed) return 'continue';

  state.hadSseData = true;
  if (trimmed === '[DONE]') {
    return 'done';
  }

  try {
    const parsed = JSON.parse(trimmed) as ExaoneStreamPayload;

    if (parsed.error?.message) {
      state.hadError = true;
      emit({ type: 'error', message: parsed.error.message });
      return 'error';
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

function flushEventBuffer(
  emit: (chunk: StreamChunk) => void,
  state: ParserState
): 'done' | 'error' | 'continue' {
  if (state.eventDataLines.length === 0) return 'continue';
  const joined = state.eventDataLines.join('\n');
  state.eventDataLines = [];
  return dispatchSsePayload(joined, emit, state);
}

function processSseLine(
  line: string,
  emit: (chunk: StreamChunk) => void,
  state: ParserState
): 'done' | 'error' | 'continue' {
  const trimmed = line.trim();
  if (!trimmed) {
    return flushEventBuffer(emit, state);
  }
  if (trimmed.startsWith(':')) {
    return 'continue';
  }
  if (!trimmed.startsWith('data:')) {
    if (!state.hadSseData && state.rawNonSse.length < 4096) {
      state.rawNonSse += (state.rawNonSse ? '\n' : '') + line;
    }
    return 'continue';
  }

  const dataPart = trimmed.slice(5).trim();
  state.hadSseData = true;
  if (!dataPart) return 'continue';

  state.eventDataLines.push(dataPart);

  // 단일 라인 JSON/종료 센티넬은 빈 줄 전이라도 즉시 디스패치해 스트리밍 지연 최소화
  if (state.eventDataLines.length === 1) {
    if (dataPart === '[DONE]') {
      state.eventDataLines = [];
      return 'done';
    }
    try {
      JSON.parse(dataPart);
      state.eventDataLines = [];
      return dispatchSsePayload(dataPart, emit, state);
    } catch {
      // 멀티라인 data: 이벤트일 수 있으므로 후속 라인 또는 빈 줄까지 버퍼링
    }
  }

  return 'continue';
}

function tryFormatNonSseError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as ExaoneStreamPayload;
    const msg = parsed?.error?.message ?? parsed?.message;
    if (typeof msg === 'string' && msg.trim()) {
      return msg.trim();
    }
  } catch {
    // 일반 텍스트 본문 처리
  }
  return `예상치 못한 비-SSE 응답을 수신했습니다: ${trimmed.slice(0, 200)}`;
}

export async function parseExaoneSseStream(
  body: ReadableStream<Uint8Array>,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: ParserState = {
    hadError: false,
    hadSseData: false,
    rawNonSse: '',
    eventDataLines: []
  };

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const result = processSseLine(line, emit, state);
        if (result === 'error') {
          return;
        }
        if (result === 'done') {
          emit({ type: 'done', finishReason: state.finishReason ?? 'stop' });
          return;
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const tailResult = processSseLine(buffer, emit, state);
      if (tailResult === 'error') return;
      if (tailResult === 'done') {
        emit({ type: 'done', finishReason: state.finishReason ?? 'stop' });
        return;
      }
    }

    const flushed = flushEventBuffer(emit, state);
    if (flushed === 'error') return;
    if (flushed === 'done') {
      emit({ type: 'done', finishReason: state.finishReason ?? 'stop' });
      return;
    }

    if (!signal.aborted && !state.hadSseData && !state.hadError) {
      const nonSseErr = tryFormatNonSseError(state.rawNonSse);
      if (nonSseErr) {
        emit({ type: 'error', message: nonSseErr });
        return;
      }
    }

    emit({
      type: 'done',
      finishReason: signal.aborted ? 'aborted' : (state.finishReason ?? 'stop')
    });
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
