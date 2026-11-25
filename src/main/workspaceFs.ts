import { app, dialog, type BrowserWindow } from 'electron';
import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { WorkspaceFileNode, WorkspaceFolderResult } from '@shared/types';
import {
  MAX_FILE_BYTES,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
  isBinaryBuffer,
  resolveSafeWorkspacePath
} from './workspacePathGuard';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  '.turbo'
]);

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

async function scanDirectory(
  rootPath: string,
  dirPath: string,
  depth: number,
  counter: { count: number } = { count: 0 }
): Promise<WorkspaceFileNode[]> {
  if (depth > MAX_TREE_DEPTH || counter.count >= MAX_TREE_NODES) return [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes: WorkspaceFileNode[] = [];
  for (const entry of sorted) {
    if (counter.count >= MAX_TREE_NODES) break;

    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      continue;
    }

    const fullPath = join(dirPath, entry.name);
    const relPath = relative(rootPath, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      counter.count += 1;
      const children = await scanDirectory(rootPath, fullPath, depth + 1, counter);
      nodes.push({
        name: entry.name,
        relativePath: relPath,
        kind: 'directory',
        children
      });
    } else if (entry.isFile()) {
      counter.count += 1;
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
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('유효하지 않은 워크스페이스 루트 경로입니다.');
  }
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
  const safePath = await resolveSafeWorkspacePath(
    rootPath,
    relativePath,
    approvedRoots
  );
  const info = await stat(safePath);
  if (!info.isFile()) {
    throw new Error('파일이 아닌 대상은 읽을 수 없습니다.');
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new Error('2MB를 초과하는 대용량 파일은 에디터에서 열 수 없습니다.');
  }
  const buf = await readFile(safePath);
  if (isBinaryBuffer(buf)) {
    throw new Error('바이너리 파일은 텍스트 에디터에서 열 수 없습니다.');
  }
  return buf.toString('utf-8');
}

export async function writeWorkspaceFile(
  rootPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  if (typeof content !== 'string') {
    throw new Error('유효하지 않은 파일 내용 형식입니다.');
  }
  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES) {
    throw new Error('2MB를 초과하는 대용량 파일은 저장할 수 없습니다.');
  }
  const safePath = await resolveSafeWorkspacePath(
    rootPath,
    relativePath,
    approvedRoots
  );
  await mkdir(dirname(safePath), { recursive: true });
  await writeFile(safePath, content, 'utf-8');
}
