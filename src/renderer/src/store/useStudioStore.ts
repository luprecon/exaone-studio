import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChatMessage,
  ChatSession,
  ReasoningEffort,
  TokenUsage
} from '@shared/types';

const DEFAULT_SYSTEM_PROMPT =
  '당신은 LG AI연구원의 K-EXAONE 2.5 AI 어시스턴트입니다. 논리적이고 정확한 한국어로 답변하고, 코드 예시는 실무 표준에 맞춰 작성하세요.';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialSession(): ChatSession {
  const now = Date.now();
  return {
    id: createId('session'),
    title: '새 프롬프트 세션',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

interface StudioState {
  sessions: ChatSession[];
  activeSessionId: string;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  responseSchemaJson: string;
  activeScenarioId: string | undefined;
  draftInput: string;
  isStreaming: boolean;
  activeRequestId: string | null;
  activeAssistantMessageId: string | null;
  thinkingStartedAt: number | null;
  lastUsage: TokenUsage | null;
  errorMessage: string | null;

  createSession: (preset?: {
    title?: string;
    systemPrompt?: string;
    reasoningEffort?: ReasoningEffort;
    scenarioId?: string;
    draftInput?: string;
  }) => string;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  resetActiveSession: () => void;
  updateSystemPrompt: (systemPrompt: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setResponseSchemaJson: (schemaJson: string) => void;
  setActiveScenarioId: (scenarioId: string | undefined) => void;
  setDraftInput: (text: string) => void;
  setErrorMessage: (message: string | null) => void;
  setLastUsage: (usage: TokenUsage | null) => void;

  addUserMessage: (content: string) => ChatMessage;
  startAssistantStream: (requestId: string) => string;
  appendThinking: (text: string) => void;
  appendContent: (text: string) => void;
  finalizeStream: () => void;
}

const firstSession = createInitialSession();

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      sessions: [firstSession],
      activeSessionId: firstSession.id,
      reasoningEffort: 'high',
      temperature: 0.6,
      maxTokens: 8192,
      responseSchemaJson: '',
      activeScenarioId: undefined,
      draftInput: '',
      isStreaming: false,
      activeRequestId: null,
      activeAssistantMessageId: null,
      thinkingStartedAt: null,
      lastUsage: null,
      errorMessage: null,

      createSession: (preset) => {
        const now = Date.now();
        const newSession: ChatSession = {
          id: createId('session'),
          title: preset?.title ?? '새 프롬프트 세션',
          systemPrompt: preset?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          messages: [],
          createdAt: now,
          updatedAt: now
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newSession.id,
          reasoningEffort: preset?.reasoningEffort ?? state.reasoningEffort,
          activeScenarioId: preset?.scenarioId,
          draftInput: preset?.draftInput ?? '',
          errorMessage: null,
          lastUsage: null
        }));
        return newSession.id;
      },

      selectSession: (sessionId) =>
        set({
          activeSessionId: sessionId,
          activeScenarioId: undefined,
          errorMessage: null
        }),

      deleteSession: (sessionId) =>
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== sessionId);
          if (remaining.length === 0) {
            const replacement = createInitialSession();
            return {
              sessions: [replacement],
              activeSessionId: replacement.id,
              activeScenarioId: undefined,
              errorMessage: null
            };
          }
          const nextActive =
            state.activeSessionId === sessionId
              ? remaining[0].id
              : state.activeSessionId;
          return {
            sessions: remaining,
            activeSessionId: nextActive,
            errorMessage: null
          };
        }),

      resetActiveSession: () =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? {
                  ...session,
                  title: '새 프롬프트 세션',
                  messages: [],
                  updatedAt: Date.now()
                }
              : session
          ),
          activeScenarioId: undefined,
          lastUsage: null,
          errorMessage: null
        })),

      updateSystemPrompt: (systemPrompt) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? { ...session, systemPrompt, updatedAt: Date.now() }
              : session
          )
        })),

      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setResponseSchemaJson: (responseSchemaJson) =>
        set({ responseSchemaJson }),
      setActiveScenarioId: (activeScenarioId) => set({ activeScenarioId }),
      setDraftInput: (draftInput) => set({ draftInput }),
      setErrorMessage: (errorMessage) => set({ errorMessage }),
      setLastUsage: (lastUsage) => set({ lastUsage }),

      addUserMessage: (content) => {
        const trimmed = content.trim();
        const userMessage: ChatMessage = {
          id: createId('msg'),
          role: 'user',
          content: trimmed,
          createdAt: Date.now()
        };

        const { activeSessionId } = get();
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== activeSessionId) return session;
            const isFirstMessage = session.messages.length === 0;
            const nextTitle = isFirstMessage
              ? trimmed.slice(0, 28) + (trimmed.length > 28 ? '...' : '')
              : session.title;
            return {
              ...session,
              title: nextTitle,
              messages: [...session.messages, userMessage],
              updatedAt: Date.now()
            };
          }),
          errorMessage: null
        }));
        return userMessage;
      },

      startAssistantStream: (requestId) => {
        const assistantMsgId = createId('msg');
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          thinking: '',
          thinkingDurationMs: 0,
          createdAt: Date.now()
        };
        const { activeSessionId } = get();
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  messages: [...session.messages, assistantMsg],
                  updatedAt: Date.now()
                }
              : session
          ),
          isStreaming: true,
          activeRequestId: requestId,
          activeAssistantMessageId: assistantMsgId,
          thinkingStartedAt: null,
          errorMessage: null
        }));
        return assistantMsgId;
      },

      appendThinking: (text) =>
        set((state) => {
          const { activeSessionId, activeAssistantMessageId } = state;
          if (!activeAssistantMessageId) return state;
          const startedAt = state.thinkingStartedAt ?? Date.now();
          const elapsedMs = Date.now() - startedAt;

          return {
            thinkingStartedAt: startedAt,
            sessions: state.sessions.map((session) => {
              if (session.id !== activeSessionId) return session;
              return {
                ...session,
                messages: session.messages.map((msg) =>
                  msg.id === activeAssistantMessageId
                    ? {
                        ...msg,
                        thinking: (msg.thinking ?? '') + text,
                        thinkingDurationMs: elapsedMs
                      }
                    : msg
                )
              };
            })
          };
        }),

      appendContent: (text) =>
        set((state) => {
          const { activeSessionId, activeAssistantMessageId } = state;
          if (!activeAssistantMessageId) return state;

          return {
            sessions: state.sessions.map((session) => {
              if (session.id !== activeSessionId) return session;
              return {
                ...session,
                messages: session.messages.map((msg) =>
                  msg.id === activeAssistantMessageId
                    ? { ...msg, content: msg.content + text }
                    : msg
                ),
                updatedAt: Date.now()
              };
            })
          };
        }),

      finalizeStream: () =>
        set({
          isStreaming: false,
          activeRequestId: null,
          activeAssistantMessageId: null,
          thinkingStartedAt: null
        })
    }),
    {
      name: 'exaone-studio-sessions-v1',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        reasoningEffort: state.reasoningEffort,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        responseSchemaJson: state.responseSchemaJson
      })
    }
  )
);
