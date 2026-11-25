import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../src/shared/types.ts';
import {
  buildApiMessages,
  buildResponseFormat,
  sanitizeGenerationParams
} from '../src/main/exaonePayload.ts';

test('buildApiMessages strips orphaned tool_calls without matching tool replies', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', content: '만들어줘', createdAt: 1 },
    {
      id: '2',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_ok',
          name: 'read_file',
          argumentsJson: '{"path":"index.html"}',
          status: 'success'
        },
        {
          id: 'call_orphan',
          name: 'write_file',
          argumentsJson: '{"path":"app.js"',
          status: 'running'
        }
      ],
      createdAt: 2
    },
    {
      id: '3',
      role: 'tool',
      toolCallId: 'call_ok',
      toolName: 'read_file',
      content: '<html></html>',
      createdAt: 3
    },
    {
      id: '4',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_all_orphan',
          name: 'write_file',
          argumentsJson: '{}',
          status: 'running'
        }
      ],
      createdAt: 4
    }
  ];

  const apiMessages = buildApiMessages(messages);
  assert.equal(apiMessages.length, 3);
  assert.equal((apiMessages[1].tool_calls as unknown[]).length, 1);
  assert.equal((apiMessages[1].tool_calls as Array<{ id: string }>)[0].id, 'call_ok');
  assert.equal(apiMessages[2].role, 'tool');
  assert.equal(apiMessages[2].tool_call_id, 'call_ok');
});

test('buildResponseFormat validates JSON object syntax', () => {
  assert.deepEqual(buildResponseFormat(''), { ok: true, value: undefined });
  assert.equal(buildResponseFormat('[1,2]').ok, false);
  assert.equal(buildResponseFormat('{invalid').ok, false);

  const valid = buildResponseFormat('{"type":"object"}');
  assert.equal(valid.ok, true);
});

test('sanitizeGenerationParams clamps temperature and maxTokens bounds', () => {
  assert.deepEqual(sanitizeGenerationParams(Number.NaN, 8192, 10000), {
    temperature: 0.6,
    maxTokens: 8192
  });
  assert.deepEqual(sanitizeGenerationParams(-5, 999999, 5000), {
    temperature: 0,
    maxTokens: 5000
  });
  assert.deepEqual(sanitizeGenerationParams(3, 512, 100), {
    temperature: 2,
    maxTokens: 100
  });
});
