# EXAONE Studio & Workspace 마스터 구현 계획서

LG AI연구원의 **K-EXAONE 2.5 API(`k-exaone_v2.5`)** 기반 Dual-Mode AI 웹 애플리케이션(**EXAONE Studio & Workspace**) 구축을 위한 상세 아키텍처, 데이터 스키마, 단계별 커밋 로드맵 및 데모 시나리오 설계 문서.

---

## 1. 프로젝트 개요 및 아키텍처 전략

### 1.1 프로젝트 목적 및 범위
- **목적:** Google AI Studio(프롬프트 플레이그라운드)와 Antigravity(에이전트 코딩 워크스페이스) 경험을 결합한 개인 포트폴리오용 웹 서비스 구축 및 Vercel 배포
- **원본 기획 참조:** [exaoneServiceDemo.md](../exaoneServiceDemo.md)
- **핵심 UX 목표:** API 키 보유 여부와 무관하게 모든 방문자가 즉시 추론(`Thinking`), 512K 컨텍스트 제어, 에이전트 코딩 워크플로우를 체험 가능한 환경 제공

### 1.2 API 제약 조건 및 해결 아키텍처
- **API 제약 현황:** 제3자 API 키 제공 금지 약관, 일일 호출 100회 제한, 발급 후 30일 만료 제약 존재
- **해결책 1 — BYOK(Bring Your Own Key) 구조:**
  - 브라우저 `localStorage` 내 사용자 API 키 단독 보관 및 서버 DB 미저장 원칙 적용
  - Next.js 무상태(Stateless) Edge 프록시(`/api/chat`)를 통한 브라우저 CORS 차단 우회 및 키 로깅 배제 처리
- **해결책 2 — Mock Demo SSE 엔진:**
  - API 키 미보유 방문자·면접관 대상 사전 시나리오 기반 가상 SSE(Server-Sent Events) 스트리밍 시뮬레이션 제공
  - Live API와 동일한 `ChatStreamAdapter` 인터페이스 공유를 통한 UI·파서 로직 단일화

### 1.3 K-EXAONE 2.5 실스펙 반영 기술 체크포인트 5종
1. **추론 토큰 분리 파싱 (`reasoning_content`):**
   - 스트리밍 응답 시 `<think>` 태그가 아닌 `choices[0].delta.reasoning_content` 필드로 추론 토큰 수신
   - `delta.reasoning_content`, `delta.content`, `delta.tool_calls` 3종 필드의 독립 스트림 청크 분리 처리
2. **상시 추론 및 토큰 한도 제어 (`max_tokens` 동적 클램핑):**
   - `reasoning_effort` 허용 값 `"low" | "high" | "max"` 제한 적용 (기본값 `"max"`, `"medium"` 전달 시 HTTP 400 오류 발생)
   - `입력 토큰 + max_tokens <= 524,288` 조건 위반 시 HTTP 400 반환 방지를 위한 요청 직전 동적 상한 클램핑 수행
   - 추론 토큰의 `max_tokens` 한도 합산 특성을 고려한 기본 `max_tokens` 8,192~16,384 범위 확보
3. **Vercel 배포 제약 대응 (Edge Runtime & 4.5MB 페이로드 제한):**
   - `/api/chat` 라우트에 `export const runtime = "edge"` 적용을 통한 긴 추론 응답 시 서버리스 타임아웃 방지
   - 요청 직전 4.5MB 본문 크기 초과 여부 사전 검증 및 사용자 안내 처리
   - `x-minute-rate-limit`, `x-day-rate-limit`, `x-day-rate-limit-remaining`, `retry-after` 응답 헤더 클라이언트 패스스루 및 잔여 호출량 UI 반영
4. **에이전트 멀티턴 루프 및 호출 한도 보호:**
   - Workspace 모드의 다단계 파일 생성·수정 루프(`API 호출 → VFS 반영 → role: "tool" 재전송`)에 `maxSteps = 5` 상한 적용
   - 사용자 즉시 중단용 `AbortController` 중지 버튼 탑재를 통한 일일 100회 호출 소진 방지
5. **브라우저 렌더링 및 토큰 계산 성능 최적화:**
   - 512K 초장문 입력 시 디바운싱 기반 경량 토큰 추정치 실시간 표시 및 응답 완료 후 API 실측값(`usage.prompt_tokens`) 자동 보정
   - 무거운 클라이언트 라이브러리(`@monaco-editor/react`, `@codesandbox/sandpack-react`)의 `next/dynamic({ ssr: false })` 지연 로딩 적용

---

## 2. 폴더 및 파일 구조 (Directory Structure)

Next.js App Router 및 TypeScript(`src/` 구조) 기준 모듈 분리 설계.

```text
exaoneChat/
├── docs/
│   └── IMPLEMENTATION_PLAN.md       # 마스터 구현 계획서 및 로드맵 문서
├── public/                          # 정적 에셋 및 아이콘
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts         # K-EXAONE 무상태 Edge SSE 패스스루 프록시
│   │   ├── globals.css              # Tailwind CSS 및 테마 변수
│   │   ├── layout.tsx               # 루트 레이아웃 및 다크 테마 설정
│   │   └── page.tsx                 # Dual-Mode 메인 셸 (Studio / Workspace 전환)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           # 상단 네비게이션, 모드 스위처, Demo/Live 토글
│   │   │   └── ApiKeyModal.tsx      # BYOK API 키 입력·검증·삭제 모달
│   │   ├── studio/
│   │   │   ├── StudioLayout.tsx     # Mode A 3단 분할 레이아웃
│   │   │   ├── HistorySidebar.tsx   # 좌측 프롬프트 템플릿 및 대화 히스토리
│   │   │   ├── ChatPanel.tsx        # 중앙 시스템 프롬프트 및 멀티턴 채팅창
│   │   │   ├── ThinkingAccordion.tsx# 실시간 추론 과정 접기/펼치기 및 소요 시간 UI
│   │   │   ├── ParameterPanel.tsx   # 우측 파라미터 제어 (reasoning_effort, 512K 바 등)
│   │   │   └── CodeExportModal.tsx  # cURL / Python / JS 요청 코드 내보내기 모달
│   │   ├── workspace/
│   │   │   ├── WorkspaceLayout.tsx  # Mode B 3단 IDE 레이아웃
│   │   │   ├── AgentChatPanel.tsx   # 좌측 에이전트 채팅 및 중단 제어 패널
│   │   │   ├── ToolCallCard.tsx     # write_file / update_file 단계별 실행 카드 UI
│   │   │   ├── FileTree.tsx         # 중앙 가상 파일 시스템(VFS) 탐색기
│   │   │   ├── CodeEditorPane.tsx   # Monaco Editor 지연 로딩 래퍼
│   │   │   └── SandpackPreview.tsx  # Sandpack 실시간 웹 프리뷰 지연 로딩 래퍼
│   │   └── ui/                      # shadcn/ui 공통 기초 컴포넌트
│   ├── lib/
│   │   ├── exaone/
│   │   │   ├── adapter.ts           # LiveExaoneAdapter 구현체
│   │   │   ├── parser.ts            # OpenAI 호환 SSE 청크 및 reasoning_content 파서
│   │   │   ├── agentLoop.ts         # Workspace 멀티턴 Tool Call 오케스트레이터
│   │   │   ├── codegen.ts           # cURL / Python / JS 스니펫 생성 유틸리티
│   │   │   └── tokens.ts            # 512K 토큰 추정 및 max_tokens 클램핑 유틸리티
│   │   └── mock/
│   │       ├── adapter.ts           # MockExaoneAdapter 구현체 (가상 SSE 스트림 생성)
│   │       └── scenarios.ts         # 프리셋 데모 시나리오 3종 데이터셋
│   ├── store/
│   │   ├── useAppStore.ts           # 전역 상태 (모드, BYOK 키, Rate Limit 헤더 정보)
│   │   ├── useStudioStore.ts        # Studio 대화 세션, 시스템 프롬프트, 모델 파라미터
│   │   └── useWorkspaceStore.ts     # 가상 파일 시스템(VFS), 선택 파일, 에이전트 스텝
│   └── types/
│       └── exaone.ts                # 통합 스트림 청크, Adapter, VFS, Tool Call 타입 정의
├── exaoneServiceDemo.md             # 초기 서비스 기획 원안
├── next.config.ts                   # Next.js 설정
├── package.json                     # 의존성 및 스크립트 정의
└── README.md                        # 프로젝트 개요 및 진행 현황
```

---

## 3. 핵심 데이터 흐름 및 TypeScript 스키마 설계

### 3.1 통합 Adapter 및 스트림 청크 스키마 (`src/types/exaone.ts`)

```ts
export type AppMode = "studio" | "workspace";
export type RunMode = "demo" | "live";
export type ReasoningEffort = "low" | "high" | "max";

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsChunk?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface RateLimitInfo {
  minuteLimit?: number;
  minuteRemaining?: number;
  dayLimit?: number;
  dayRemaining?: number;
  retryAfterSeconds?: number;
}

export type StreamChunk =
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "tool_call"; delta: ToolCallDelta }
  | { type: "usage"; usage: TokenUsage }
  | { type: "rate_limit"; info: RateLimitInfo }
  | { type: "error"; status?: number; message: string }
  | { type: "done"; finishReason?: string };

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  thinkingDurationMs?: number;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    argumentsJson: string;
    status: "running" | "success" | "error";
  }>;
  createdAt: number;
}

export interface ChatCompletionParams {
  model: "k-exaone_v2.5";
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  responseSchemaJson?: string;
  tools?: Array<Record<string, unknown>>;
  scenarioId?: string;
}

export interface ChatStreamAdapter {
  streamChat(
    params: ChatCompletionParams,
    options: { apiKey?: string; signal: AbortSignal }
  ): AsyncIterable<StreamChunk>;
}
```

### 3.2 Live / Mock 단일 Adapter 및 스트림 파서 데이터 흐름
- **요청 분기:** `runMode === "demo"` 시 `MockExaoneAdapter`, `runMode === "live"` 시 `LiveExaoneAdapter` 선택 실행
- **Live 프록시 경로:** `LiveExaoneAdapter` → `POST /api/chat` (Edge Proxy, `Authorization` 헤더 전달) → `https://api.exaone.ai/v1/chat/completions`
- **SSE 파서(`parser.ts`) 동작:**
  1. `ReadableStream` 라인 버퍼링(`data: {...}` 추출 및 `data: [DONE]` 종료 감지)
  2. `choices[0].delta.reasoning_content` 존재 시 `{ type: "thinking", text }` 방출
  3. `choices[0].delta.content` 존재 시 `{ type: "content", text }` 방출
  4. `choices[0].delta.tool_calls` 존재 시 인덱스별 인자 조각 누적용 `{ type: "tool_call", delta }` 방출
  5. 응답 헤더에서 `RateLimitInfo` 추출 및 최종 청크의 `usage` 데이터 방출
- **UI 소비 구조:** `Studio`와 `Workspace` 모두 `StreamChunk` 단일 타입만 구독하여 백엔드 전환과 무관한 렌더링 보장

### 3.3 Mode B 가상 파일 시스템(VFS) 및 Sandpack 단방향 동기화 흐름
- **단일 진실 공급원(Single Source of Truth):** Zustand `useWorkspaceStore` 내 `files: Record<string, string>` 맵 유지
- **에이전트 도구 실행:** `agentLoop.ts`가 `write_file` / `update_file` Tool Call 수신 및 JSON 파싱 → `useWorkspaceStore.applyFileChange()` 호출 → `role: "tool"` 실행 결과 메시지 생성 후 재호출 (`maxSteps = 5`)
- **UI 반영 흐름:** `useWorkspaceStore.files` 변경 → `FileTree` 목록 갱신 → `CodeEditorPane`(Monaco) 활성 코드 표시 → `SandpackPreview`(`files` prop 전달) 즉시 리렌더링

---

## 4. 단계별 구현 및 커밋 로드맵 (Step 0 ~ Step 8)

입문자 학습 병행 및 매 단계 독립 검증(`npm run build`) 기준의 점진적 8단계 로드맵 구성.

| 단계 | 목표 및 눈에 보이는 변화 | 주요 구현 대상 | TypeScript / 웹 핵심 포인트 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Step 0** | 설계 문서화 및 첫 원격 푸시 | `docs/IMPLEMENTATION_PLAN.md`, `README.md` | Git 기본 흐름 (`add` → `commit` → `push`) | GitHub `main` 브랜치 문서 반영 확인 |
| **Step 1** | Next.js 세팅 및 공통 상단 바 구축 | Next.js 초기화, `Header.tsx`, `useAppStore.ts` | 컴포넌트 분리 및 Props 전달 | `npm run build` 통과, 상단 모드·Demo 토글 렌더링 |
| **Step 2** | 기본 멀티턴 채팅 UI 구현 | `StudioLayout.tsx`, `ChatPanel.tsx`, `exaone.ts` | `interface`, 유니온 타입, 배열 상태 렌더링 | 사용자 메시지 입력 시 말풍선 누적 표시 |
| **Step 3** | Mock SSE 및 `Thinking` 아코디언 UI | `MockExaoneAdapter`, `ThinkingAccordion.tsx` | `AsyncIterable`, 조건부 렌더링, 타이머 제어 | 타자형 가상 스트리밍 및 추론 소요 시간 실시간 표시 |
| **Step 4** | BYOK 키 매니저 및 Live API 연동 | `ApiKeyModal.tsx`, `/api/chat`, `LiveExaoneAdapter`, `parser.ts` | `async/await`, `fetch`, SSE 스트림 파싱 | 키 검증·`localStorage` 저장 및 K-EXAONE 2.5 실응답 수신 |
| **Step 5** | Studio 컨트롤러 완성 및 1차 배포 | `ParameterPanel.tsx`, `HistorySidebar.tsx`, `CodeExportModal.tsx`, `tokens.ts` | Zustand 전역 공유 상태, 동적 클램핑 로직 | `reasoning_effort`·512K 바·JSON Schema·코드 Export 및 Vercel 1차 배포 |
| **Step 6** | Workspace 에디터·프리뷰 레이아웃 | `WorkspaceLayout.tsx`, `FileTree.tsx`, `CodeEditorPane.tsx`, `SandpackPreview.tsx` | `next/dynamic` 지연 로딩 및 VFS 동기화 | 파일 트리 클릭 → Monaco 편집 → Sandpack 즉시 프리뷰 |
| **Step 7** | 에이전트 Tool Loop 및 상태 카드 | `agentLoop.ts`, `AgentChatPanel.tsx`, `ToolCallCard.tsx` | Tool Call JSON 파싱, `AbortController`, 루프 상한 제어 | `write_file`/`update_file` 호출 시 실시간 코드·프리뷰 변경 |
| **Step 8** | 데모 시나리오 3종 및 포트폴리오 마감 | `scenarios.ts`, 에러 토스트(400/401/429), 최종 `README.md` | 전체 아키텍처 통합 점검 및 예외 처리 | 시크릿 브라우저 무키 완주 테스트 및 최종 프로덕션 빌드 |
| **Bonus** | *(선택)* 데스크톱 미니 앱 패키징 | Electron 또는 Tauri 래핑 설정 | 웹 UI의 로컬 파일 시스템 IPC 확장 | 로컬 설치형 PC 앱 실행 파일 생성 확인 |

### 단계별 권장 커밋 메시지 규격
- **Step 0:** `docs: 프로젝트 마스터 구현 계획서 및 8단계 로드맵 추가`
- **Step 1:** `chore: Next.js 초기 세팅 및 글로벌 상단 헤더 구축`
- **Step 2:** `feat(studio): 기본 채팅 메시지 스키마 및 멀티턴 UI 구현`
- **Step 3:** `feat(studio): Mock SSE 스트리밍 엔진 및 Thinking 아코디언 UI 구현`
- **Step 4:** `feat(core): BYOK 키 매니저 및 K-EXAONE 2.5 Edge 프록시 연동`
- **Step 5:** `feat(studio): 추론·512K·JSON Schema 컨트롤러 및 코드 내보내기 완성`
- **Step 6:** `feat(workspace): 가상 파일 트리, Monaco 에디터 및 Sandpack 프리뷰 연동`
- **Step 7:** `feat(workspace): 에이전트 멀티턴 Tool Loop 및 실행 상태 카드 구현`
- **Step 8:** `feat(demo): 포트폴리오 프리셋 시나리오 3종 및 예외 처리 마감`

---

## 5. Mock Demo 프리셋 시나리오 3종 기획

API 키 없는 면접관·방문자 대상 K-EXAONE 2.5 핵심 차별점 체감용 시나리오 설계.

### 시나리오 1: 512K 초장문 코드베이스 및 장애 로그 근본 원인 분석 (Studio 모드)
- **시연 포인트:** 최대 `524,288` 토큰 컨텍스트 수용력 및 512K 프로그레스 바 시각화
- **입력 구성:** 약 180K~350K 토큰 분량의 가상 마이크로서비스 로그·설정 파일 컨텍스트 자동 주입
- **스트리밍 흐름:**
  1. 512K 컨텍스트 바의 실시간 점유율 상승 및 경고 임계치 색상 전환 표시
  2. `Thinking` 블록 내 분산 추적 ID(Trace ID) 대조 및 커넥션 풀 고갈 원인 추론 과정 전개
  3. 구조화된 장애 타임라인 표 및 재발 방지 패치 코드 출력

### 시나리오 2: `reasoning_effort` (`low` vs `high` vs `max`) 추론 깊이 비교 (Studio 모드)
- **시연 포인트:** `reasoning_effort` 단계별 추론 시간, 토큰 소비량, 해법 정교도 차이 체감
- **입력 구성:** 동시성 경합(Race Condition) 버그 수정 및 시간 복잡도 최적화 요구 프롬프트
- **스트리밍 흐름:**
  1. `low` 선택 시 짧은 추론 후 기본 동작 코드 신속 반환
  2. `max` 선택 시 반례 검증, 메모리 누수 엣지 케이스, 락 경합 해법까지 단계별 심층 추론 전개 및 소요 시간 배지 비교 제공

### 시나리오 3: 에이전트 기반 인터랙티브 React 대시보드 생성 및 수정 (Workspace 모드)
- **시연 포인트:** Antigravity 스타일 멀티파일 에이전틱 코딩(`write_file` / `update_file`) 및 Sandpack 즉시 렌더링
- **스트리밍 흐름:**
  1. 사용자 요청("K-EXAONE 토큰 사용량 모니터링 위젯 페이지 제작") 입력
  2. 에이전트 `Thinking` 후 `ToolCallCard` 순차 표시 (`write_file("src/App.tsx")` → `write_file("src/components/MetricsCard.tsx")` → `update_file("src/styles.css")`)
  3. 파일 트리, Monaco 에디터 코드, 우측 Sandpack 실시간 대시보드 화면의 동시 갱신 시연
