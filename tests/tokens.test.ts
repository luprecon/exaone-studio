import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CONTEXT_TOKENS,
  clampMaxTokens
} from '../src/renderer/src/lib/tokens.ts';

test('clampMaxTokens respects exact 512K remaining boundaries', () => {
  assert.equal(clampMaxTokens(8192, MAX_CONTEXT_TOKENS), 0);
  assert.equal(clampMaxTokens(8192, MAX_CONTEXT_TOKENS + 500), 0);
  assert.equal(clampMaxTokens(8192, MAX_CONTEXT_TOKENS - 100), 100);
  assert.equal(clampMaxTokens(8192, MAX_CONTEXT_TOKENS - 1000), 1000);
  assert.equal(clampMaxTokens(8192, 1000), 8192);
});
