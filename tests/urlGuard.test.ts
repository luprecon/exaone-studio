import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedInAppUrl } from '../src/main/urlGuard.ts';

test('isAllowedInAppUrl in production allows only app://exaone and rejects file:// or foreign schemes', () => {
  assert.equal(isAllowedInAppUrl('app://exaone/index.html'), true);
  assert.equal(isAllowedInAppUrl('app://exaone'), true);
  assert.equal(isAllowedInAppUrl('app://exaone/assets/index.js?v=1'), true);

  assert.equal(isAllowedInAppUrl('file:///C:/evil.html'), false);
  assert.equal(isAllowedInAppUrl('app://other/index.html'), false);
  assert.equal(isAllowedInAppUrl('app://user@exaone/index.html'), false);
  assert.equal(isAllowedInAppUrl('exaone-preview://sandbox/123'), false);
  assert.equal(isAllowedInAppUrl('https://example.com'), false);
  assert.equal(isAllowedInAppUrl('http://localhost:5173'), false);
  assert.equal(isAllowedInAppUrl('not-a-valid-url'), false);
});

test('isAllowedInAppUrl in dev mode allows only exact ELECTRON_RENDERER_URL origin', () => {
  const devUrl = 'http://localhost:5173';
  assert.equal(isAllowedInAppUrl('http://localhost:5173/', devUrl), true);
  assert.equal(isAllowedInAppUrl('http://localhost:5173/foo?x=1', devUrl), true);

  assert.equal(isAllowedInAppUrl('http://localhost:5174/', devUrl), false);
  assert.equal(isAllowedInAppUrl('app://exaone/index.html', devUrl), false);
  assert.equal(isAllowedInAppUrl('file:///C:/evil.html', devUrl), false);
});
