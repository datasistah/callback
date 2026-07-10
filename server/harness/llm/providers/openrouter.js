// OpenRouter provider — OpenAI-compatible chat completions.
//
// Configured when OPENROUTER_API_KEY is set. Routes to any model available on
// OpenRouter (set OPENROUTER_MODEL, e.g. a `:free` model to start at no cost).
const BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

export const name = 'openrouter';

export function defaultModel() {
  return process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
}

export function configured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chat({ system, prompt, model, maxTokens }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      // Optional attribution headers OpenRouter recommends.
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5173',
      'X-Title': 'Callback',
    },
    body: JSON.stringify({
      model: model || defaultModel(),
      messages,
      max_tokens: maxTokens || 2048,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenRouter returned empty content.');
  return text;
}
