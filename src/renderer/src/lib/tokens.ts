import type { ChatMessage } from '@shared/types';

export const MAX_CONTEXT_TOKENS = 524_288;

export type ContextSeverity = 'normal' | 'warning' | 'danger';

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  // 한국어·영문·코드 혼합 기준 경량 토큰 휴리스틱
  return Math.ceil(text.length * 0.75);
}

export function estimateContextTokens(
  systemPrompt: string,
  messages: ChatMessage[],
  draftInput = ''
): number {
  let total = estimateTextTokens(systemPrompt) + estimateTextTokens(draftInput);
  for (const msg of messages) {
    total += estimateTextTokens(msg.content) + 12;
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      total += estimateTextTokens(JSON.stringify(msg.toolCalls));
    }
  }
  return total;
}

export function clampMaxTokens(requestedMax: number, inputTokens: number): number {
  const remaining = Math.max(0, MAX_CONTEXT_TOKENS - inputTokens);
  if (remaining <= 0) return 0;
  if (remaining < 256) return remaining;
  return Math.max(256, Math.min(requestedMax, remaining));
}

export function getContextUsageMetrics(
  inputTokens: number,
  reservedOutputTokens: number
): {
  totalPlannedTokens: number;
  inputPercent: number;
  plannedPercent: number;
  severity: ContextSeverity;
} {
  const effectiveOutput = clampMaxTokens(reservedOutputTokens, inputTokens);
  const totalPlannedTokens = Math.min(
    MAX_CONTEXT_TOKENS,
    inputTokens + effectiveOutput
  );
  const inputPercent = Math.min(100, (inputTokens / MAX_CONTEXT_TOKENS) * 100);
  const plannedPercent = Math.min(
    100,
    (totalPlannedTokens / MAX_CONTEXT_TOKENS) * 100
  );

  let severity: ContextSeverity = 'normal';
  if (inputPercent >= 85) {
    severity = 'danger';
  } else if (inputPercent >= 60) {
    severity = 'warning';
  }

  return {
    totalPlannedTokens,
    inputPercent,
    plannedPercent,
    severity
  };
}
