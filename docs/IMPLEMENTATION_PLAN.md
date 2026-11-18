# EXAONE Studio & Workspace Desktop 마스터 구현 계획서

LG AI연구원의 **K-EXAONE 2.5 API(`k-exaone_v2.5`)** 기반 독립 실행형 데스크톱 AI 애플리케이션(**EXAONE Studio & Workspace Desktop**) 구축을 위한 상세 아키텍처, IPC 데이터 스키마, 단계별 커밋 로드맵 및 데모 시나리오 설계 문서.

---

## 1. 프로젝트 개요 및 데스크톱 아키텍처 전략

### 1.1 프로젝트 목적 및 방향 전환 개요
- **목적:** Google AI Studio(프롬프트 플레이그라운드)와 Antigravity(로컬 에이전틱 코딩 워크스페이스) 경험을 결합한 네이티브 데스크톱 애플리케이션 구축 및 Windows 실행 파일(`.exe`) 패키징
- **초기 기획 참조:** [exaoneServiceDemo.md](../exaoneServiceDemo.md)의 핵심 UX를 웹 브라우저 제약 없는 로컬 데스크톱 네이티브 구조로 확장
- **데스크톱 전환 이점:**
  - 브라우저 CORS 차단 및 별도 프록시 서버(`Next.js API` / `Vercel` 타임아웃·4.5MB 제한) 제거
  - 가상 파일 시스템 대신 실제 사용자 PC 로컬 폴더(`C:\...`) 열기, 탐색, 파일 생성·수정 구현

### 1.2 Electron 3-프로세스 분리 아키텍처
- **Main Process (`src/main` — Node.js + TypeScript):**
  - `https://api.exaone.ai/v1/chat/completions` 직접 HTTPS 스트리밍 호출 수행
  - Electron `safeStorage` 및 앱 `userData` 경로 기반 로컬 API 키 암호화 보관
  - OS 네이티브 폴더 선택 다이얼로그(`dialog.showOpenDialog`) 및 로컬 파일 시스템(`fs/promises`) 직접 제어
- **Preload Script (`src/preload` — TypeScript):**
  - `contextIsolation: true` 및 `nodeIntegration: false` 보안 원칙 준수
  - `contextBridge.exposeInMainWorld`를 통한 최소 권한 IPC 브리지(`window.exaoneAPI`) 노출
- **Renderer Process (`src/renderer` — React + TypeScript + Tailwind CSS + Zustand):**
  - Dual-Mode UI(`Studio` 프롬프트 플레이그라운드 & `Workspace` 로컬 에이전트 IDE) 렌더링
  - Preload IPC 이벤트를 구독하여 실시간 추론 과정, 코드 에디터, 프리뷰 갱신 처리
- **Mock Demo 스트리밍 엔진 내장:**
  - 일일 100회 호출 제한 및 API 키 미입력 환경에서도 전체 UI·에이전트 동작 체험 가능한 앱 내 `Demo Mode` ↔ `Live API Mode` 스위처 탑재

### 1.3 핵심 기술 및 보안 체크포인트 5종
1. **추론 토큰 분리 파싱 (`reasoning_content`):**
   - 스트리밍 청크 수신 시 `<think>` 태그가 아닌 `choices[0].delta.reasoning_content` 필드 우선 추출
   - `delta.reasoning_content`, `delta.content`, `delta.tool_calls` 3종 필드의 독립 IPC 스트리밍 이벤트 전달
2. **상시 추론 및 512K 토큰 한도 제어:**
   - `reasoning_effort` 허용 값 `"low" | "high" | "max"` 제한 적용 (기본값 `"max"`, `"medium"` 전달 시 HTTP 400 오류 발생)
   - `입력 토큰 + max_tokens <= 524,288` 조건 준수를 위한 요청 직전 동적 상한 클램핑 수행
   - 추론 토큰의 `max_tokens` 한도 합산 특성을 고려한 기본 `max_tokens` 8,192~16,384 범위 확보
3. **로컬 파일 시스템 샌드박스 보안:**
   - Workspace 모드에서 사용자가 직접 선택한 루트 폴더(`workspaceRoot`) 외부 경로 접근(`..` 상위 경로 이탈, 심볼릭 링크 우회 등) 원천 차단
   - 모든 파일 작업 직전 `path.resolve` 경계 검증 및 루트 외 경로 거부 처리
4. **에이전트 멀티턴 루프 및 일일 호출량 보호:**
   - `list_files` / `read_file` / `write_file` / `update_file` 연속 자동 호출 시 `maxSteps = 5` 상한 적용
   - 사용자 즉시 중단용 `AbortController` 강제 중지 제어 탑재를 통한 일일 100회 한도 소진 방지
5. **응답 헤더 활용 및 렌더링 성능 최적화:**
   - `x-minute-rate-limit`, `x-day-rate-limit`, `x-day-rate-limit-remaining`, `retry-after` 헤더 추출 후 상단 잔여 호출량 배지 표시
   - 디바운싱 기반 512K 토큰 추정치 실시간 표시 및 응답 완료 후 API 실측값(`usage.prompt_tokens`) 자동 보정
   - Monaco 에디터 비동기 지연 로딩 적용을 통한 초기 앱 기동 속도 확보

---

## 2. 폴더 및 파일 구조 (Directory Structure)

`electron-vite` (Electron + Vite + React + TypeScript) 표준 모듈 분리 설계.

```text
exaoneChat/
├── docs/
│   └── IMPLEMENTATION_PLAN.md           # 데스크톱 앱 마스터 구현 계획서
├── src/
│   ├── shared/
│   │   └── types.ts                     # Main · Preload · Renderer 공통 IPC 및 스트림 스키마
│   ├── main/
│   │   ├── index.ts                     # Electron BrowserWindow 생성 및 앱 생명주기 제어
│   │   ├── ipcHandlers.ts               # Renderer ↔ Main IPC 요청 라우팅 등록
│   │   ├── exaoneClient.ts              # K-EXAONE 2.5 직접 HTTPS SSE 요청 클라이언트
│   │   ├── sseParser.ts                 # reasoning_content / content / tool_calls 파서
│   │   ├── keyStore.ts                  # Electron safeStorage 기반 API 키 암호화 저장소
│   │   ├── workspaceFs.ts               # workspaceRoot 샌드박스 검증 및 로컬 파일 CRUD
│   │   └── mockEngine.ts                # 내장 Demo 모드 가상 SSE 스트림 생성기
│   ├── preload/
│   │   ├── index.ts                     # contextBridge 기반 window.exaoneAPI 노출
│   │   └── index.d.ts                   # window.exaoneAPI 전역 TypeScript 타입 선언
│   └── renderer/
│       ├── index.html                   # 데스크톱 렌더러 엔트리 HTML
│       └── src/
│           ├── main.tsx                 # React 루트 마운트
│           ├── App.tsx                  # Dual-Mode 메인 셸 (Studio / Workspace 전환)
│           ├── index.css                # Tailwind CSS 및 다크 테마 변수
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Header.tsx       # 상단 모드 스위처, Demo/Live 토글, 키 상태 배지
│           │   │   └── ApiKeyModal.tsx  # 로컬 API 키 입력·검증·삭제 모달
│           │   ├── studio/
│           │   │   ├── StudioLayout.tsx     # Mode A 3단 분할 레이아웃
│           │   │   ├── HistorySidebar.tsx   # 좌측 프롬프트 템플릿 및 로컬 세션 기록
│           │   │   ├── ChatPanel.tsx        # 중앙 시스템 프롬프트 및 멀티턴 채팅창
│           │   │   ├── ThinkingAccordion.tsx# 실시간 추론 아코디언 및 소요 시간 표시
│           │   │   ├── ParameterPanel.tsx   # 우측 파라미터 제어 (reasoning_effort, 512K 바)
│           │   │   └── CodeExportModal.tsx  # cURL / Python / JS 코드 내보내기 모달
│           │   └── workspace/
│           │       ├── WorkspaceLayout.tsx  # Mode B 3단 로컬 IDE 레이아웃
│           │       ├── AgentChatPanel.tsx   # 좌측 에이전트 채팅 및 중단 제어 패널
│           │       ├── ToolCallCard.tsx     # 로컬 파일 도구 실행 단계 카드 UI
│           │       ├── FileTree.tsx         # 실제 로컬 폴더 트리 탐색기
│           │       ├── CodeEditorPane.tsx   # Monaco Editor 비동기 래퍼
│           │       └── LivePreviewPane.tsx  # 로컬 웹 프로젝트 실시간 프리뷰 패널
│           ├── store/
│           │   ├── useAppStore.ts           # 전역 상태 (모드, 키 보유 여부, Rate Limit)
│           │   ├── useStudioStore.ts        # Studio 대화 세션, 시스템 프롬프트, 파라미터
│           │   └── useWorkspaceStore.ts     # 열린 루트 폴더, 파일 트리, 활성 파일, 에이전트 스텝
│           └── lib/
│               ├── tokens.ts                # 512K 토큰 추정 및 max_tokens 동적 클램핑
│               ├── codegen.ts               # cURL / Python / JS 요청 스니펫 생성기
│               └── mockScenarios.ts         # 프리셋 데모 시나리오 3종 메타데이터
├── exaoneServiceDemo.md                 # 초기 서비스 기획 원안
├── electron.vite.config.ts              # Main / Preload / Renderer 통합 빌드 설정
├── electron-builder.yml                 # Windows .exe 인스톨러·포터블 패키징 설정
├── package.json                         # 의존성 및 실행/빌드 스크립트
└── README.md                            # 프로젝트 개요 및 진행 현황
```

---

## 3. 핵심 데이터 흐름 및 TypeScript IPC 스키마 설계

### 3.1 공통 IPC 및 스트림 스키마 (`src/shared/types.ts`)

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

export interface ChatCompletionRequest {
  requestId: string;
  runMode: RunMode;
  model: "k-exaone_v2.5";
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  responseSchemaJson?: string;
  tools?: Array<Record<string, unknown>>;
  scenarioId?: string;
}

export interface WorkspaceFileNode {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  children?: WorkspaceFileNode[];
}

export interface ExaoneIPCBridge {
  // API 키 로컬 안전 관리
  hasApiKey: () => Promise<boolean>;
  saveApiKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  clearApiKey: () => Promise<void>;

  // 채팅 SSE 스트림 시작·중단·구독
  startChatStream: (req: ChatCompletionRequest) => Promise<void>;
  abortChatStream: (requestId: string) => Promise<void>;
  onStreamChunk: (
    callback: (requestId: string, chunk: StreamChunk) => void
  ) => () => void;

  // 로컬 워크스페이스 폴더 및 파일 제어
  openWorkspaceFolder: () => Promise<{
    rootPath: string;
    tree: WorkspaceFileNode[];
  } | null>;
  listWorkspaceFiles: (rootPath: string) => Promise<WorkspaceFileNode[]>;
  readWorkspaceFile: (rootPath: string, relativePath: string) => Promise<string>;
  writeWorkspaceFile: (
    rootPath: string,
    relativePath: string,
    content: string
  ) => Promise<void>;
}
```

### 3.2 IPC 스트리밍 및 로컬 파일 동기화 흐름
- **채팅 스트림 흐름 (`Studio` & `Workspace` 공용):**
  1. Renderer가 `window.exaoneAPI.startChatStream(req)` 호출
  2. Main 프로세스가 `runMode` 판별 후 `mockEngine.ts` 또는 `exaoneClient.ts`(Electron 내 저장 키 복호화 주입) 실행
  3. `sseParser.ts`가 `reasoning_content` / `content` / `tool_calls` 분리 파싱 후 `webContents.send("exaone:stream-chunk", requestId, chunk)` 전송
  4. Renderer가 `StreamChunk` 구독을 통해 UI 실시간 업데이트 수행
- **로컬 워크스페이스 파일 동기화 흐름 (`Mode B`):**
  1. 사용자 폴더 선택(`openWorkspaceFolder`) 시 Main 프로세스에 `workspaceRoot` 경로 등록 및 파일 트리 반환
  2. 에이전트가 `write_file` / `update_file` 도구 호출 시 경로 경계 검증 후 실제 디스크 파일 기록 수행
  3. 파일 기록 완료 후 Renderer의 `FileTree`, `CodeEditorPane`(Monaco), `LivePreviewPane` 동시 갱신 처리

---

## 4. 단계별 구현 및 커밋 로드맵 (Step 0 ~ Step 8)

입문자 TypeScript 학습 병행 및 매 단계 독립 빌드·실행 검증 기준의 점진적 8단계 로드맵.

| 단계 | 목표 및 눈에 보이는 변화 | 주요 구현 대상 | TypeScript / Electron 학습 포인트 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- |
| **Step 0** | 데스크톱 설계서 확정 및 원격 반영 | `docs/IMPLEMENTATION_PLAN.md`, `README.md` | Git 커밋·푸시 흐름 및 아키텍처 이해 | GitHub `main` 브랜치 개편 문서 반영 확인 |
| **Step 1** | 독립 데스크톱 창 및 상단 헤더 구축 | `electron-vite` 세팅, `src/main/index.ts`, `Header.tsx`, `useAppStore.ts` | Main·Preload·Renderer 구조 및 React Props 전달 | `npm run dev`로 독립 윈도우 앱 실행 및 상단 모드 스위처 동작 |
| **Step 2** | 기본 멀티턴 채팅 UI 구현 | `src/shared/types.ts`, `StudioLayout.tsx`, `ChatPanel.tsx` | `interface`, 유니온 타입, 배열 상태 렌더링 | 사용자 메시지 입력 시 말풍선 누적 및 스크롤 표시 |
| **Step 3** | Mock SSE 엔진 및 `Thinking` 아코디언 | `mockEngine.ts`, `ThinkingAccordion.tsx` | IPC 이벤트 구독, 조건부 렌더링, 소요 시간 타이머 | 타자형 가상 스트리밍 및 추론 과정 접기·펼치기 동작 |
| **Step 4** | 안전 키 저장소 및 Live API 직접 연동 | `keyStore.ts`, `exaoneClient.ts`, `sseParser.ts`, `ApiKeyModal.tsx` | `safeStorage`, `async/await`, `fetch` SSE 스트림 파싱 | 키 암호화 저장 및 K-EXAONE 2.5 실응답 실시간 스트리밍 |
| **Step 5** | Studio 제어 패널 및 세션 관리 완성 | `ParameterPanel.tsx`, `HistorySidebar.tsx`, `CodeExportModal.tsx`, `tokens.ts` | Zustand 전역 상태, 동적 클램핑, 스니펫 생성 | `reasoning_effort`·512K 바·JSON Schema·코드 Export 전체 동작 |
| **Step 6** | 실제 로컬 폴더 열기 및 Monaco 에디터 | `workspaceFs.ts`, `WorkspaceLayout.tsx`, `FileTree.tsx`, `CodeEditorPane.tsx` | `contextBridge` IPC 파일 I/O 및 경로 샌드박싱 | 내 PC 실제 폴더 탐색, Monaco 편집 및 디스크 저장(`Ctrl+S`) |
| **Step 7** | 로컬 파일 제어 에이전트 및 프리뷰 | `AgentChatPanel.tsx`, `ToolCallCard.tsx`, `LivePreviewPane.tsx` | Tool Call JSON 파싱, `AbortController`, 루프 상한 제어 | `write_file`/`update_file` 도구 호출로 실제 파일 수정 및 프리뷰 반영 |
| **Step 8** | 데모 시나리오 3종 및 `.exe` 패키징 | `mockEngine.ts` 시나리오, 에러 배너(400/401/429), `electron-builder.yml` | 프로덕션 빌드 및 Windows 실행 파일 패키징 | 키 미입력 상태 3종 데모 완주 및 `dist/*.exe` 빌드 성공 |

### 단계별 권장 커밋 메시지 규격
- **Step 0:** `docs: Electron 데스크톱 앱 아키텍처로 구현 계획서 및 로드맵 개편`
- **Step 1:** `chore: Electron-Vite 데스크톱 앱 초기 세팅 및 상단 헤더 구축`
- **Step 2:** `feat(studio): 채팅 메시지 타입 정의 및 기본 멀티턴 채팅창 구현`
- **Step 3:** `feat(studio): Mock 스트리밍 엔진 및 Thinking 아코디언 UI 구현`
- **Step 4:** `feat(core): 로컬 API 키 안전 저장소 및 K-EXAONE 2.5 직접 스트리밍 연동`
- **Step 5:** `feat(studio): 파라미터 제어 패널, 512K 게이지 및 코드 내보내기 완성`
- **Step 6:** `feat(workspace): 로컬 폴더 탐색기 및 Monaco 코드 에디터 연동`
- **Step 7:** `feat(workspace): 로컬 파일 제어 에이전트 루프 및 실시간 프리뷰 구현`
- **Step 8:** `feat(release): 프리셋 시나리오 탑재 및 Windows 실행 파일 패키징 구성`

---

## 5. 내장 Mock Demo 프리셋 시나리오 3종 기획

API 키 미보유 환경 및 시연 상황에서 K-EXAONE 2.5 핵심 역량 체감용 내장 시나리오 설계.

### 시나리오 1: 512K 대용량 로그·코드 컨텍스트 심층 원인 분석 (Studio 모드)
- **시연 포인트:** 최대 `524,288` 토큰 컨텍스트 수용력 및 512K 프로그레스 바 시각화
- **입력 구성:** 약 180K~350K 토큰 분량의 가상 마이크로서비스 로그·설정 파일 컨텍스트 자동 주입
- **스트리밍 흐름:**
  1. 512K 컨텍스트 바 점유율 상승 및 임계치 색상 전환 표시
  2. `Thinking` 블록 내 분산 추적 ID 대조 및 커넥션 풀 고갈 원인 추론 과정 전개
  3. 구조화된 장애 타임라인 표 및 재발 방지 패치 코드 출력

### 시나리오 2: `reasoning_effort` (`low` vs `high` vs `max`) 추론 깊이 비교 (Studio 모드)
- **시연 포인트:** `reasoning_effort` 단계별 추론 시간, 토큰 소비량, 해법 정교도 차이 체감
- **입력 구성:** 동시성 경합(Race Condition) 버그 수정 및 시간 복잡도 최적화 요구 프롬프트
- **스트리밍 흐름:**
  1. `low` 선택 시 짧은 추론 후 기본 동작 코드 신속 반환
  2. `max` 선택 시 반례 검증, 메모리 누수 엣지 케이스, 락 경합 해법까지 단계별 심층 추론 전개 및 소요 시간 배지 비교 제공

### 시나리오 3: 로컬 워크스페이스 폴더 내 멀티파일 프로젝트 자동 생성·수정 (Workspace 모드)
- **시연 포인트:** Antigravity 스타일 로컬 파일 제어(`list_files` / `write_file` / `update_file`) 및 실시간 프리뷰
- **스트리밍 흐름:**
  1. 사용자 요청("토큰 사용량 모니터링 대시보드 UI 페이지 생성") 입력
  2. 에이전트 `Thinking` 후 `ToolCallCard` 순차 표시 (`write_file("index.html")` → `write_file("app.js")` → `update_file("styles.css")`)
  3. 로컬 파일 트리, Monaco 에디터 코드, 우측 프리뷰 화면의 동시 갱신 시연
