import type {
  ChatCompletionRequest,
  ReasoningEffort,
  StreamChunk,
  ToolCallDelta
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

async function emitToolCallStream(
  index: number,
  id: string,
  name: string,
  argsObj: Record<string, unknown>,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const argsJson = JSON.stringify(argsObj);
  const firstDelta: ToolCallDelta = {
    index,
    id,
    name,
    argumentsChunk: ''
  };
  emit({ type: 'tool_call', delta: firstDelta });

  for (const piece of splitIntoChunks(argsJson, 32, 72)) {
    if (signal.aborted) return;
    emit({
      type: 'tool_call',
      delta: {
        index,
        argumentsChunk: piece
      }
    });
    await sleepWithAbort(12, signal);
  }
}

function buildWorkspaceMockArtifacts(
  userPrompt: string,
  scenarioId?: string
): Array<{
  tool: 'write_file' | 'update_file';
  args: Record<string, unknown>;
}> {
  const lower = userPrompt.toLowerCase();
  const isTodoOrNote =
    scenarioId !== 'scenario-workspace-dashboard' &&
    (lower.includes('할일') ||
      lower.includes('todo') ||
      lower.includes('메모') ||
      lower.includes('체크리스트'));

  if (isTodoOrNote) {
    return [
      {
        tool: 'write_file',
        args: {
          path: 'index.html',
          content: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EXAONE Task Planner</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <header class="top">
        <span class="pill">K-EXAONE Agent Built</span>
        <h1>스마트 작업 플래너</h1>
      </header>
      <form id="todo-form" class="composer">
        <input id="todo-input" type="text" placeholder="새 작업을 입력하세요..." required />
        <button type="submit">추가</button>
      </form>
      <ul id="todo-list" class="list"></ul>
      <footer class="stats" id="todo-stats">남은 작업 0건</footer>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`
        }
      },
      {
        tool: 'write_file',
        args: {
          path: 'styles.css',
          content: `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #09090b;
  color: #f4f4f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.shell {
  width: min(460px, 92vw);
  padding: 24px;
  border-radius: 16px;
  background: #18181b;
  border: 1px solid #27272a;
}
.pill {
  display: inline-block;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(16, 185, 129, 0.3);
}
h1 { margin: 10px 0 16px; font-size: 20px; }
.composer { display: flex; gap: 8px; margin-bottom: 14px; }
.composer input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #3f3f46;
  background: #09090b;
  color: #f4f4f5;
}
.composer button {
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: #4f46e5;
  color: white;
  font-weight: 600;
  cursor: pointer;
}
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  background: #09090b;
  border: 1px solid #27272a;
  font-size: 13px;
}
.item.done span { text-decoration: line-through; color: #71717a; }
.item button {
  border: none;
  background: transparent;
  color: #a1a1aa;
  cursor: pointer;
}
.stats { margin-top: 14px; font-size: 12px; color: #a1a1aa; }
`
        }
      },
      {
        tool: 'write_file',
        args: {
          path: 'app.js',
          content: `const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const stats = document.getElementById('todo-stats');

const items = [
  { text: 'K-EXAONE 2.5 추론 파라미터 테스트', done: true },
  { text: '로컬 파일 에이전트 Tool Call 확인', done: false }
];

function render() {
  if (!list || !stats) return;
  list.innerHTML = '';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = item.done ? 'item done' : 'item';
    const label = document.createElement('span');
    label.textContent = item.text;
    label.style.cursor = 'pointer';
    label.onclick = () => {
      items[idx].done = !items[idx].done;
      render();
    };
    const del = document.createElement('button');
    del.textContent = '삭제';
    del.onclick = () => {
      items.splice(idx, 1);
      render();
    };
    li.append(label, del);
    list.appendChild(li);
  });
  const remaining = items.filter((i) => !i.done).length;
  stats.textContent = \`남은 작업 \${remaining}건 / 전체 \${items.length}건\`;
}

if (form && input) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    items.unshift({ text: val, done: false });
    input.value = '';
    render();
  });
}

render();
`
        }
      }
    ];
  }

  return [
    {
      tool: 'write_file',
      args: {
        path: 'index.html',
        content: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EXAONE Token &amp; Latency Monitor</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="dashboard">
      <header class="header">
        <div>
          <span class="tag">K-EXAONE 2.5 Telemetry</span>
          <h1>실시간 추론·토큰 모니터링</h1>
        </div>
        <div class="actions">
          <select id="effort-filter">
            <option value="ALL">전체 Effort</option>
            <option value="MAX">MAX</option>
            <option value="HIGH">HIGH</option>
            <option value="LOW">LOW</option>
          </select>
          <button id="simulate-btn" type="button">요청 시뮬레이션</button>
        </div>
      </header>

      <section class="kpis">
        <article class="kpi-card">
          <span class="label">Context Window</span>
          <strong id="kpi-context">248,400 / 524,288</strong>
          <div class="bar"><div id="bar-fill" style="width: 47%"></div></div>
        </article>
        <article class="kpi-card">
          <span class="label">Reasoning Effort</span>
          <strong id="kpi-effort">MAX</strong>
          <span class="sub" id="kpi-latency">평균 2.18s 추론</span>
        </article>
        <article class="kpi-card">
          <span class="label">Daily Quota Left</span>
          <strong id="kpi-quota">92 / 100</strong>
          <span class="sub" id="kpi-status">BYOK 로컬 보호 활성</span>
        </article>
      </section>

      <section class="panel">
        <h2>최근 추론 로그</h2>
        <ul id="log-list" class="logs"></ul>
      </section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`
      }
    },
    {
      tool: 'write_file',
      args: {
        path: 'styles.css',
        content: `* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 20px;
  min-height: 100vh;
  background: radial-gradient(circle at top right, #1e1b4b 0%, #09090b 55%);
  color: #f4f4f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.dashboard { max-width: 720px; margin: 0 auto; display: grid; gap: 16px; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.actions { display: flex; gap: 8px; align-items: center; }
select {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #3f3f46;
  background: #18181b;
  color: #f4f4f5;
  font-size: 12px;
}
.tag {
  display: inline-block;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.16);
  border: 1px solid rgba(99, 102, 241, 0.35);
}
h1 { margin: 8px 0 0; font-size: 20px; }
button {
  padding: 9px 14px;
  border: none;
  border-radius: 10px;
  background: #4f46e5;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
button:hover { background: #6366f1; }
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.kpi-card, .panel {
  padding: 16px;
  border-radius: 14px;
  background: rgba(24, 24, 27, 0.88);
  border: 1px solid #27272a;
}
.label { display: block; font-size: 11px; color: #a1a1aa; }
.kpi-card strong { display: block; margin-top: 6px; font-size: 16px; }
.sub { display: block; margin-top: 6px; font-size: 11px; color: #34d399; }
.bar {
  margin-top: 10px;
  height: 7px;
  border-radius: 999px;
  background: #27272a;
  overflow: hidden;
}
.bar > div { height: 100%; background: linear-gradient(90deg, #6366f1, #10b981); transition: width 0.3s ease; }
.panel h2 { margin: 0 0 10px; font-size: 14px; color: #e4e4e7; }
.logs { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.logs li {
  padding: 9px 12px;
  border-radius: 10px;
  background: #09090b;
  border: 1px solid #27272a;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
`
      }
    },
    {
      tool: 'write_file',
      args: {
        path: 'app.js',
        content: `const btn = document.getElementById('simulate-btn');
const filterSelect = document.getElementById('effort-filter');
const contextEl = document.getElementById('kpi-context');
const barFill = document.getElementById('bar-fill');
const effortEl = document.getElementById('kpi-effort');
const latencyEl = document.getElementById('kpi-latency');
const quotaEl = document.getElementById('kpi-quota');
const logList = document.getElementById('log-list');

const efforts = ['LOW', 'HIGH', 'MAX'];
let quota = 92;
let step = 0;

const history = [
  { mode: 'MAX', tokens: '248,400', latency: '2.18s' },
  { mode: 'HIGH', tokens: '42,180', latency: '1.35s' },
  { mode: 'LOW', tokens: '8,420', latency: '0.49s' }
];

function renderLogs() {
  if (!logList) return;
  const activeFilter = filterSelect ? filterSelect.value : 'ALL';
  const filtered =
    activeFilter === 'ALL'
      ? history
      : history.filter((item) => item.mode === activeFilter);

  logList.innerHTML = filtered
    .slice(0, 6)
    .map(
      (item) =>
        \`<li><span>[\${item.mode}] 토큰 \${item.tokens}</span><span style="color:#a5b4fc">\${item.latency}</span></li>\`
    )
    .join('');
}

if (filterSelect) {
  filterSelect.addEventListener('change', renderLogs);
}

if (btn) {
  btn.addEventListener('click', () => {
    step += 1;
    quota = Math.max(1, quota - 1);
    const mode = efforts[step % efforts.length];
    const used = 35000 + ((step * 67891) % 410000);
    const pct = Math.min(96, Math.round((used / 524288) * 100));
    const latency = mode === 'MAX' ? '2.45s' : mode === 'HIGH' ? '1.28s' : '0.54s';

    if (contextEl) contextEl.textContent = \`\${used.toLocaleString()} / 524,288\`;
    if (barFill) barFill.style.width = \`\${pct}%\`;
    if (effortEl) effortEl.textContent = mode;
    if (latencyEl) latencyEl.textContent = \`평균 \${latency} 추론\`;
    if (quotaEl) quotaEl.textContent = \`\${quota} / 100\`;

    history.unshift({ mode, tokens: used.toLocaleString(), latency });
    renderLogs();
  });
}

renderLogs();
`
      }
    },
    {
      tool: 'update_file',
      args: {
        path: 'index.html',
        target: '<span class="sub" id="kpi-status">BYOK 로컬 보호 활성</span>',
        replacement:
          '<span class="sub" id="kpi-status">BYOK 로컬 보호 · 실시간 필터 활성</span>'
      }
    }
  ];
}

async function runWorkspaceMockStream(
  req: ChatCompletionRequest,
  emit: (chunk: StreamChunk) => void,
  signal: AbortSignal
): Promise<void> {
  const latestMessage = req.messages[req.messages.length - 1];

  try {
    if (latestMessage?.role === 'tool') {
      const thinking = [
        `[도구 실행 결과 검증]`,
        `- write_file 및 update_file 디스크 반영 결과 확인`,
        `- index.html / styles.css / app.js 상호 참조 무결성 검증 완료`
      ].join('\n');

      for (const piece of splitIntoChunks(thinking, 10, 22)) {
        if (signal.aborted) return;
        emit({ type: 'thinking', text: piece });
        await sleepWithAbort(20, signal);
      }

      const summary = [
        `### 워크스페이스 파일 생성 및 패치 완료`,
        ``,
        `로컬 폴더에 다음 파일을 순차 생성·수정하고 우측 프리뷰에 즉시 반영했습니다.`,
        `- \`index.html\`: 모니터링 대시보드 레이아웃 + Effort 필터 + \`update_file\` 상태 배지 패치`,
        `- \`styles.css\`: 다크 그라디언트 대시보드 및 KPI 진행 바 스타일`,
        `- \`app.js\`: Effort 필터링 및 실시간 시뮬레이션 로그 추가 로직`,
        ``,
        `우측 **실시간 프리뷰**에서 \`요청 시뮬레이션\` 버튼과 드롭다운 필터를 직접 조작해 보세요.`
      ].join('\n');

      for (const piece of splitIntoChunks(summary, 10, 22)) {
        if (signal.aborted) return;
        emit({ type: 'content', text: piece });
        await sleepWithAbort(18, signal);
      }

      emit({
        type: 'usage',
        usage: {
          promptTokens: 740,
          completionTokens: 320,
          reasoningTokens: 110,
          totalTokens: 1060
        }
      });
      emit({ type: 'done', finishReason: 'stop' });
      return;
    }

    const userPrompt =
      [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const planThinking = [
      `[Workspace Agent Planning]`,
      `1. 사용자 지시 분석: "${userPrompt.slice(0, 72)}"`,
      `2. 파일 설계: index.html · styles.css · app.js 모듈 분리 생성`,
      `3. 후속 보완: write_file 실행 후 update_file로 실시간 상태 배지 미세 패치 수행`
    ].join('\n');

    for (const piece of splitIntoChunks(planThinking, 10, 22)) {
      if (signal.aborted) return;
      emit({ type: 'thinking', text: piece });
      await sleepWithAbort(22, signal);
    }

    const artifacts = buildWorkspaceMockArtifacts(userPrompt, req.scenarioId);
    for (let i = 0; i < artifacts.length; i += 1) {
      if (signal.aborted) return;
      const item = artifacts[i];
      await emitToolCallStream(
        i,
        `call_mock_${Date.now()}_${i}`,
        item.tool,
        item.args,
        emit,
        signal
      );
      await sleepWithAbort(70, signal);
    }

    emit({
      type: 'usage',
      usage: {
        promptTokens: 610,
        completionTokens: 1180,
        reasoningTokens: 160,
        totalTokens: 1790
      }
    });
    emit({ type: 'done', finishReason: 'tool_calls' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      emit({ type: 'done', finishReason: 'aborted' });
      return;
    }
    emit({
      type: 'error',
      message:
        err instanceof Error
          ? err.message
          : 'Workspace Mock 스트림 중 오류가 발생했습니다.'
    });
  }
}

function buildScenarioResponse(req: ChatCompletionRequest): {
  thinking: string;
  content: string;
  promptTokens: number;
} | null {
  if (req.scenarioId === 'scenario-512k-rca') {
    return {
      promptTokens: 248_400,
      thinking: [
        `[512K Context Scan — 248,400 Input Tokens Indexed]`,
        `1. 분산 추적 ID(Trace-8912a) 기준 타임스탬프 역추적`,
        `   - 02:11:04 KST: Redis Cluster 노드 #2 네트워크 지터(480ms) 관측`,
        `   - 02:11:19 KST: payment-gateway -> redis-pool.acquire() 대기 스레드 512개 도달`,
        `   - 02:11:42 KST: order-service 재시도 백오프 미적용으로 Retry Storm 발생 (요청량 6.4x 폭증)`,
        ``,
        `2. 설정 파일(payment-config.ts / redis.yaml) 교차 검증`,
        `   - acquireTimeoutMs: 30000 설정 과다 -> 이벤트 루프 블로킹 연쇄 유발`,
        `   - circuitBreaker.enabled: false 상태 확인`,
        ``,
        `3. 재발 방지 패치 설계`,
        `   - Fail-Fast 타임아웃 단축(1,500ms) + Exponential Backoff with Jitter + Half-Open 서킷 브레이커 도입`
      ].join('\n'),
      content: `### 512K 컨텍스트 분산 장애 근본 원인 분석(RCA)

총 **248,400 토큰**의 통합 로그 및 설정 파일을 교차 분석한 결과입니다. (우측 **512K Context Window** 바에서 실측 점유율 확인 가능)

#### 1. 장애 타임라인 요약
| 시각 (KST) | 서비스 | 관측 이벤트 | 근본 영향 |
| :--- | :--- | :--- | :--- |
| \`02:11:04\` | \`redis-cluster-02\` | 일시적 네트워크 패킷 지연(480ms) | 커넥션 반환 지연 시작 |
| \`02:11:19\` | \`payment-gateway\` | 풀 대기 스레드 512개 포화 | \`acquireTimeoutMs(30s)\`로 요청 적체 |
| \`02:11:42\` | \`order-service\` | 무제한 즉시 재시도(Retry Storm) | 전체 게이트웨이 \`HTTP 504\` 확산 |

#### 2. 권장 패치: Fail-Fast 서킷 브레이커
\`\`\`ts
export class CircuitBreaker {
  private failures = 0;
  private openedUntil = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 10_000
  ) {}

  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (Date.now() < this.openedUntil) {
      throw new Error('CIRCUIT_OPEN: Fast-fail triggered');
    }
    try {
      const result = await task();
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openedUntil = Date.now() + this.cooldownMs;
      }
      throw err;
    }
  }
}
\`\`\`

- **즉시 조치:** \`acquireTimeoutMs\`를 \`30,000ms → 1,500ms\`로 단축하고 지수 백오프 + Jitter를 적용하세요.`
    };
  }

  if (req.scenarioId === 'scenario-effort-compare') {
    const effort = req.reasoningEffort;
    const thinkingByEffort: Record<ReasoningEffort, string> = {
      low: [
        `[Effort: LOW — 신속 추론]`,
        `- 핵심 원인: 비원자적 읽기-수정-쓰기(Read-Modify-Write) 경합`,
        `- 해법 선택: Redis Lua 스크립트 또는 단일 Mutex 직렬화 제안`
      ].join('\n'),
      high: [
        `[Effort: HIGH — 구조적 추론]`,
        `1. 다중 워커 Rate Limiter 경합 분석: GET 후 SET 사이 타임슬라이스 인터리빙 발생`,
        `2. 메모리 누수 원인: 만료된 사용자 버킷 키를 정리하는 Eviction 루프 부재`,
        `3. 해결 설계: Redis INCR+PEXPIRE Lua 원자 연산 + LRU 상한(maxEntries) 적용`
      ].join('\n'),
      max: [
        `[Effort: MAX — 심층 반례 검증]`,
        `1. 경합 시나리오 전수 검증`,
        `   - 분산 워커 16개 동시 진입 시 GET/SET 비원자성으로 허용량 최대 140% 초과 허용 확인`,
        `2. 반례 및 메모리 누수 점검`,
        `   - 단발성 IP 100만 건 유입 시 Map 무한 팽창(OOM) -> Doubly-Linked LRU + TTL Lazy Eviction 필수`,
        `   - 시계 역행(Clock Skew) 방어: Date.now() 대신 monotonic clock(performance.now) 또는 Redis TIME 사용`,
        `3. 복잡도 확정: 시간 복잡도 O(1), 공간 복잡도 O(min(N, MAX_BUCKETS)) 보장`
      ].join('\n')
    };

    return {
      promptTokens: 1_840,
      thinking: thinkingByEffort[effort],
      content: `### \`reasoning_effort: ${effort}\` 동시성·최적화 분석 결과

현재 선택된 추론 깊이 **\`${effort}\`** 기준으로 도출한 해법입니다. 우측 패널에서 \`low\` / \`high\` / \`max\`를 바꿔 재전송하면 추론 깊이와 사고 시간을 직접 비교할 수 있습니다.

#### 1. 단계별 추론 깊이 대조표
| 단계 | 추론 토큰 규모 | 검증 범위 | 권장 용도 |
| :--- | :--- | :--- | :--- |
| \`low\` | 경량 (신속 응답) | 핵심 원인 + 기본 코드 | 단순 요약·포맷 변환 |
| \`high\` | 중간 (균형 응답) | 엣지 케이스 + 메모리 정리 | 일반 기능 개발·리뷰 |
| \`max\` | 심층 (기본 최대) | 분산 반례 + Clock Skew + O(1) 증명 | 동시성·보안·장애 분석 |

#### 2. 원자적 토큰 버킷 Rate Limiter (O(1) + 메모리 상한)
\`\`\`ts
interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class BoundedTokenBucket {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity = 100,
    private readonly refillPerSec = 20,
    private readonly maxBuckets = 50_000
  ) {}

  allow(key: string, nowMs = performance.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      }
      bucket = { tokens: this.capacity, lastRefillMs: nowMs };
    } else {
      // LRU 순서 갱신
      this.buckets.delete(key);
    }

    const elapsedSec = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSec * this.refillPerSec
    );
    bucket.lastRefillMs = nowMs;
    this.buckets.set(key, bucket);

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
\`\`\``
    };
  }

  return null;
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
      : `   - 최종 응답 섹션: 핵심 진단 → 아키텍처 흐름 → 실전 코드 → 검증 체크리스트 구성`
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

  if (
    lower.includes('sse') ||
    lower.includes('asynciterable') ||
    lower.includes('스트림')
  ) {
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

  if (
    lower.includes('cache') ||
    lower.includes('동시성') ||
    lower.includes('레이스')
  ) {
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

  if (
    lower.includes('로그') ||
    lower.includes('512k') ||
    lower.includes('체크리스트')
  ) {
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
  if (req.tools && req.tools.length > 0) {
    await runWorkspaceMockStream(req, emit, signal);
    return;
  }

  const lastUserMessage =
    [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hasSchema = Boolean(
    req.responseSchemaJson && req.responseSchemaJson.trim().length > 0
  );

  const scenario = buildScenarioResponse(req);
  const thinkingText =
    scenario?.thinking ??
    buildThinkingByEffort(req.reasoningEffort, lastUserMessage, hasSchema);
  const contentText = scenario?.content ?? buildContentResponse(req);

  const delayPerThinkingChunk =
    req.reasoningEffort === 'max' ? 38 : req.reasoningEffort === 'high' ? 28 : 20;

  try {
    for (const piece of splitIntoChunks(thinkingText, 8, 20)) {
      if (signal.aborted) return;
      emit({ type: 'thinking', text: piece });
      await sleepWithAbort(delayPerThinkingChunk, signal);
    }

    await sleepWithAbort(100, signal);

    for (const piece of splitIntoChunks(contentText, 12, 26)) {
      if (signal.aborted) return;
      emit({ type: 'content', text: piece });
      await sleepWithAbort(20, signal);
    }

    const promptTokens =
      scenario?.promptTokens ??
      Math.max(
        120,
        req.messages.reduce(
          (acc, m) => acc + Math.ceil(m.content.length * 0.65),
          0
        )
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
      message:
        err instanceof Error
          ? err.message
          : 'Mock 스트림 실행 중 오류가 발생했습니다.'
    });
  }
}
