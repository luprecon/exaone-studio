import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const MAX_TREE_DEPTH = 5;
export const MAX_TREE_NODES = 2000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

const BLOCKED_SEGMENTS = new Set([
  '.git',
  '.ssh',
  '.npmrc',
  'id_rsa',
  'id_ed25519'
]);

const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const CONTROL_CHAR_RE = /[\x00-\x1f]/;

export function isOutsideRoot(relPath: string): boolean {
  return (
    relPath === '..' ||
    relPath.startsWith(`..${sep}`) ||
    relPath.startsWith('../') ||
    relPath.startsWith('..\\') ||
    isAbsolute(relPath)
  );
}

export function assertNotSensitivePath(relativePath: string): void {
  const segments = relativePath
    .split(/[/\\]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    // Windows NTFS는 파일명 끝의 점/공백을 무시하므로 정규화 후 민감 경로 검사
    const clean = segment.replace(/[. ]+$/, '').toLowerCase();
    if (!clean) continue;

    if (BLOCKED_SEGMENTS.has(clean)) {
      throw new Error(`보안상 민감 경로(${segment}) 접근이 차단되었습니다.`);
    }
    if (
      (clean === '.env' || clean.startsWith('.env.')) &&
      clean !== '.env.example'
    ) {
      throw new Error(`환경 변수 파일(${segment}) 접근이 차단되었습니다.`);
    }
    if (clean.endsWith('.pem') || clean.endsWith('.key')) {
      throw new Error(`개인 키 파일(${segment}) 접근이 차단되었습니다.`);
    }
  }
}

export function assertSafeRelativePath(relativePath: string): string {
  if (typeof relativePath !== 'string') {
    throw new Error('유효하지 않은 파일 경로입니다.');
  }
  if (CONTROL_CHAR_RE.test(relativePath)) {
    throw new Error('유효하지 않은 제어 문자가 포함된 경로입니다.');
  }
  if (relativePath.includes(':')) {
    throw new Error(
      '보안상 콜론(:)이 포함된 경로(NTFS ADS 또는 드라이브 경로)는 차단되었습니다.'
    );
  }

  const normalizedRel = relativePath.replace(/^(?:\.[/\\]+|[/\\]+)+/, '');
  if (!normalizedRel || normalizedRel.trim() === '' || normalizedRel === '.') {
    throw new Error('유효하지 않은 파일 경로입니다.');
  }

  const segments = normalizedRel.split(/[/\\]+/).filter(Boolean);
  for (const segment of segments) {
    const clean = segment.replace(/[. ]+$/, '');
    if (clean && WINDOWS_RESERVED_NAME_RE.test(clean)) {
      throw new Error(
        `Windows 예약 장치 이름(${segment})은 파일 경로로 사용할 수 없습니다.`
      );
    }
  }

  assertNotSensitivePath(normalizedRel);
  return normalizedRel;
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const sampleLen = Math.min(buf.length, 8192);
  for (let i = 0; i < sampleLen; i += 1) {
    if (buf[i] === 0x00) {
      return true;
    }
  }
  return false;
}

export async function resolveSafeWorkspacePath(
  rootPath: string,
  relativePath: string,
  approvedRoots: ReadonlySet<string>
): Promise<string> {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('유효하지 않은 워크스페이스 루트 경로입니다.');
  }

  const resolvedRoot = resolve(rootPath);
  if (!approvedRoots.has(resolvedRoot)) {
    throw new Error('허용되지 않은 워크스페이스 루트 경로입니다.');
  }

  const normalizedRel = assertSafeRelativePath(relativePath);
  const resolvedTarget = resolve(resolvedRoot, normalizedRel);
  const rel = relative(resolvedRoot, resolvedTarget);

  if (!rel || rel === '.' || isOutsideRoot(rel)) {
    throw new Error('워크스페이스 루트 외부 경로 접근이 차단되었습니다.');
  }

  // 기존 경로 및 dangling symlink 차단을 위해 각 세그먼트를 lstat으로 순회 검증
  let current = resolvedRoot;
  let lastExisting = resolvedRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink()) {
        throw new Error('보안상 심볼릭 링크 경로 접근이 차단되었습니다.');
      }
      lastExisting = current;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        break;
      }
      throw err;
    }
  }

  const [realRoot, realExisting] = await Promise.all([
    realpath(resolvedRoot),
    realpath(lastExisting)
  ]);
  const realRel = relative(realRoot, realExisting);
  if (isOutsideRoot(realRel)) {
    throw new Error('심볼릭 링크를 통한 루트 외부 접근이 차단되었습니다.');
  }
  if (realRel && realRel !== '.') {
    assertNotSensitivePath(realRel);
  }

  return resolvedTarget;
}
