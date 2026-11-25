import {
  Sparkles,
  Code2,
  FlaskConical,
  Radio,
  KeyRound,
  Activity,
  PlayCircle
} from 'lucide-react';
import { useAppStore } from '@renderer/store/useAppStore';
import appIcon from '@renderer/assets/app-icon.png';
import exaoneModelAvatar from '@renderer/assets/exaone-model-avatar.png';

export function Header() {
  const {
    appMode,
    runMode,
    hasApiKey,
    rateLimit,
    setAppMode,
    setRunMode,
    setApiKeyModalOpen,
    setScenariosModalOpen
  } = useAppStore();

  const handleToggleRunMode = (nextMode: 'demo' | 'live') => {
    if (nextMode === 'live' && !hasApiKey) {
      setApiKeyModalOpen(true);
      return;
    }
    setRunMode(nextMode);
  };

  return (
    <header className="h-14 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-4 flex items-center justify-between gap-4 select-none">
      {/* 좌측 브랜드 & 모델 배지 */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shadow-sm shadow-indigo-500/20 shrink-0">
          <img
            src={appIcon}
            alt="EXAONE Studio App Icon"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span
            title="Unofficial Desktop Client for K-EXAONE 2.5"
            className="font-semibold text-sm tracking-tight text-zinc-100 truncate"
          >
            EXAONE Studio
          </span>
          <span
            title="Powered by LG AI Research K-EXAONE 2.5 (Unofficial Client)"
            className="hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-indigo-300"
          >
            <img
              src={exaoneModelAvatar}
              alt="EXAONE Model"
              className="h-4 w-4 rounded-sm bg-white p-0.5 object-contain shrink-0"
            />
            <span>k-exaone_v2.5</span>
          </span>
        </div>
      </div>

      {/* 중앙 Dual Mode 스위처 */}
      <nav
        aria-label="모드 전환"
        className="flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800"
      >
        <button
          type="button"
          onClick={() => setAppMode('studio')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            appMode === 'studio'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Studio 모드</span>
        </button>
        <button
          type="button"
          onClick={() => setAppMode('workspace')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            appMode === 'workspace'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Workspace 모드</span>
        </button>
      </nav>

      {/* 우측 데모 시나리오, 실행 모드, Rate Limit 배지, API Key 버튼 */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setScenariosModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-medium text-amber-300 transition-colors cursor-pointer"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">데모 시나리오</span>
        </button>

        {rateLimit && rateLimit.dayRemaining !== undefined && (
          <div
            title="K-EXAONE 일일 잔여 호출량"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>
              일일 잔여 {rateLimit.dayRemaining}
              {rateLimit.dayLimit ? `/${rateLimit.dayLimit}` : '회'}
            </span>
          </div>
        )}

        <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => handleToggleRunMode('demo')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              runMode === 'demo'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <FlaskConical className="w-3 h-3" />
            <span>Demo Mode</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleRunMode('live')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              runMode === 'live'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Live API</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setApiKeyModalOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            hasApiKey
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/70'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">API Key</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              hasApiKey
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {hasApiKey ? '암호화 저장됨' : '미등록'}
          </span>
        </button>
      </div>
    </header>
  );
}
