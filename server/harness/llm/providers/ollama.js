// Ollama provider — local models (e.g. Qwen) via the Ollama daemon.
//
// Configured when OLLAMA_ENABLED=1 (or an OLLAMA_MODEL is named). The daemon
// runs at OLLAMA_BASE_URL. Reachability is only checked at call time — the
// daemon may be installed but not running.
const BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export const name = 'ollama';

export function defaultModel() {
  return process.env.OLLAMA_MODEL || 'qwen2.5:3b';
}

export function configured() {
  return process.env.OLLAMA_ENABLED === '1' || Boolean(process.env.OLLAMA_MODEL);
}

export async function chat({ system, prompt, model, maxTokens }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || defaultModel(),
      messages,
      stream: false,
      options: { num_predict: maxTokens || 2048 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error('Ollama returned empty content.');
  return text;
}
