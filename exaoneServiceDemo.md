# Role
당신은 AI 웹 애플리케이션 아키텍트이자 시니어 풀스택 개발자입니다. 
LG AI연구원의 'K-EXAONE 2.5 API'를 활용하여, Google AI Studio(프롬프트 플레이그라운드)와 Antigravity(에이전트 기반 코딩 워크스페이스)를 결합한 개인 포트폴리오용 웹 애플리케이션 **"EXAONE Studio & Workspace"**의 상세 구현 계획(Implementation Plan)을 수립해 주세요.

# 1. 프로젝트 배경 및 제약 조건 해결 전략
- **목적:** 개인 포트폴리오용 웹 서비스 구축 및 배포 (Vercel 등)
- **API 제약 조건:** K-EXAONE 2.5 API는 제3자 제공 금지 약관, 일일 호출 제한(100회), 발급 후 30일 만료 제약이 있음.
- **아키텍처 해결책 (필수 반영):**
  1. **BYOK (Bring Your Own Key) 모드:** 사용자가 본인의 EXAONE API Key를 브라우저(`localStorage`)에 입력하여 호출하는 클라이언트/프록시 구조.
  2. **Mock Demo 모드 (면접관/방문자용):** API Key가 없는 방문자도 모든 UI와 기능을 체험할 수 있도록, 사전 정의된 시나리오(코드 생성, 추론, 에이전트 툴 콜링)를 실제 SSE(Server-Sent Events) 스트리밍처럼 시뮬레이션하는 Mock 엔진 탑재.

# 2. K-EXAONE 2.5 API 기술 명세
- **Base URL:** `https://api.exaone.ai/v1/chat/completions` (OpenAI SDK 호환 포맷)
- **핵심 파라미터:**
  - `reasoning_effort`: `"low"` | `"high"` | `"max"` (추론 깊이 조절)
  - `max_context`: 최대 524,288 토큰 (512K 컨텍스트 윈도우)
  - `stream`: `true` (SSE 스트리밍 응답)
  - `tools` / `tool_choice`: 에이전틱 함수 호출(Function Calling) 지원
- **응답 특징:** 최종 답변 생성 전 추론(Thinking) 토큰이 먼저 스트리밍됨.

# 3. 핵심 기능 요구사항 (Dual Mode UI)

## 공통 기능 (Core & Header)
- **모드 스위처:** 상단 탭에서 `[Studio 모드]`와 `[Workspace 모드]` 실시간 전환.
- **API Key 매니저 & Demo 토글:** API Key 입력/검증 모달 및 `Demo Mode(가상 스트리밍)` / `Live API Mode` 전환 스위치.

## Mode A: EXAONE Studio (Google AI Studio 스타일)
- **3단 레이아웃:** 좌측(프롬프트 템플릿 및 히스토리) / 중앙(시스템 프롬프트 + 멀티턴 채팅창) / 우측(파라미터 제어 패널).
- **추론(Thinking) 아코디언 UI:** 스트리밍 중 모델의 추론 과정과 최종 답변을 분리 파싱하여, 추론 과정은 접고 펼칠 수 있는 `Thinking...` 블록으로 실시간 렌더링(소요 시간 표시 포함).
- **특화 컨트롤러:** `reasoning_effort`(`low`/`high`/`max`) 선택 토글, Temperature 슬라이더, 512K 컨텍스트 토큰 사용량 실시간 프로그레스 바, JSON Schema 출력 설정, cURL/Python/JS 코드 내보내기(Export) 버튼.

## Mode B: EXAONE Workspace (Antigravity 스타일 에이전틱 IDE)
- **분할 워크스페이스 레이아웃:** 좌측(에이전트 채팅 + Tool Call 실행 로그) / 중앙(가상 파일 트리 + Monaco 코드 에디터) / 우측(실시간 웹 프리뷰 - Sandpack 기반).
- **에이전트 툴 콜링 시각화:** 모델이 파일 생성/수정(`write_file`, `update_file`) 도구를 호출하는 과정을 단계별 상태 카드 UI로 표시하고, 즉각 우측 Sandpack 코드 및 프리뷰에 반영.

# 4. 권장 기술 스택
- **Framework:** Next.js (App Router, TypeScript)
- **Styling & UI:** Tailwind CSS, shadcn/ui, Lucide Icons, Framer Motion (추론 아코디언 및 화면 전환 애니메이션)
- **State Management:** Zustand (전역 상태, BYOK 키 관리, 가상 파일 시스템 상태 관리)
- **Code & Preview:** `@monaco-editor/react` 또는 `@codesandbox/sandpack-react`
- **Markdown:** `react-markdown`, `rehype-highlight`

# 5. 요청 출력물 (Deliverables)
코드를 바로 작성하지 말고, 먼저 아래 항목을 포함한 **체계적인 마스터 구현 계획서**를 작성해 주세요.

1. **폴더 및 파일 구조 (Directory Structure):** Next.js App Router 기반의 명확한 모듈 분리 구조
2. **핵심 데이터 흐름 및 스키마 설계:** 
   - Live API와 Mock 스트리밍을 단일 인터페이스로 처리하는 Adapter 패턴 설계
   - 추론(Thinking) 토큰과 일반 응답, Tool Call을 구분하는 스트림 파서(Parser) 구조
3. **단계별 구현 로드맵 (Phase 1 ~ Phase 5):** 각 단계별 목표, 구현할 컴포넌트 목록, 완료 기준(Definition of Done)
4. **Mock Demo 시나리오 기획:** API 키 없이도 EXAONE 2.5의 512K 컨텍스트, `reasoning_effort` 차이, 코딩 에이전트 성능을 극적으로 보여줄 수 있는 프리셋 데모 시나리오 3가지