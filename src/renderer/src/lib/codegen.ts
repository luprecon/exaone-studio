import type { ChatMessage, ReasoningEffort } from '@shared/types';
import { clampMaxTokens, estimateContextTokens } from './tokens';

export interface CodegenInput {
  systemPrompt: string;
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxTokens: number;
  responseSchemaJson: string;
}

function buildPayload(input: CodegenInput): Record<string, unknown> {
  const estimatedInput = estimateContextTokens(
    input.systemPrompt,
    input.messages
  );
  const clampedMaxTokens = clampMaxTokens(input.maxTokens, estimatedInput) || 4096;

  const apiMessages: Array<{ role: string; content: string }> = [];
  if (input.systemPrompt.trim()) {
    apiMessages.push({
      role: 'system',
      content: input.systemPrompt.trim()
    });
  }
  for (const msg of input.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }
  if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1].role !== 'user') {
    apiMessages.push({
      role: 'user',
      content: '여기에 프롬프트를 입력하세요.'
    });
  }

  const payload: Record<string, unknown> = {
    model: 'k-exaone_v2.5',
    messages: apiMessages,
    reasoning_effort: input.reasoningEffort,
    temperature: input.temperature,
    max_tokens: clampedMaxTokens,
    stream: true
  };

  if (input.responseSchemaJson.trim()) {
    try {
      const parsed = JSON.parse(input.responseSchemaJson) as Record<string, unknown>;
      payload.response_format =
        'schema' in parsed && 'name' in parsed
          ? { type: 'json_schema', json_schema: parsed }
          : {
              type: 'json_schema',
              json_schema: {
                name: 'exaone_structured_output',
                strict: true,
                schema: parsed
              }
            };
    } catch {
      // 유효하지 않은 스키마는 스니펫에서 제외
    }
  }

  return payload;
}

export function generateCurlSnippet(input: CodegenInput): string {
  const payload = buildPayload(input);
  const json = JSON.stringify(payload, null, 2).replace(/'/g, "'\\''");
  return `curl -N https://api.exaone.ai/v1/chat/completions \\
  -H "Authorization: Bearer \${EXAONE_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '${json}'`;
}

export function generatePythonSnippet(input: CodegenInput): string {
  const payload = buildPayload(input);
  const messagesJson = JSON.stringify(payload.messages, null, 2);
  const extraBody: Record<string, unknown> = {
    reasoning_effort: payload.reasoning_effort
  };
  if (payload.response_format) {
    extraBody.response_format = payload.response_format;
  }

  return `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("EXAONE_API_KEY"),
    base_url="https://api.exaone.ai/v1",
)

stream = client.chat.completions.create(
    model="k-exaone_v2.5",
    messages=${messagesJson},
    temperature=${input.temperature},
    max_tokens=${payload.max_tokens},
    stream=True,
    extra_body=${JSON.stringify(extraBody, null, 4)},
)

for chunk in stream:
    delta = chunk.choices[0].delta
    reasoning = getattr(delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="", flush=True)
    if delta.content:
        print(delta.content, end="", flush=True)`;
}

export function generateTypeScriptSnippet(input: CodegenInput): string {
  const payload = buildPayload(input);
  return `const apiKey = process.env.EXAONE_API_KEY;

const response = await fetch("https://api.exaone.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${apiKey}\`,
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
});

if (!response.ok || !response.body) {
  throw new Error(\`HTTP \${response.status}\`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") break;
    const json = JSON.parse(raw);
    const delta = json.choices?.[0]?.delta;
    if (delta?.reasoning_content) process.stdout.write(delta.reasoning_content);
    if (delta?.content) process.stdout.write(delta.content);
  }
}`;
}
