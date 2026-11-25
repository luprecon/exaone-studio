import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generatePythonSnippet,
  generateTypeScriptSnippet
} from '../src/renderer/src/lib/codegen.ts';

test('generatePythonSnippet emits valid Python True/False/None with JSON Schema', () => {
  const snippet = generatePythonSnippet({
    systemPrompt: 'system',
    messages: [{ id: '1', role: 'user', content: 'hello', createdAt: 1 }],
    reasoningEffort: 'high',
    temperature: 0.6,
    maxTokens: 4096,
    responseSchemaJson: JSON.stringify({
      type: 'object',
      properties: { ok: { type: 'boolean' }, note: { default: null } },
      additionalProperties: false
    })
  });

  assert.match(snippet, /"strict": True/);
  assert.match(snippet, /"additionalProperties": False/);
  assert.match(snippet, /"default": None/);
  assert.doesNotMatch(snippet, /:\s*(true|false|null)\b/);
});

test('generateTypeScriptSnippet breaks outer stream loop on [DONE]', () => {
  const snippet = generateTypeScriptSnippet({
    systemPrompt: '',
    messages: [],
    reasoningEffort: 'low',
    temperature: 0.5,
    maxTokens: 2048,
    responseSchemaJson: ''
  });

  assert.match(snippet, /streamLoop:\s*while \(true\)/);
  assert.match(snippet, /if \(raw === "\[DONE\]"\) break streamLoop;/);
});
