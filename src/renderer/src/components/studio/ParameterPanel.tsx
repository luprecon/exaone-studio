import { useMemo, useState } from 'react';
import {
  SlidersHorizontal,
  BrainCircuit,
  Code,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Braces,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import type { ReasoningEffort } from '@shared/types';
import { useStudioStore } from '@renderer/store/useStudioStore';
import {
  MAX_CONTEXT_TOKENS,
  clampMaxTokens,
  estimateContextTokens,
  getContextUsageMetrics
} from '@renderer/lib/tokens';

interface ParameterPanelProps {
  onOpenExportModal: () => void;
}

const EFFORT_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
  desc: string;
}> = [
  { value: 'low', label: 'low', desc: '신속 추론 · 경량 질의' },
  { value: 'high', label: 'high', desc: '균형 추론 · 실무 개발' },
  { value: 'max', label: 'max', desc: '심층 검증 · 기본 최대' }
];

const TOKEN_PRESETS = [4096, 8192, 16384, 32768];

const SAMPLE_JSON_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      action_items: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['summary', 'severity', 'action_items'],
    additionalProperties: false
  },
  null,
  2
);

export function ParameterPanel({ onOpenExportModal }: ParameterPanelProps) {
  const {
    sessions,
    activeSessionId,
    reasoningEffort,
    temperature,
    maxTokens,
    responseSchemaJson,
    draftInput,
    lastUsage,
    isStreaming,
    setReasoningEffort,
    setTemperature,
    setMaxTokens,
    setResponseSchemaJson
  } = useStudioStore();

  const [isSchemaOpen, setIsSchemaOpen] = useState(false);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const estimatedInputTokens = useMemo(() => {
    if (!activeSession) return 0;
    return estimateContextTokens(
      activeSession.systemPrompt,
      activeSession.messages,
      draftInput
    );
  }, [activeSession, draftInput]);

  const clampedMaxTokens = useMemo(
    () => clampMaxTokens(maxTokens, estimatedInputTokens),
    [maxTokens, estimatedInputTokens]
  );

  const usageMetrics = useMemo(
    () => getContextUsageMetrics(estimatedInputTokens, maxTokens),
    [estimatedInputTokens, maxTokens]
  );

  const schemaValidation = useMemo(() => {
    const trimmed = responseSchemaJson.trim();
    if (!trimmed) return { state: 'empty' as const };
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { state: 'invalid' as const };
      }
      return { state: 'valid' as const };
    } catch {
      return { state: 'invalid' as const };
    }
  }, [responseSchemaJson]);

  const currentEffortDesc =
    EFFORT_OPTIONS.find((opt) => opt.value === reasoningEffort)?.desc ?? '';

  const barColorClass =
    usageMetrics.severity === 'danger'
      ? 'bg-rose-500'
      : usageMetrics.severity === 'warning'
        ? 'bg-amber-500'
        : 'bg-indigo-500';

  return (
    <aside className="hidden md:flex w-80 shrink-0 border-l border-zinc-800/80 bg-zinc-950/70 flex-col min-h-0">
      <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
          <span>파라미터 제어</span>
        </div>
        <span className="text-[11px] font-mono text-indigo-300">
          k-exaone_v2.5
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {/* reasoning_effort 제어 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reasoning Effort</span>
            </label>
            <span className="text-[11px] text-zinc-400">{currentEffortDesc}</span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
            {EFFORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={isStreaming}
                onClick={() => setReasoningEffort(opt.value)}
                className={`py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer disabled:opacity-50 ${
                  reasoningEffort === opt.value
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            K-EXAONE 2.5는 상시 추론 모델로 low / high / max 3단계를 지원합니다.
          </p>
        </section>

        {/* Temperature 슬라이더 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-200">Temperature</span>
            <span className="font-mono text-zinc-300">
              {temperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={temperature}
            disabled={isStreaming}
            onChange={(e) => setTemperature(Number.parseFloat(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>정확·일관 (0.0)</span>
            <span>창의적 (1.5)</span>
          </div>
        </section>

        {/* Max Output Tokens */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-200">Max Tokens</span>
            <span className="font-mono text-zinc-300">
              {clampedMaxTokens.toLocaleString()}
              {clampedMaxTokens !== maxTokens && (
                <span className="text-[10px] text-amber-400 ml-1">
                  (클램핑됨)
                </span>
              )}
            </span>
          </div>

          <input
            type="range"
            min={1024}
            max={65536}
            step={1024}
            value={maxTokens}
            disabled={isStreaming}
            onChange={(e) => setMaxTokens(Number.parseInt(e.target.value, 10))}
            className="w-full accent-indigo-500 cursor-pointer"
          />

          <div className="grid grid-cols-4 gap-1">
            {TOKEN_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={isStreaming}
                onClick={() => setMaxTokens(preset)}
                className={`py-1 rounded border text-[10px] font-mono transition-colors cursor-pointer ${
                  maxTokens === preset
                    ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {preset / 1024}K
              </button>
            ))}
          </div>

          {reasoningEffort === 'max' && maxTokens < 4096 && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-[10px] text-amber-300 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                추론 토큰이 max_tokens에 포함됩니다. max 모드에서는 8K 이상 설정을 권장합니다.
              </span>
            </div>
          )}
        </section>

        {/* 512K 컨텍스트 토큰 사용량 바 */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-200">
              512K Context Window
            </span>
            <span className="font-mono text-zinc-400">
              {estimatedInputTokens.toLocaleString()} /{' '}
              {MAX_CONTEXT_TOKENS.toLocaleString()}
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex">
            <div
              className={`h-full transition-all duration-300 ${barColorClass}`}
              style={{ width: `${Math.max(1.5, usageMetrics.inputPercent)}%` }}
              title={`예상 입력: ${estimatedInputTokens.toLocaleString()} 토큰`}
            />
            <div
              className="h-full bg-indigo-500/25 transition-all duration-300"
              style={{
                width: `${Math.max(
                  0,
                  usageMetrics.plannedPercent - usageMetrics.inputPercent
                )}%`
              }}
              title={`예약 출력: ${clampedMaxTokens.toLocaleString()} 토큰`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>입력 점유 {usageMetrics.inputPercent.toFixed(1)}%</span>
            <span>출력 예약 포함 {usageMetrics.plannedPercent.toFixed(1)}%</span>
          </div>

          {lastUsage && (
            <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-1.5 text-[10px] font-mono text-zinc-400">
              <div>Prompt: {lastUsage.promptTokens.toLocaleString()}</div>
              <div>
                Reasoning:{' '}
                {(lastUsage.reasoningTokens ?? 0).toLocaleString()}
              </div>
              <div>
                Completion: {lastUsage.completionTokens.toLocaleString()}
              </div>
              <div className="text-zinc-200">
                Total: {lastUsage.totalTokens.toLocaleString()}
              </div>
            </div>
          )}
        </section>

        {/* Structured Output (JSON Schema) */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSchemaOpen((prev) => !prev)}
            className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 font-medium text-zinc-200">
              {isSchemaOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <Braces className="w-3.5 h-3.5 text-indigo-400" />
              <span>JSON Schema 출력</span>
            </div>

            {schemaValidation.state === 'valid' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                유효
              </span>
            )}
            {schemaValidation.state === 'invalid' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-rose-400">
                <XCircle className="w-3 h-3" />
                구문 오류
              </span>
            )}
          </button>

          {isSchemaOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/80 pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">
                  response_format.json_schema
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResponseSchemaJson(SAMPLE_JSON_SCHEMA)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    예시 채우기
                  </button>
                  {responseSchemaJson && (
                    <button
                      type="button"
                      onClick={() => setResponseSchemaJson('')}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      비우기
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={responseSchemaJson}
                onChange={(e) => setResponseSchemaJson(e.target.value)}
                rows={6}
                placeholder='{"type":"object","properties":{...}}'
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 resize-y"
              />
            </div>
          )}
        </section>
      </div>

      {/* 하단 코드 내보내기 버튼 */}
      <div className="p-3 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={onOpenExportModal}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
        >
          <Code className="w-3.5 h-3.5 text-indigo-400" />
          <span>코드 내보내기 (cURL / Python / TS)</span>
        </button>
      </div>
    </aside>
  );
}
