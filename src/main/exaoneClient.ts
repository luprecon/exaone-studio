import type {
  ChatCompletionRequest,
  ChatMessage,
  RateLimitInfo,
  ReasoningEffort,
  StreamChunk
} from '@shared/types';
import { getStoredApiKey } from './keyStore';
import { parseExaoneSseStream } from './sseParser';

const EXAONE_API_ENDPOINT = 'https://api.exaone.ai/v1/chat/completions';
const MAX_CONTEXT_TOKENS = 524_288;
const ALLOWED_EFFORTS: ReadonlySet<ReasoningEffort> = new Set([
  'low',
  'high',
  'max'
]);

function parseOptionalHeaderInt(
  headers: Headers,
  name: string
): number | undefined {
  const raw = headers.get(name);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractRateLimitInfo(headers: Headers): RateLimitInfo | null {
  const info: RateLimitInfo = {
    minuteLimit: parseOptionalHeaderInt(headers, 'x-minute-rate-limit'),
    minuteRemaining: parseOptionalHeaderInt(
      headers,
      'x-minute-rate-limit-remaining'
    ),
    dayLimit: parseOptionalHeaderInt(headers, 'x-day-rate-limit'),
    dayRemaining: parseOptionalHeaderInt(headers, 'x-day-rate-limit-remaining'),
    retryAfterSeconds: parseOptionalHeaderInt(headers, 'retry-after')
  };

  const hasAnyValue = Object.values(info).some((v) => v !== undefined);
  return hasAnyValue ? info : null;
}

function estimateMessagesTokens(
  messages: ChatMessage[],
  tools?: Array<Record<string, unknown>>
): number {
  let chars = 0;
  for (const msg of messages) {
    chars += msg.content.length;
    if (msg.toolCalls) {
      chars += JSON.stringify(msg.toolCalls).length;
    }
  }
  if (tools && tools.length > 0) {
    chars += JSON.stringify(tools).length;
  }
  // 한국어·코드 혼합 입력 기준 보수적 토큰 추정
  return Math.ceil(chars * 0.75) + messages.length * 16;
}

function buildApiMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.argumentsJson
          }
        }))
      };
    }

    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        name: msg.toolName,
        content: msg.content
      };
    }

    return {
      role: msg.role,
      content: msg.content
    };
  });
}

function buildResponseFormat(
  schemaText?: string
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string } {
  if (!schemaText || !schemaText.trim()) {
    return { ok: true, value: undefined };
  }

  try {
    const parsed = JSON.parse(schemaText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'JSON Schema는 올바른 JSON 객체 형식이어야 합니다.'
      };
    }

    if ('schema' in parsed && 'name' in parsed) {
      return {
        ok: true,
        value: {
          type: 'json_schema',
          json_schema: parsed
        }
      };
    }

    return {
      ok: true,
      value: {
        type: 'json_schema',
        json_schema: {
          name: 'exaone_structured_output',
          strict: true,
          schema: parsed
        }
      }
    };
  } catch {
    return {
      ok: false,
      error: '우측 패널의 JSON Schema 구문이 유효한 JSON이 아닙니다.'
    };
  }
}

function formatHttpErrorMessage(status: number, bodyText: string): string {
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      detail = ` (${parsed.error.message})`;
    }
  } catch {
    if (bodyText.trim()) {
      detail = ` (${bodyText.trim().slice(0, 140)})`;
    }
  }

  if (status === 401 || status === 403) {
    return `API 키 인증에 실패했습니다(HTTP ${status}). 우측 상단 API Key 메뉴에서 키를 다시 확인해 주세요.${detail}`;
  }
  if (status === 429) {
    return `K-EXAONE 호출 한도(Rate Limit)를 초과했습니다(HTTP 429). 잠시 후 다시 시도해 주세요.${detail}`;
  }
  if (status === 400) {
    return `요청 파라미터 또는 컨텍스트 한도(524,288 토큰)를 확인해 주세요(HTTP 400).${detail}`;
  }
  return `K-EXAONE API 요청 중 오류가 발생했습니다(HTTP ${status}).${detail}`;
}

export async function runLiveExaoneStream(
  req: ChatCompletionRequest,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const apiKey = await getStoredApiKey();
  if (!apiKey) {
    emit({
      type: 'error',
      status: 401,
      message:
        '등록된 K-EXAONE API 키가 없습니다. 우측 상단 [API Key] 버튼에서 키를 먼저 저장해 주세요.'
    });
    return;
  }

  const schemaResult = buildResponseFormat(req.responseSchemaJson);
  if (!schemaResult.ok) {
    emit({ type: 'error', status: 400, message: schemaResult.error });
    return;
  }

  const estimatedInputTokens = estimateMessagesTokens(req.messages, req.tools);
  const availableForOutput = MAX_CONTEXT_TOKENS - estimatedInputTokens;
  if (availableForOutput < 256) {
    emit({
      type: 'error',
      status: 400,
      message: `예상 입력 토큰(${estimatedInputTokens.toLocaleString()})이 최대 컨텍스트(524,288)에 도달했습니다. 대화를 초기화하거나 입력을 줄여 주세요.`
    });
    return;
  }

  const clampedMaxTokens = Math.max(
    256,
    Math.min(req.maxTokens, availableForOutput)
  );
  const effort: ReasoningEffort = ALLOWED_EFFORTS.has(req.reasoningEffort)
    ? req.reasoningEffort
    : 'max';

  const body: Record<string, unknown> = {
    model: 'k-exaone_v2.5',
    messages: buildApiMessages(req.messages),
    reasoning_effort: effort,
    temperature: req.temperature,
    max_tokens: clampedMaxTokens,
    stream: true,
    stream_options: { include_usage: true }
  };

  if (schemaResult.value) {
    body.response_format = schemaResult.value;
  }

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }

  try {
    const response = await fetch(EXAONE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    const rateInfo = extractRateLimitInfo(response.headers);
    if (rateInfo) {
      emit({ type: 'rate_limit', info: rateInfo });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      emit({
        type: 'error',
        status: response.status,
        message: formatHttpErrorMessage(response.status, errorBody)
      });
      return;
    }

    if (!response.body) {
      emit({
        type: 'error',
        message: 'API 응답 스트림 본문이 비어 있습니다.'
      });
      return;
    }

    await parseExaoneSseStream(response.body, emit, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      emit({ type: 'done', finishReason: 'aborted' });
      return;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      emit({ type: 'done', finishReason: 'aborted' });
      return;
    }
    emit({
      type: 'error',
      message:
        err instanceof Error
          ? `네트워크 연결 실패: ${err.message}`
          : 'K-EXAONE 서버와 통신할 수 없습니다.'
    });
  }
}
