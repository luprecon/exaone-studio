import type { ChatMessage, ReasoningEffort } from '@shared/types';

export const MAX_CONTEXT_TOKENS = 524_288;
export const ALLOWED_EFFORTS: ReadonlySet<ReasoningEffort> = new Set([
  'low',
  'high',
  'max'
]);

export function estimateMessagesTokens(
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

export function buildApiMessages(
  messages: ChatMessage[]
): Array<Record<string, unknown>> {
  // tool_call_id 매칭 테이블을 먼저 수집해 중단/미완성 tool_calls로 인한 400 오류 방지
  const availableToolReplyIds = new Set<string>();
  for (const msg of messages) {
    if (
      msg.role === 'tool' &&
      typeof msg.toolCallId === 'string' &&
      msg.toolCallId.trim().length > 0
    ) {
      availableToolReplyIds.add(msg.toolCallId);
    }
  }

  const keptToolCallIds = new Set<string>();
  const apiMessages: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const matchedCalls = (msg.toolCalls ?? []).filter(
        (tc) =>
          typeof tc.id === 'string' &&
          tc.id.trim().length > 0 &&
          typeof tc.name === 'string' &&
          tc.name.trim().length > 0 &&
          availableToolReplyIds.has(tc.id)
      );

      if (matchedCalls.length > 0) {
        for (const tc of matchedCalls) {
          keptToolCallIds.add(tc.id);
        }
        apiMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: matchedCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.argumentsJson || '{}'
            }
          }))
        });
      } else if (msg.content.length > 0) {
        apiMessages.push({
          role: 'assistant',
          content: msg.content
        });
      }
      continue;
    }

    if (msg.role === 'tool') {
      if (msg.toolCallId && keptToolCallIds.has(msg.toolCallId)) {
        apiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          name: msg.toolName,
          content: msg.content
        });
      }
      continue;
    }

    apiMessages.push({
      role: msg.role,
      content: msg.content
    });
  }

  return apiMessages;
}

export function buildResponseFormat(
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

export function sanitizeGenerationParams(
  temperature: number,
  maxTokens: number,
  availableForOutput: number
): { temperature: number; maxTokens: number } {
  const safeTemperature =
    typeof temperature === 'number' && Number.isFinite(temperature)
      ? Math.min(2, Math.max(0, temperature))
      : 0.6;

  const requestedMax =
    typeof maxTokens === 'number' && Number.isFinite(maxTokens)
      ? Math.floor(maxTokens)
      : 4096;

  const safeAvailable = Math.max(1, Math.floor(availableForOutput));
  const safeMaxTokens =
    safeAvailable < 256
      ? Math.max(1, Math.min(requestedMax, safeAvailable))
      : Math.min(Math.max(256, requestedMax), safeAvailable);

  return {
    temperature: safeTemperature,
    maxTokens: safeMaxTokens
  };
}
