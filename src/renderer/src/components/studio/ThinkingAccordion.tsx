import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Clock } from 'lucide-react';

interface ThinkingAccordionProps {
  thinking: string;
  durationMs?: number;
  isThinkingActive: boolean;
}

export function ThinkingAccordion({
  thinking,
  durationMs = 0,
  isThinkingActive
}: ThinkingAccordionProps) {
  const [isOpen, setIsOpen] = useState(isThinkingActive);
  const [liveMs, setLiveMs] = useState(durationMs);
  const startRef = useRef<number | null>(null);
  const durationMsRef = useRef(durationMs);
  durationMsRef.current = durationMs;

  useEffect(() => {
    if (isThinkingActive) {
      setIsOpen(true);
    }
  }, [isThinkingActive]);

  useEffect(() => {
    if (!isThinkingActive) {
      startRef.current = null;
      return;
    }

    startRef.current = Date.now() - durationMsRef.current;
    setLiveMs(Date.now() - startRef.current);

    const timer = setInterval(() => {
      if (startRef.current !== null) {
        setLiveMs(Date.now() - startRef.current);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isThinkingActive]);

  useEffect(() => {
    if (!isThinkingActive) {
      setLiveMs(durationMs);
    }
  }, [isThinkingActive, durationMs]);

  if (!thinking && !isThinkingActive) {
    return null;
  }

  const secondsText = (liveMs / 1000).toFixed(1);

  return (
    <div className="mb-3 rounded-xl border border-indigo-500/25 bg-zinc-950/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-zinc-900/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <BrainCircuit
            className={`w-3.5 h-3.5 shrink-0 ${
              isThinkingActive
                ? 'text-indigo-400 animate-pulse'
                : 'text-indigo-400/80'
            }`}
          />
          <span className="font-medium text-indigo-200 truncate">
            {isThinkingActive ? 'Thinking...' : 'Thought Process'}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 shrink-0">
          <Clock className="w-2.5 h-2.5 text-zinc-500" />
          {secondsText}s
        </span>
      </button>

      {isOpen && (
        <div className="px-3.5 py-2.5 border-t border-zinc-800/80 bg-zinc-950/60 max-h-64 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-400">
            {thinking || '추론 토큰 수신 대기 중...'}
          </pre>
        </div>
      )}
    </div>
  );
}
