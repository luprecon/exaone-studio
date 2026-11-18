import type { AppMode, ReasoningEffort } from '@shared/types';

export interface DemoScenarioMeta {
  id: 'scenario-512k-rca' | 'scenario-effort-compare' | 'scenario-workspace-dashboard';
  mode: AppMode;
  badge: string;
  title: string;
  description: string;
  systemPrompt?: string;
  userPrompt: string;
  recommendedEffort: ReasoningEffort;
}

export const DEMO_SCENARIOS: DemoScenarioMeta[] = [
  {
    id: 'scenario-512k-rca',
    mode: 'studio',
    badge: '512K Context',
    title: '시나리오 1: 512K 대용량 장애 로그·코드 심층 분석',
    description:
      '248K 토큰 규모의 마이크로서비스 분산 로그와 설정 컨텍스트를 분석해 장애 근본 원인과 패치 코드를 도출합니다.',
    systemPrompt:
      '당신은 대규모 분산 시스템 장애 분석(RCA) 전문가입니다. 512K 컨텍스트 내 추적 로그를 대조해 타임라인과 재발 방지 패치를 제시하세요.',
    userPrompt:
      '[시나리오 1] 첨부된 248K 토큰 규모의 결제·주문 서비스 통합 장애 로그(Trace-8912a 포함)와 Redis/DB 설정을 분석해 근본 원인과 TypeScript 서킷 브레이커 패치를 작성해줘.',
    recommendedEffort: 'max'
  },
  {
    id: 'scenario-effort-compare',
    mode: 'studio',
    badge: 'Reasoning Effort',
    title: '시나리오 2: reasoning_effort (low / high / max) 추론 깊이 비교',
    description:
      '동일한 동시성 레이스 컨디션 및 알고리즘 최적화 문제에 대해 추론 깊이별 사고 과정과 해법 정밀도를 비교합니다.',
    systemPrompt:
      '당신은 고성능 백엔드 및 동시성 아키텍처 전문가입니다. 설정된 reasoning_effort 깊이에 맞춰 문제 분석과 최적 코드를 제시하세요.',
    userPrompt:
      '[시나리오 2] 다중 워커 환경에서 토큰 버킷 Rate Limiter를 갱신할 때 발생하는 Race Condition과 메모리 누수를 해결하는 최적 알고리즘을 reasoning_effort 단계별로 비교해줘.',
    recommendedEffort: 'max'
  },
  {
    id: 'scenario-workspace-dashboard',
    mode: 'workspace',
    badge: 'Agentic IDE',
    title: '시나리오 3: Workspace 에이전트 모니터링 대시보드 자동 구축',
    description:
      '에이전트가 로컬 폴더에 write_file 및 update_file 도구를 연속 호출해 인터랙티브 K-EXAONE 모니터링 앱을 생성·반영합니다.',
    userPrompt:
      '[시나리오 3] K-EXAONE 2.5 실시간 토큰 사용량, reasoning_effort별 레이턴시, 일일 잔여 쿼터를 시뮬레이션하는 인터랙티브 모니터링 대시보드 웹 앱을 생성하고 테마 상태를 개선해줘.',
    recommendedEffort: 'high'
  }
];
