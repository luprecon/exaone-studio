# EXAONE Studio & Workspace Desktop

LG AI연구원의 **K-EXAONE 2.5 API(`k-exaone_v2.5`)**를 기반으로 Google AI Studio 스타일 프롬프트 플레이그라운드(**Studio**)와 Antigravity 스타일 로컬 에이전트 코딩 환경(**Workspace**)을 통합한 **독립 실행형 데스크톱 AI 애플리케이션**.

---

## 핵심 아키텍처 및 주요 기능

- **Electron 네이티브 데스크톱 구조:** Main·Preload·Renderer 3-프로세스 분리를 통한 독립 창 실행 및 Windows 실행 파일(`.exe`) 패키징 지원
- **K-EXAONE 2.5 직접 통신:** Electron Main 프로세스 내 직접 HTTPS SSE 스트리밍 호출 수행(브라우저 CORS 제약 및 별도 프록시 서버 제거)
- **로컬 보안 키 저장 (BYOK):** Electron `safeStorage` 기반 사용자 API 키 암호화 보관 및 앱 내 `Demo Mode` ↔ `Live API Mode` 실시간 전환
- **내장 Mock Demo 엔진:** API 키 미입력 환경 및 일일 100회 제한 상황에서도 추론·도구 호출 전체 워크플로우 체험 가능
- **Mode A — EXAONE Studio:**
  - `choices[0].delta.reasoning_content` 분리 파싱 기반 실시간 `Thinking...` 아코디언 및 추론 소요 시간 표시
  - `reasoning_effort`(`low` / `high` / `max`) 제어, 512K(`524,288` 토큰) 실시간 게이지, `json_schema` 구조화 출력 설정, cURL/Python/JS 코드 내보내기
- **Mode B — EXAONE Workspace:**
  - 사용자 PC 실제 로컬 폴더 열기, `workspaceRoot` 경로 샌드박싱 보안 적용, `@monaco-editor/react` 코드 편집 및 디스크 저장
  - `list_files` / `read_file` / `write_file` / `update_file` 멀티턴 에이전트 루프(`maxSteps = 5` 및 중지 제어)와 실시간 프리뷰 연동

---

## 기술 스택

- **Desktop Runtime & Build:** Electron, `electron-vite`, `electron-builder`
- **Frontend & Language:** React, TypeScript, Vite
- **Styling & UI:** Tailwind CSS, shadcn/ui, Lucide Icons, Framer Motion
- **State Management:** Zustand
- **Code Editor & Markdown:** `@monaco-editor/react`, `react-markdown`, `rehype-highlight`

---

## 프로젝트 문서

- **마스터 구현 계획서:** [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md)
- **초기 서비스 기획 원안:** [exaoneServiceDemo.md](./exaoneServiceDemo.md)

---

## 단계별 구현 현황

- [x] **Step 0:** Electron 데스크톱 앱 마스터 구현 계획서 및 8단계 로드맵 확정
- [x] **Step 1:** `electron-vite` 데스크톱 앱 초기 세팅 및 상단 헤더 구축
- [x] **Step 2:** 채팅 메시지 타입 정의 및 기본 멀티턴 채팅창 구현
- [x] **Step 3:** 내장 Mock 스트리밍 엔진 및 `Thinking` 아코디언 UI 구현
- [x] **Step 4:** 로컬 API 키 안전 저장소(`safeStorage`) 및 K-EXAONE 2.5 직접 스트리밍 연동
- [x] **Step 5:** Studio 파라미터 제어 패널(512K·JSON Schema·코드 Export) 완성
- [x] **Step 6:** Workspace 실제 로컬 폴더 탐색기 및 Monaco 코드 에디터 연동
- [x] **Step 7:** 로컬 파일 제어 에이전트 루프(`write_file`, `update_file`) 및 실시간 프리뷰 구현
- [x] **Step 8:** 프리셋 데모 시나리오 3종 탑재 및 Windows 실행 파일(`.exe`) 패키징 구성

---

## 실행 및 패키징 방법

- **의존성 설치:** `npm install`
- **개발 모드 실행:** `npm run dev` (독립 Electron 데스크톱 창 기동 및 HMR 지원)
- **타입 검증 및 번들 빌드:** `npm run typecheck && npm run build`
- **Windows 포터블 `.exe` 패키징:** `npm run dist:win` (`dist/EXAONE-Studio-0.1.0-portable.exe` 단독 실행 파일 생성)
- **즉시 체험 안내:**
  - 별도 API 키 미입력 상태에서 상단 `데모 시나리오` 버튼을 통한 3종 프리셋 즉시 시연 가능
  - 상단 `API Key` 메뉴에서 K-EXAONE 2.5 키 등록 후 `Live API` 모드 전환을 통한 실서버 연동 지원
