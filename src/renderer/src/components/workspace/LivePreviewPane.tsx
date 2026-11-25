import { useEffect, useState } from 'react';
import {
  Eye,
  RefreshCw,
  Monitor,
  Smartphone,
  FileWarning,
  X
} from 'lucide-react';
import { normalizeWorkspaceRelPath } from '@renderer/lib/workspaceToolUtils';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

interface LivePreviewPaneProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
}

async function resolveRelativeAsset(
  rootPath: string,
  href: string,
  fileContents: Record<string, string>
): Promise<string | null> {
  const withoutQuery = href.split(/[?#]/)[0]?.trim() ?? '';
  if (
    !withoutQuery ||
    withoutQuery.startsWith('http://') ||
    withoutQuery.startsWith('https://') ||
    withoutQuery.startsWith('//') ||
    withoutQuery.startsWith('data:') ||
    withoutQuery.startsWith('blob:')
  ) {
    return null;
  }

  const cleanRel = normalizeWorkspaceRelPath(withoutQuery);
  if (!cleanRel) return null;

  if (cleanRel in fileContents) {
    return fileContents[cleanRel];
  }
  try {
    return await window.exaoneAPI.readWorkspaceFile(rootPath, cleanRel);
  } catch {
    return null;
  }
}

async function bundleHtmlForPreview(
  rootPath: string,
  html: string,
  fileContents: Record<string, string>
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[href]')].filter(
    (el) => el.relList.contains('stylesheet')
  );
  for (const linkEl of links) {
    const href = linkEl.getAttribute('href') ?? '';
    const css = await resolveRelativeAsset(rootPath, href, fileContents);
    if (css !== null) {
      const styleEl = doc.createElement('style');
      styleEl.textContent = css.replace(/<\/(style)/gi, '<\\/$1');
      linkEl.replaceWith(styleEl);
    }
  }

  const scripts = [...doc.querySelectorAll('script[src]')];
  for (const scriptEl of scripts) {
    const src = scriptEl.getAttribute('src') ?? '';
    const js = await resolveRelativeAsset(rootPath, src, fileContents);
    if (js !== null) {
      const inlineScript = doc.createElement('script');
      const scriptType = scriptEl.getAttribute('type');
      if (scriptType) {
        inlineScript.setAttribute('type', scriptType);
      }
      inlineScript.textContent = js.replace(/<\/(script)/gi, '<\\/$1');
      scriptEl.replaceWith(inlineScript);
    }
  }

  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}>\n`
    : '<!doctype html>\n';
  return `${doctype}${doc.documentElement.outerHTML}`;
}

export function LivePreviewPane({
  isMobileOpen = false,
  onClose
}: LivePreviewPaneProps) {
  const { rootPath, previewRevision, refreshTree } = useWorkspaceStore();

  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!rootPath) {
        setPreviewUrl(null);
        setStatusNote(null);
        return;
      }

      try {
        const fileContents = useWorkspaceStore.getState().fileContents;
        const rawHtml =
          'index.html' in fileContents
            ? fileContents['index.html']
            : await window.exaoneAPI.readWorkspaceFile(rootPath, 'index.html');
        const bundled = await bundleHtmlForPreview(
          rootPath,
          rawHtml,
          fileContents
        );
        const url = await window.exaoneAPI.setPreviewHtml(bundled);
        if (!cancelled) {
          setPreviewUrl(url);
          setStatusNote(null);
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null);
          setStatusNote(
            '현재 열린 폴더 루트에 index.html 파일이 없어 프리뷰를 표시할 수 없습니다.'
          );
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [rootPath, previewRevision, reloadNonce]);

  const handleManualRefresh = async () => {
    await refreshTree();
    setReloadNonce((n) => n + 1);
  };

  return (
    <aside
      className={`${
        isMobileOpen
          ? 'flex absolute right-0 inset-y-0 z-30 shadow-2xl xl:static xl:shadow-none'
          : 'hidden xl:flex'
      } w-[420px] max-w-[92vw] shrink-0 border-l border-zinc-800/80 bg-zinc-950 flex-col min-h-0`}
    >
      <div className="h-10 shrink-0 px-3 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>실시간 프리뷰</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            title="데스크톱 너비"
            className={`p-1.5 rounded cursor-pointer ${
              viewport === 'desktop'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            title="모바일 너비 (390px)"
            className={`p-1.5 rounded cursor-pointer ${
              viewport === 'mobile'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            title="프리뷰 새로고침"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="프리뷰 닫기"
              className="xl:hidden p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3 bg-zinc-900/30 flex items-center justify-center overflow-auto">
        {!rootPath ? (
          <div className="text-center text-xs text-zinc-500 px-4 leading-relaxed">
            워크스페이스 폴더를 열거나 에이전트 작업을 실행하면 이곳에 실시간 웹 앱 프리뷰가 렌더링됩니다.
          </div>
        ) : previewUrl !== null ? (
          <div
            className={`h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-inner transition-all ${
              viewport === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          >
            <iframe
              key={previewUrl}
              title="Workspace Live Preview"
              sandbox="allow-scripts allow-forms"
              src={previewUrl}
              className="w-full h-full border-0 bg-zinc-950"
            />
          </div>
        ) : (
          <div className="text-center space-y-2 px-4">
            <FileWarning className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              {statusNote}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
