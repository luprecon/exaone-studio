import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyUpdateFileReplacement,
  normalizeWorkspaceRelPath,
  validateToolArgs
} from '../src/renderer/src/lib/workspaceToolUtils.ts';

test('normalizeWorkspaceRelPath unifies slashes and leading ./ while preserving traversal', () => {
  assert.equal(normalizeWorkspaceRelPath('./index.html'), 'index.html');
  assert.equal(normalizeWorkspaceRelPath('.\\src\\app.js'), 'src/app.js');
  assert.equal(normalizeWorkspaceRelPath('/src//./ui.tsx'), 'src/ui.tsx');
  assert.equal(normalizeWorkspaceRelPath('../.env'), '../.env');
  assert.equal(normalizeWorkspaceRelPath('./..notes.md'), '..notes.md');
});

test('validateToolArgs rejects missing or non-string fields instead of coercing to empty strings', () => {
  assert.equal(validateToolArgs('write_file', { path: 'a.txt' }).ok, false);
  assert.equal(
    validateToolArgs('write_file', { path: { bad: true }, content: 'hi' }).ok,
    false
  );
  assert.equal(
    validateToolArgs('write_file', { path: './a.txt', content: '' }).ok,
    true
  );
  assert.equal(
    validateToolArgs('update_file', { path: 'a.txt', target: 'foo' }).ok,
    false
  );
  assert.equal(validateToolArgs('', {}).ok, false);
});

test('applyUpdateFileReplacement supports LF and CRLF files and rejects ambiguous targets', () => {
  const crlf = 'line1\r\nconst a = 1;\r\nline3\r\n';
  const res = applyUpdateFileReplacement(crlf, 'const a = 1;\nline3', 'const a = 2;\nline3');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.nextContent, 'line1\r\nconst a = 2;\r\nline3\r\n');
  }

  const dup = 'foo\nbar\nfoo\n';
  const dupRes = applyUpdateFileReplacement(dup, 'foo', 'baz');
  assert.equal(dupRes.ok, false);

  const missingRes = applyUpdateFileReplacement(dup, 'nope', 'baz');
  assert.equal(missingRes.ok, false);
});
