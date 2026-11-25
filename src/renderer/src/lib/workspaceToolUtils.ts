export function normalizeWorkspaceRelPath(raw: string): string {
  const replaced = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of replaced.split('/')) {
    if (!seg || seg === '.') continue;
    parts.push(seg);
  }
  return parts.join('/');
}

export type ValidatedToolArgs =
  | { ok: true; toolName: 'list_files' }
  | { ok: true; toolName: 'read_file'; path: string }
  | { ok: true; toolName: 'write_file'; path: string; content: string }
  | {
      ok: true;
      toolName: 'update_file';
      path: string;
      target: string;
      replacement: string;
    }
  | { ok: false; error: string };

export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>
): ValidatedToolArgs {
  if (toolName === 'list_files') {
    return { ok: true, toolName: 'list_files' };
  }

  if (
    toolName === 'read_file' ||
    toolName === 'write_file' ||
    toolName === 'update_file'
  ) {
    if (typeof args.path !== 'string') {
      return { ok: false, error: 'path 인자는 문자열이어야 합니다.' };
    }
    const normalizedPath = normalizeWorkspaceRelPath(args.path);
    if (!normalizedPath) {
      return { ok: false, error: 'path 인자가 비어 있습니다.' };
    }

    if (toolName === 'read_file') {
      return { ok: true, toolName: 'read_file', path: normalizedPath };
    }

    if (toolName === 'write_file') {
      if (typeof args.content !== 'string') {
        return { ok: false, error: 'content 인자는 문자열이어야 합니다.' };
      }
      return {
        ok: true,
        toolName: 'write_file',
        path: normalizedPath,
        content: args.content
      };
    }

    if (typeof args.target !== 'string' || args.target.length === 0) {
      return {
        ok: false,
        error: 'target 인자는 비어 있지 않은 문자열이어야 합니다.'
      };
    }
    if (typeof args.replacement !== 'string') {
      return { ok: false, error: 'replacement 인자는 문자열이어야 합니다.' };
    }
    return {
      ok: true,
      toolName: 'update_file',
      path: normalizedPath,
      target: args.target,
      replacement: args.replacement
    };
  }

  return {
    ok: false,
    error: `알 수 없는 도구입니다: ${toolName || '(이름 없음)'}`
  };
}

export function applyUpdateFileReplacement(
  current: string,
  target: string,
  replacement: string
): { ok: true; nextContent: string } | { ok: false; error: string } {
  if (!target) {
    return { ok: false, error: 'target 인자가 비어 있습니다.' };
  }

  const hasCrlf = current.includes('\r\n');
  const currentLf = current.replace(/\r\n/g, '\n');
  const targetLf = target.replace(/\r\n/g, '\n');
  const replacementLf = replacement.replace(/\r\n/g, '\n');

  const firstIdx = currentLf.indexOf(targetLf);
  if (firstIdx === -1) {
    return { ok: false, error: '파일에서 대상 문자열을 찾을 수 없습니다.' };
  }

  const secondIdx = currentLf.indexOf(targetLf, firstIdx + targetLf.length);
  if (secondIdx !== -1) {
    return {
      ok: false,
      error:
        '대상 문자열이 파일 내 여러 곳에서 일치합니다. 더 구체적인 문맥을 지정해 주세요.'
    };
  }

  const replacedLf =
    currentLf.slice(0, firstIdx) +
    replacementLf +
    currentLf.slice(firstIdx + targetLf.length);

  return {
    ok: true,
    nextContent: hasCrlf ? replacedLf.replace(/\n/g, '\r\n') : replacedLf
  };
}
