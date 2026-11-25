import assert from 'node:assert/strict';
import test from 'node:test';
import type { StreamChunk } from '../src/shared/types.ts';
import { parseExaoneSseStream } from '../src/main/sseParser.ts';

function streamFromStrings(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    }
  });
}

test('parseExaoneSseStream emits thinking, content, tool_call, usage, and done in order', async () => {
  const chunks: StreamChunk[] = [];
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"생각 중"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"안녕"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
    'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"completion_tokens_details":{"reasoning_tokens":2}}}\n\n',
    'data: [DONE]\n\n'
  ];

  await parseExaoneSseStream(
    streamFromStrings(sse),
    (c) => chunks.push(c),
    new AbortController().signal
  );

  assert.deepEqual(
    chunks.map((c) => c.type),
    ['thinking', 'content', 'tool_call', 'tool_call', 'usage', 'done']
  );
  assert.deepEqual(chunks.at(-1), { type: 'done', finishReason: 'tool_calls' });
});

test('parseExaoneSseStream does NOT emit trailing done after in-stream error', async () => {
  const chunks: StreamChunk[] = [];
  const sse = [
    'data: {"choices":[{"delta":{"content":"부분"}}]}\n\n',
    'data: {"error":{"message":"upstream failure"}}\n\n',
    'data: [DONE]\n\n'
  ];

  await parseExaoneSseStream(
    streamFromStrings(sse),
    (c) => chunks.push(c),
    new AbortController().signal
  );

  assert.deepEqual(chunks, [
    { type: 'content', text: '부분' },
    { type: 'error', message: 'upstream failure' }
  ]);
});

test('parseExaoneSseStream emits error on HTTP 200 non-SSE JSON error body', async () => {
  const chunks: StreamChunk[] = [];
  await parseExaoneSseStream(
    streamFromStrings(['{"error":{"message":"invalid model quota"}}']),
    (c) => chunks.push(c),
    new AbortController().signal
  );

  assert.deepEqual(chunks, [
    { type: 'error', message: 'invalid model quota' }
  ]);
});

test('parseExaoneSseStream supports multi-line SSE data events', async () => {
  const chunks: StreamChunk[] = [];
  const sse = [
    'data: {"choices":[{"delta":\n',
    'data: {"content":"멀티라인"}}]}\n\n',
    'data: [DONE]\n\n'
  ];

  await parseExaoneSseStream(
    streamFromStrings(sse),
    (c) => chunks.push(c),
    new AbortController().signal
  );

  assert.deepEqual(chunks, [
    { type: 'content', text: '멀티라인' },
    { type: 'done', finishReason: 'stop' }
  ]);
});

test('parseExaoneSseStream emits done with finishReason aborted when signal is aborted', async () => {
  const chunks: StreamChunk[] = [];
  const ac = new AbortController();
  ac.abort();

  await parseExaoneSseStream(
    streamFromStrings(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n']),
    (c) => chunks.push(c),
    ac.signal
  );

  assert.deepEqual(chunks, [{ type: 'done', finishReason: 'aborted' }]);
});
