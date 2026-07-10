// Anthropic provider — Claude via the official SDK. Optional.
//
// Configured when ANTHROPIC_API_KEY is set. Kept as a first-class provider so
// the harness can route quality-critical tasks to Claude directly when desired.
import Anthropic from '@anthropic-ai/sdk';

export const name = 'anthropic';

export function defaultModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
}

export function configured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function chat({ system, prompt, model, maxTokens }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: model || defaultModel(),
    max_tokens: maxTokens || 2048,
    system: system || undefined,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = (message.content || []).find((b) => b.type === 'text');
  const text = block ? block.text.trim() : '';
  if (!text) throw new Error('Anthropic returned empty content.');
  return text;
}
