import { app, dialog, type BrowserWindow } from 'electron';
import {
  access,
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { WorkspaceFileNode, WorkspaceFolderResult } from '@shared/types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  '.turbo'
]);
const BLOCKED_SEGMENTS = new Set(['.git', '.ssh', '.npmrc', 'id_rsa', 'id_ed25519']);
const MAX_TREE_DEPTH = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function assertNotSensitivePath(relativePath: string): void {
  const segments = relativePath
    .split(/[/\\]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (BLOCKED_SEGMENTS.has(lower)) {
      throw new Error(`보안상 민감 경로(${segment}) 접근이 차단되었습니다.`);
    }
    if (
      (lower === '.env' || lower.startsWith('.env.')) &&
      lower !== '.env.example'
    ) {
      throw new Error(`환경 변수 파일(${segment}) 접근이 차단되었습니다.`);
    }
    if (lower.endsWith('.pem') || lower.endsWith('.key')) {
      throw new Error(`개인 키 파일(${segment}) 접근이 차단되었습니다.`);
    }
  }
}

async function findNearestExistingPath(targetPath: string): Promise<string> {
  let current = targetPath;
  while (true) {
    try {
      await access(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return current;
      }
      current = parent;
    }
  }
}

const approvedRoots = new Set<string>();

const STARTER_FILES: Record<string, string> = {
  'index.html': `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EXAONE Workspace Starter</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="card">
      <span class="badge">EXAONE Workspace</span>
      <h1>로컬 워크스페이스 준비 완료</h1>
      <p>좌측 에이전트에게 UI 수정이나 새 컴포넌트 생성을 지시해 보세요.</p>
      <button id="counter-btn" type="button">클릭 횟수: 0</button>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`,
  'styles.css': `* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #09090b;
  color: #f4f4f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.card {
  width: min(440px, 90vw);
  padding: 28px;
  border-radius: 16px;
  border: 1px solid #27272a;
  background: #18181b;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.16);
  border: 1px solid rgba(99, 102, 241, 0.35);
}

h1 {
  margin: 14px 0 8px;
  font-size: 20px;
}

p {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.5;
  color: #a1a1aa;
}

button {
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: #4f46e5;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: #6366f1;
}
`,
  'app.js': `const button = document.getElementById('counter-btn');
let count = 0;

if (button) {
  button.addEventListener('click', () => {
    count += 1;
    button.textContent = \`클릭 횟수: \${count}\`;
  });
}
`
};

async function resolveSafePath(
  rootPath: string,
  relativePath: string
): Promise<string> {
  const resolvedRoot = resolve(rootPath);
  if (!approvedRoots.has(resolvedRoot)) {
    throw new Error('허용되지 않은 워크스페이스 루트 경로입니다.');
  }

  const normalizedRel = relativePath.replace(/^[/\\]+/, '');
  assertNotSensitivePath(normalizedRel);

  const resolvedTarget = resolve(resolvedRoot, normalizedRel);
  const rel = relative(resolvedRoot, resolvedTarget);

  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    if (resolvedTarget !== resolvedRoot) {
      throw new Error('워크스페이스 루트 외부 경로 접근이 차단되었습니다.');
    }
  }

  // 기존 파일 및 신규 파일의 가장 가까운 기존 상위 폴더까지 realpath 검증
  const existingAncestor = await findNearestExistingPath(resolvedTarget);
  const [realRoot, realAncestor] = await Promise.all([
    realpath(resolvedRoot),
    realpath(existingAncestor)
  ]);
  const realRel = relative(realRoot, realAncestor);
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    throw new Error('심볼릭 링크를 통한 루트 외부 접근이 차단되었습니다.');
  }

  return resolvedTarget;
}

async function scanDirectory(
  rootPath: string,
  dirPath: string,
  depth: number
): Promise<WorkspaceFileNode[]> {
  if (depth > MAX_TREE_DEPTH) return [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes: WorkspaceFileNode[] = [];
  for (const entry of sorted) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      continue;
    }

    const fullPath = join(dirPath, entry.name);
    const relPath = relative(rootPath, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const children = await scanDirectory(rootPath, fullPath, depth + 1);
      nodes.push({
        name: entry.name,
        relativePath: relPath,
        kind: 'directory',
        children
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        relativePath: relPath,
        kind: 'file'
      });
    }
  }

  return nodes;
}

export async function openWorkspaceFolder(
  win: BrowserWindow | null
): Promise<WorkspaceFolderResult | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'EXAONE Workspace 로컬 폴더 선택',
    properties: ['openDirectory', 'createDirectory']
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const rootPath = resolve(result.filePaths[0]);
  approvedRoots.add(rootPath);
  const tree = await scanDirectory(rootPath, rootPath, 0);
  return { rootPath, tree };
}

export async function openSampleWorkspace(): Promise<WorkspaceFolderResult> {
  const sampleRoot = resolve(join(app.getPath('userData'), 'sample-workspace'));
  await mkdir(sampleRoot, { recursive: true });

  const existing = await readdir(sampleRoot);
  if (existing.length === 0) {
    for (const [relPath, content] of Object.entries(STARTER_FILES)) {
      await writeFile(join(sampleRoot, relPath), content, 'utf-8');
    }
  }

  approvedRoots.add(sampleRoot);
  const tree = await scanDirectory(sampleRoot, sampleRoot, 0);
  return { rootPath: sampleRoot, tree };
}

export async function listWorkspaceFiles(
  rootPath: string
): Promise<WorkspaceFileNode[]> {
  const resolvedRoot = resolve(rootPath);
  if (!approvedRoots.has(resolvedRoot)) {
    throw new Error('허용되지 않은 워크스페이스 루트 경로입니다.');
  }
  return scanDirectory(resolvedRoot, resolvedRoot, 0);
}

export async function readWorkspaceFile(
  rootPath: string,
  relativePath: string
): Promise<string> {
  const safePath = await resolveSafePath(rootPath, relativePath);
  const info = await stat(safePath);
  if (!info.isFile()) {
    throw new Error('파일이 아닌 대상은 읽을 수 없습니다.');
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new Error('2MB를 초과하는 대용량 파일은 에디터에서 열 수 없습니다.');
  }
  return readFile(safePath, 'utf-8');
}

export async function writeWorkspaceFile(
  rootPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const safePath = await resolveSafePath(rootPath, relativePath);
  await mkdir(dirname(safePath), { recursive: true });
  await writeFile(safePath, content, 'utf-8');
}
