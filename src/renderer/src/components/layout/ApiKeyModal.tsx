import { useState, type FormEvent } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import { useAppStore } from '@renderer/store/useAppStore';

export function ApiKeyModal() {
  const {
    isApiKeyModalOpen,
    hasApiKey,
    setApiKeyModalOpen,
    setHasApiKey,
    setRunMode
  } = useAppStore();

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  if (!isApiKeyModalOpen) {
    return null;
  }

  const handleClose = () => {
    setFeedbackError(null);
    setApiKeyInput('');
    setApiKeyModalOpen(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    setIsSaving(true);

    try {
      const result = await window.exaoneAPI.saveApiKey(apiKeyInput);
      if (!result.ok) {
        setFeedbackError(result.error ?? 'API 키 저장에 실패했습니다.');
        return;
      }

      setHasApiKey(true);
      setRunMode('live');
      setApiKeyInput('');
      setApiKeyModalOpen(false);
    } catch (err) {
      setFeedbackError(
        err instanceof Error ? err.message : 'API 키 저장 중 오류가 발생했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setFeedbackError(null);
    setIsSaving(true);
    try {
      await window.exaoneAPI.clearApiKey();
      setHasApiKey(false);
      setRunMode('demo');
      setApiKeyInput('');
      setApiKeyModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-sm font-semibold text-zinc-100"
              >
                K-EXAONE 2.5 API Key 관리
              </h2>
              <p className="text-[11px] text-zinc-400">
                Electron safeStorage 로컬 암호화 보관
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1.5 text-xs text-zinc-300 leading-relaxed">
            <div className="flex items-center gap-1.5 font-medium text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>로컬 전용 BYOK 보안 구조</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              입력한 키는 외부 서버에 전송·저장되지 않으며 내 PC의 OS 암호화 저장소에만 보관됩니다. 키는 공식 포털(docs.exaone.ai)에서 발급받을 수 있습니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="exaone-api-key-input"
              className="block text-xs font-medium text-zinc-300"
            >
              {hasApiKey ? '새 API 키로 교체' : 'EXAONE API Key'}
            </label>
            <div className="relative">
              <input
                id="exaone-api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="exaone-... 형태의 키를 입력하세요"
                autoFocus
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? '키 숨기기' : '키 보기'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {feedbackError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{feedbackError}</span>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between gap-2">
            {hasApiKey ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-800/60 bg-rose-950/30 hover:bg-rose-950/60 text-xs font-medium text-rose-300 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>저장된 키 삭제</span>
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">
                키 없이도 Demo Mode 사용 가능
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving || !apiKeyInput.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-medium text-white cursor-pointer"
              >
                {isSaving ? '저장 중...' : '암호화 저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
