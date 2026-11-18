export type AppMode = 'studio' | 'workspace';
export type RunMode = 'demo' | 'live';
export type ReasoningEffort = 'low' | 'high' | 'max';

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
  | { type: 'thinking'; text: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; delta: ToolCallDelta }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'rate_limit'; info: RateLimitInfo }
  | { type: 'error'; status?: number; message: string }
  | { type: 'done'; finishReason?: string };

export interface ToolCallRecord {
  id: string;
  name: string;
  argumentsJson: string;
  status: 'running' | 'success' | 'error';
  resultSummary?: string;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  thinkingDurationMs?: number;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCallRecord[];
  createdAt: number;
}

export interface ChatCompletionRequest {
  requestId: string;
  runMode: RunMode;
  model: 'k-exaone_v2.5';
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  responseSchemaJson?: string;
  tools?: Array<Record<string, unknown>>;
  scenarioId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  systemPrompt: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  recommendedEffort: ReasoningEffort;
  scenarioId?: string;
}

export interface WorkspaceFileNode {
  name: string;
  relativePath: string;
  kind: 'file' | 'directory';
  children?: WorkspaceFileNode[];
}

export interface WorkspaceFolderResult {
  rootPath: string;
  tree: WorkspaceFileNode[];
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
  openWorkspaceFolder: () => Promise<WorkspaceFolderResult | null>;
  openSampleWorkspace: () => Promise<WorkspaceFolderResult>;
  listWorkspaceFiles: (rootPath: string) => Promise<WorkspaceFileNode[]>;
  readWorkspaceFile: (rootPath: string, relativePath: string) => Promise<string>;
  writeWorkspaceFile: (
    rootPath: string,
    relativePath: string,
    content: string
  ) => Promise<void>;
}
