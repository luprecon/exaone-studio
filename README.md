# EXAONE Studio & Workspace

LG AI연구원의 **K-EXAONE 2.5 API(`k-exaone_v2.5`)**를 기반으로 Google AI Studio 스타일 프롬프트 플레이그라운드(**Studio**)와 Antigravity 스타일 에이전트 코딩 환경(**Workspace**)을 통합한 Dual-Mode AI 웹 애플리케이션.

---

## 핵심 아키텍처 및 주요 기능

- **Dual-Mode 실시간 전환:** 상단 헤더 스위처를 통한 `Studio 모드` ↔ `Workspace 모드` 즉시 전환 지원
- **BYOK (Bring Your Own Key) 지원:** 브라우저 `localStorage` 기반 API 키 로컬 저장 및 Next.js 무상태(Stateless) Edge 프록시(`/api/chat`)를 통한 안전한 호출 처리
- **Mock Demo SSE 엔진:** API 키 미보유 방문자 및 면접관 대상 실제 SSE(Server-Sent Events) 스트리밍과 동일한 수준의 추론·도구 호출 시뮬레이션 제공
- **Mode A — EXAONE Studio:**
  - `choices[0].delta.reasoning_content` 분리 파싱 기반 실시간 `Thinking...` 아코디언 및 추론 소요 시간 표시
  - `reasoning_effort`(`low` / `high` / `max`) 제어, 512K(`524,288` 토큰) 실시간 사용량 바, `json_schema` 구조화 출력 설정, cURL/Python/JS 코드 내보내기
- **Mode B — EXAONE Workspace:**
  - 가상 파일 시스템(VFS) + `@monaco-editor/react` 코드 에디터 + `@codesandbox/sandpack-react` 실시간 웹 프리뷰 연동
  - `write_file` / `update_file` 멀티턴 에이전트 루프(`maxSteps = 5` 및 중지 제어) 시각화

---

## 기술 스택

- **Framework:** Next.js (App Router), TypeScript
- **Styling & UI:** Tailwind CSS, shadcn/ui, Lucide Icons, Framer Motion
- **State Management:** Zustand
- **Code Editor & Preview:** `@monaco-editor/react`, `@codesandbox/sandpack-react`
- **Markdown:** `react-markdown`, `rehype-highlight`

---

## 프로젝트 문서

- **마스터 구현 계획서:** [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md)
- **초기 서비스 기획 원안:** [exaoneServiceDemo.md](./exaoneServiceDemo.md)

---

## 단계별 구현 현황

- [x] **Step 0:** 마스터 구현 계획서 및 8단계 커밋 로드맵 문서화
- [ ] **Step 1:** Next.js 초기 세팅 및 글로벌 상단 헤더 구축
- [ ] **Step 2:** 기본 채팅 메시지 스키마 및 멀티턴 UI 구현
- [ ] **Step 3:** Mock SSE 스트리밍 엔진 및 `Thinking` 아코디언 UI 구현
- [ ] **Step 4:** BYOK 키 매니저 및 K-EXAONE 2.5 Edge 프록시 연동
- [ ] **Step 5:** Studio 파라미터 제어 패널(512K·JSON Schema·코드 Export) 완성 및 1차 배포
- [ ] **Step 6:** Workspace 가상 파일 트리, Monaco 에디터 및 Sandpack 프리뷰 연동
- [ ] **Step 7:** 에이전트 멀티턴 Tool Loop(`write_file`, `update_file`) 및 실행 상태 카드 구현
- [ ] **Step 8:** 프리셋 데모 시나리오 3종 고도화, 예외 처리 및 포트폴리오 마감
