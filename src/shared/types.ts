export type AppMode = 'studio' | 'workspace';
export type RunMode = 'demo' | 'live';
export type ReasoningEffort = 'low' | 'high' | 'max';

export interface RateLimitInfo {
  minuteLimit?: number;
  minuteRemaining?: number;
  dayLimit?: number;
  dayRemaining?: number;
  retryAfterSeconds?: number;
}

export interface ExaoneIPCBridge {
  hasApiKey: () => Promise<boolean>;
}
