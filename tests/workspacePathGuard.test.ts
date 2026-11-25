import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertNotSensitivePath,
  assertSafeRelativePath,
  isBinaryBuffer,
  isOutsideRoot,
  resolveSafeWorkspacePath
} from '../src/main/workspacePathGuard.ts';

test('isOutsideRoot allows ..notes.md and rejects traversal', () => {
  assert.equal(isOutsideRoot('..notes.md'), false);
  assert.equal(isOutsideRoot('src/..notes.md'), false);
  assert.equal(isOutsideRoot('..'), true);
  assert.equal(isOutsideRoot('../secret.txt'), true);
  assert.equal(isOutsideRoot('..\\secret.txt'), true);
});

test('assertSafeRelativePath blocks Windows NTFS ADS, trailing dots, and reserved device names', () => {
  assert.throws(() => assertSafeRelativePath('.env::$DATA'));
  assert.throws(() => assertSafeRelativePath('private.key::$DATA'));
  assert.throws(() => assertSafeRelativePath('cert.pem::$DATA'));
  assert.throws(() => assertSafeRelativePath('C:\\Windows\\win.ini'));
  assert.throws(() => assertSafeRelativePath('.env.'));
  assert.throws(() => assertSafeRelativePath('secret.key '));
  assert.throws(() => assertSafeRelativePath('.git/config'));
  assert.throws(() => assertSafeRelativePath('CON'));
  assert.throws(() => assertSafeRelativePath('sub/NUL.txt'));
  assert.throws(() => assertSafeRelativePath('bad\x00file.txt'));

  assert.equal(assertSafeRelativePath('./.env.example'), '.env.example');
  assert.equal(assertSafeRelativePath('/src/..notes.md'), 'src/..notes.md');
});

test('assertNotSensitivePath still catches .env.local and .pem variants', () => {
  assert.throws(() => assertNotSensitivePath('.env.local'));
  assert.throws(() => assertNotSensitivePath('certs/server.PEM'));
  assert.doesNotThrow(() => assertNotSensitivePath('.env.example'));
});

test('isBinaryBuffer detects NUL bytes within sample window', () => {
  assert.equal(isBinaryBuffer(Buffer.from('hello world\n한글', 'utf-8')), false);
  assert.equal(
    isBinaryBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    true
  );
});

test('resolveSafeWorkspacePath blocks dangling symlinks, in-workspace sensitive symlinks, and directory junctions', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'exaone-guard-'));
  const workspaceRoot = resolve(join(base, 'workspace'));
  const outsideDir = resolve(join(base, 'outside'));
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(workspaceRoot, '.env'), 'SECRET=1', 'utf-8');
  await writeFile(join(workspaceRoot, 'index.html'), '<h1>ok</h1>', 'utf-8');

  const approved = new Set([workspaceRoot]);

  try {
    // 정상 파일 및 미생성 신규 하위 경로 허용
    const valid = await resolveSafeWorkspacePath(
      workspaceRoot,
      'src/new-file.ts',
      approved
    );
    assert.equal(valid, resolve(workspaceRoot, 'src', 'new-file.ts'));

    // ..notes.md 정상 허용
    const dotNotes = await resolveSafeWorkspacePath(
      workspaceRoot,
      '..notes.md',
      approved
    );
    assert.equal(dotNotes, resolve(workspaceRoot, '..notes.md'));

    // 미승인 루트 차단
    await assert.rejects(() =>
      resolveSafeWorkspacePath(outsideDir, 'test.txt', approved)
    );

    // Windows에서도 관리자 권한 없이 생성 가능한 junction으로 루트 외부 링크 차단 검증
    const junctionPath = join(workspaceRoot, 'escape-dir');
    await symlink(outsideDir, junctionPath, process.platform === 'win32' ? 'junction' : 'dir');

    await assert.rejects(() =>
      resolveSafeWorkspacePath(workspaceRoot, 'escape-dir/pwn.txt', approved)
    );

    // 파일 심볼릭 링크 테스트 (Windows 비관리자 EPERM 환경에서는 파일 심볼릭 링크만 조건부 스킵)
    try {
      await symlink(
        join(outsideDir, 'does-not-exist-yet.txt'),
        join(workspaceRoot, 'dangling.txt'),
        'file'
      );
      await assert.rejects(() =>
        resolveSafeWorkspacePath(workspaceRoot, 'dangling.txt', approved)
      );

      await symlink(
        join(workspaceRoot, '.env'),
        join(workspaceRoot, 'leak.txt'),
        'file'
      );
      await assert.rejects(() =>
        resolveSafeWorkspacePath(workspaceRoot, 'leak.txt', approved)
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EPERM') {
        throw err;
      }
      t.diagnostic('파일 심볼릭 링크 생성 권한(EPERM)이 없어 junction 테스트만 검증함');
    }

    assert.equal(
      await readFile(join(workspaceRoot, 'index.html'), 'utf-8'),
      '<h1>ok</h1>'
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
