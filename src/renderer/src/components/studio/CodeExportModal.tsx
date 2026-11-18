import { useMemo, useState } from 'react';
import { Code, Copy, Check, X } from 'lucide-react';
import { useStudioStore } from '@renderer/store/useStudioStore';
import {
  generateCurlSnippet,
  generatePythonSnippet,
  generateTypeScriptSnippet
} from '@renderer/lib/codegen';

interface CodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SnippetTab = 'curl' | 'python' | 'typescript';

export function CodeExportModal({ isOpen, onClose }: CodeExportModalProps) {
  const {
    sessions,
    activeSessionId,
    reasoningEffort,
    temperature,
    maxTokens,
    responseSchemaJson
  } = useStudioStore();

  const [tab, setTab] = useState<SnippetTab>('curl');
  const [copied, setCopied] = useState(false);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const snippet = useMemo(() => {
    const input = {
      systemPrompt: activeSession?.systemPrompt ?? '',
      messages: activeSession?.messages ?? [],
      reasoningEffort,
      temperature,
      maxTokens,
      responseSchemaJson
    };
    if (tab === 'python') return generatePythonSnippet(input);
    if (tab === 'typescript') return generateTypeScriptSnippet(input);
    return generateCurlSnippet(input);
  }, [
    tab,
    activeSession,
    reasoningEffort,
    temperature,
    maxTokens,
    responseSchemaJson
  ]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 실패 무시
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="코드 내보내기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-3.5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              API 요청 코드 내보내기
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex items-center justify-between border-b border-zinc-800/80">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'curl', label: 'cURL' },
                { id: 'python', label: 'Python (OpenAI SDK)' },
                { id: 'typescript', label: 'TypeScript (Fetch SSE)' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="mb-1.5 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-200 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>코드 복사</span>
              </>
            )}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 bg-zinc-950">
          <pre className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-xs leading-relaxed text-zinc-200 overflow-x-auto">
            {snippet}
          </pre>
        </div>
      </div>
    </div>
  );
}
