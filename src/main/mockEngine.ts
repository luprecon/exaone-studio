import type {
  ChatCompletionRequest,
  ReasoningEffort,
  StreamChunk
} from '@shared/types';

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function splitIntoChunks(text: string, minSize: number, maxSize: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const span = minSize + ((cursor * 7) % Math.max(1, maxSize - minSize + 1));
    chunks.push(text.slice(cursor, cursor + span));
    cursor += span;
  }
  return chunks;
}

function buildThinkingByEffort(
  effort: ReasoningEffort,
  userPrompt: string,
  hasSchema: boolean
): string {
  const promptPreview =
    userPrompt.length > 72 ? `${userPrompt.slice(0, 72)}...` : userPrompt;

  if (effort === 'low') {
    return [
      `1. 사용자 요청 파악: "${promptPreview}"`,
      `2. 핵심 답변 구조 결정: 요약 설명 및 바로 실행 가능한 코드 예시 위주 구성`,
      hasSchema
        ? `3. 지정된 JSON Schema 형식 준수 검증`
        : `3. 간결한 Markdown 형식으로 즉시 답변 생성`
    ].join('\n');
  }

  if (effort === 'high') {
    return [
      `[1단계: 의도 및 기술 요구사항 분석]`,
      `- 핵심 질의: "${promptPreview}"`,
      `- K-EXAONE 2.5 추론 깊이(high) 적용: 문제 원인, 해결 아키텍처, 구현 예제를 균형 있게 도출`,
      ``,
      `[2단계: 설계 검증 및 엣지 케이스 점검]`,
      `- 비동기 스트림 중단, 리소스 해제, 경계 조건(null/빈 입력) 누락 여부 확인`,
      hasSchema
        ? `- 응답 포맷 검증: response_format.json_schema 구조와 필드 타입 정합성 점검`
        : `- 가독성 최적화: 단계별 설명 → 타입/코드 블록 → 실전 주의사항 순으로 정렬`,
      ``,
      `[3단계: 최종 답변 초안 확정]`,
      `- 불필요한 추상화를 줄이고 즉시 프로젝트에 반영 가능한 명확한 코드 제시`
    ].join('\n');
  }

  return [
    `[Deep Reasoning — Effort: MAX]`,
    `1. 문제 정의 및 제약 조건 분해`,
    `   - 대상 입력: "${promptPreview}"`,
    `   - 요구 품질 기준: 프로덕션 안전성, 시간/공간 복잡도, 오류 복구 시나리오까지 전수 검증`,
    ``,
    `2. 대안 비교 및 반례(Counter-Example) 검증`,
    `   - 접근 A(단순 구현): 작성 속도는 빠르나 동시 요청 경합·메모리 누수 위험 존재`,
    `   - 접근 B(구조화 패턴): AbortSignal·락/큐·백프레셔 제어를 결합해 장애 전파 차단`,
    `   - 반례 점검: 네트워크 단절 직후 재시도 시 중복 실행 여부, 대용량 입력(512K 근접) 시 타임아웃 여부 검증`,
    ``,
    `3. 토큰 예산 및 출력 무결성 검증`,
    `   - K-EXAONE 2.5 특성상 max_tokens 한도 내 reasoning_content 포함 계산 확인`,
    hasSchema
      ? `   - 엄격 JSON Schema 출력 모드 활성화: 마크다운 코드펜스 없이 순수 JSON 객체 직렬화 보장`
      : `   - 최종 응답 섹션: 핵심 진단 → 아키텍처 다이어그램/흐름 → 실전 코드 → 검증 체크리스트 구성`
  ].join('\n');
}

function buildContentResponse(req: ChatCompletionRequest): string {
  const lastUserMessage =
    [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lower = lastUserMessage.toLowerCase();

  if (req.responseSchemaJson && req.responseSchemaJson.trim().length > 0) {
    return JSON.stringify(
      {
        model: 'k-exaone_v2.5',
        reasoning_effort: req.reasoningEffort,
        summary: `요청("${lastUserMessage.slice(0, 40)}")에 대한 구조화 JSON 응답`,
        key_points: [
          'K-EXAONE 2.5 Structured Outputs 시뮬레이션 결과',
          '추론 과정(reasoning_content)과 최종 JSON 페이로드 분리 처리',
          '스키마 필드 타입 및 필수 항목 검증 완료'
        ],
        confidence: req.reasoningEffort === 'max' ? 0.98 : 0.91
      },
      null,
      2
    );
  }

  if (lower.includes('sse') || lower.includes('asynciterable') || lower.includes('스트림')) {
    return `### TypeScript \`AsyncIterable\` 기반 SSE 안전 소비 패턴

K-EXAONE 2.5처럼 추론 토큰(\`reasoning_content\`)과 본문(\`content\`)이 청크 단위로 스트리밍될 때는 **라인 버퍼링 + \`AbortSignal\` 연동**이 핵심입니다.

\`\`\`ts
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        yield payload;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
\`\`\`

- **불완전 청크 방어:** \`buffer = lines.pop() ?? ''\`로 경계에서 잘린 JSON 손실을 방지합니다.
- **리소스 누수 차단:** \`finally\` 블록에서 \`reader.cancel()\`을 호출해 중지 버튼 클릭 시 즉시 연결을 정리합니다.`;
  }

  if (lower.includes('cache') || lower.includes('동시성') || lower.includes('레이스')) {
    return `### Cache Stampede 원인 및 Single-Flight 해결 패턴

동시에 수백 개의 요청이 만료된 캐시 키를 조회할 때 모두 DB/원본 API를 중복 호출하는 현상이 **Cache Stampede**입니다.

#### 1. 권장 해결책: In-Flight Promise 공유(Single-Flight)
\`\`\`ts
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrLoad<T>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = loader().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, task);
  return task;
}
\`\`\`

#### 2. 추가 방어 전략 (\`reasoning_effort: ${req.reasoningEffort}\`)
- **Soft TTL + 백그라운드 갱신:** 만료 직전 백그라운드에서 1회만 선제 갱신
- **Jitter 적용:** 동일 만료 시각 집중을 막기 위해 TTL에 \`±10%\` 무작위 편차 부여`;
  }

  if (lower.includes('로그') || lower.includes('512k') || lower.includes('체크리스트')) {
    return `### 대용량(512K) 장애 로그 근본 원인 추적 체크리스트

1. **요청 경계 파악 (\`Trace ID\` 기준 정렬)**
   - 최초 \`HTTP 5xx\` / 타임아웃 발생 타임스탬프 이전 30초 구간 추출
2. **자원 고갈 신호 탐색**
   - DB 커넥션 풀 대기 시간 급증, 이벤트 루프 지연(\`Event Loop Lag\`), OOM 재시작 여부 대조
3. **상·하위 마이크로서비스 전파 확인**
   - 재시도 폭풍(Retry Storm)으로 인한 연쇄 장애 구간 분리
4. **재발 방지 패치 검증**
   - 서킷 브레이커 임계치 및 백오프(Exponential Backoff + Jitter) 설정 점검`;
  }

  return `### K-EXAONE 2.5 Mock 응답 (\`reasoning_effort: ${req.reasoningEffort}\`)

입력하신 질문 **"${lastUserMessage.slice(0, 80)}${lastUserMessage.length > 80 ? '...' : ''}"**에 대한 Demo Mode 시뮬레이션 응답입니다.

- **스트림 분리 구조:** 상단 \`Thinking...\` 아코디언은 모델의 \`delta.reasoning_content\`를, 본 영역은 \`delta.content\`를 실시간 분리 렌더링합니다.
- **추론 깊이 반영:** 현재 설정된 \`${req.reasoningEffort}\` 단계에 맞춰 추론 과정의 상세도와 소요 시간이 동적으로 조절되었습니다.
- **다음 단계:** 우측 상단에서 \`Live API\`로 전환하고 API 키를 등록하면 실제 K-EXAONE 2.5 서버 응답과 동일 UI로 바로 전환됩니다.`;
}

export async function runMockChatStream(
  req: ChatCompletionRequest,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const lastUserMessage =
    [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hasSchema = Boolean(
    req.responseSchemaJson && req.responseSchemaJson.trim().length > 0
  );

  const thinkingText = buildThinkingByEffort(
    req.reasoningEffort,
    lastUserMessage,
    hasSchema
  );
  const contentText = buildContentResponse(req);

  const delayPerThinkingChunk =
    req.reasoningEffort === 'max' ? 42 : req.reasoningEffort === 'high' ? 32 : 22;

  try {
    for (const piece of splitIntoChunks(thinkingText, 8, 18)) {
      if (signal.aborted) return;
      emit({ type: 'thinking', text: piece });
      await sleepWithAbort(delayPerThinkingChunk, signal);
    }

    await sleepWithAbort(120, signal);

    for (const piece of splitIntoChunks(contentText, 10, 24)) {
      if (signal.aborted) return;
      emit({ type: 'content', text: piece });
      await sleepWithAbort(22, signal);
    }

    const promptTokens = Math.max(
      120,
      req.messages.reduce((acc, m) => acc + Math.ceil(m.content.length * 0.65), 0)
    );
    const reasoningTokens = Math.ceil(thinkingText.length * 0.7);
    const contentTokens = Math.ceil(contentText.length * 0.7);
    const completionTokens = reasoningTokens + contentTokens;

    emit({
      type: 'usage',
      usage: {
        promptTokens,
        completionTokens,
        reasoningTokens,
        totalTokens: promptTokens + completionTokens
      }
    });
    emit({ type: 'done', finishReason: 'stop' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      emit({ type: 'done', finishReason: 'aborted' });
      return;
    }
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : 'Mock 스트림 실행 중 오류가 발생했습니다.'
    });
  }
}
