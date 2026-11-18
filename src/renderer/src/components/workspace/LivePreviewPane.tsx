import { useEffect, useState } from 'react';
import {
  Eye,
  RefreshCw,
  Monitor,
  Smartphone,
  FileWarning
} from 'lucide-react';
import { useWorkspaceStore } from '@renderer/store/useWorkspaceStore';

async function resolveRelativeAsset(
  rootPath: string,
  href: string,
  fileContents: Record<string, string>
): Promise<string | null> {
  const cleanRel = href.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!cleanRel || cleanRel.startsWith('http://') || cleanRel.startsWith('https://')) {
    return null;
  }
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
  let bundled = html;

  const linkRegex =
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  const linkMatches = [...bundled.matchAll(linkRegex)];
  for (const match of linkMatches) {
    const fullTag = match[0];
    const href = match[1];
    const css = await resolveRelativeAsset(rootPath, href, fileContents);
    if (css !== null) {
      bundled = bundled.replace(fullTag, () => `<style>\n${css}\n</style>`);
    }
  }

  const scriptRegex =
    /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  const scriptMatches = [...bundled.matchAll(scriptRegex)];
  for (const match of scriptMatches) {
    const fullTag = match[0];
    const src = match[1];
    const js = await resolveRelativeAsset(rootPath, src, fileContents);
    if (js !== null) {
      bundled = bundled.replace(fullTag, () => `<script>\n${js}\n</script>`);
    }
  }

  return bundled;
}

export function LivePreviewPane() {
  const { rootPath, previewRevision, fileContents, bumpPreviewRevision } =
    useWorkspaceStore();

  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [compiledHtml, setCompiledHtml] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!rootPath) {
        setCompiledHtml(null);
        setStatusNote(null);
        return;
      }

      try {
        const rawHtml =
          'index.html' in fileContents
            ? fileContents['index.html']
            : await window.exaoneAPI.readWorkspaceFile(rootPath, 'index.html');
        const bundled = await bundleHtmlForPreview(
          rootPath,
          rawHtml,
          fileContents
        );
        if (!cancelled) {
          setCompiledHtml(bundled);
          setStatusNote(null);
        }
      } catch {
        if (!cancelled) {
          setCompiledHtml(null);
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

  const handleManualRefresh = () => {
    bumpPreviewRevision();
    setReloadNonce((n) => n + 1);
  };

  return (
    <aside className="hidden xl:flex w-[420px] shrink-0 border-l border-zinc-800/80 bg-zinc-950 flex-col min-h-0">
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
            onClick={handleManualRefresh}
            title="프리뷰 새로고침"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3 bg-zinc-900/30 flex items-center justify-center overflow-auto">
        {!rootPath ? (
          <div className="text-center text-xs text-zinc-500 px-4 leading-relaxed">
            워크스페이스 폴더를 열거나 에이전트 작업을 실행하면 이곳에 실시간 웹 앱 프리뷰가 렌더링됩니다.
          </div>
        ) : compiledHtml !== null ? (
          <div
            className={`h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-inner transition-all ${
              viewport === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          >
            <iframe
              key={`${previewRevision}_${reloadNonce}`}
              title="Workspace Live Preview"
              sandbox="allow-scripts"
              srcDoc={compiledHtml}
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
