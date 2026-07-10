// Agent Harness — LLM provider router.
//
// One interface (`complete`) over multiple providers. Each *task* is routed to
// a provider (and its model) chosen from env config, with a sensible default
// and a fallback to whichever provider is actually configured. This is the
// "swappable engine" seam the whole app builds on: features name a task, the
// router decides which model runs it.
import * as openrouter from './providers/openrouter.js';
import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';

const PROVIDERS = { openrouter, ollama, anthropic };

// Default provider per task. Quality-critical tasks go to OpenRouter; cheap /
// offline drafting goes to local Ollama. Override any task with an env var:
//   CALLBACK_PROVIDER_RESUME_TAILOR=ollama
const TASK_PROVIDER = {
  resume_tailor: 'openrouter',
  cover_letter: 'openrouter',
  star_critique: 'openrouter',
  question_gen: 'openrouter',
  draft: 'ollama',
};

function globalDefault() {
  return process.env.CALLBACK_LLM_PROVIDER || 'openrouter';
}

function configuredProviders() {
  return Object.values(PROVIDERS).filter((p) => p.configured());
}

// True when at least one provider is usable. Callers use this to decide
// whether to attempt an LLM call or fall back to a deterministic mock.
export function llmEnabled() {
  return configuredProviders().length > 0;
}

// Resolve which provider handles a task: explicit task override → task default
// → global default → first configured provider. Only ever returns a provider
// that is actually configured (so a missing key silently falls back).
function resolveProvider(task) {
  const override = process.env[`CALLBACK_PROVIDER_${String(task || '').toUpperCase()}`];
  const preferredName = override || TASK_PROVIDER[task] || globalDefault();
  const preferred = PROVIDERS[preferredName];
  if (preferred && preferred.configured()) return preferred;
  return configuredProviders()[0] || null;
}

// Snapshot of provider config — handy for a status endpoint / debugging.
export function providerStatus() {
  return {
    enabled: llmEnabled(),
    default: globalDefault(),
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([n, p]) => [
        n,
        { configured: p.configured(), model: p.defaultModel() },
      ])
    ),
  };
}

// Run a single-shot completion for a named task. Throws a tagged error:
//   { code: 'llm_not_configured' } → no provider configured (caller falls back)
//   { code: 'generation_failed' }  → the chosen provider's call failed
export async function complete({ task, system, prompt, maxTokens }) {
  const provider = resolveProvider(task);
  if (!provider) {
    const err = new Error('No LLM provider configured.');
    err.code = 'llm_not_configured';
    throw err;
  }
  try {
    return await provider.chat({ system, prompt, maxTokens });
  } catch (cause) {
    const err = new Error(`LLM generation failed (${provider.name}): ${cause.message}`);
    err.code = 'generation_failed';
    err.cause = cause;
    throw err;
  }
}
