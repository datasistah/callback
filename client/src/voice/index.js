// Voice provider selector — the client-side analogue of the server's LLM router.
//
// One env var picks the active provider (`VITE_VOICE_PROVIDER`), defaulting to
// the free browser path. An unknown value, or `realtime` before it's wired up,
// falls back to `webspeech` so the demo always has a working voice. Components
// import `getVoiceProvider()` and never reference a concrete provider directly.
import { webspeech } from './webspeech.js'
import { realtime } from './realtime.js'

const PROVIDERS = { webspeech, realtime }

// Resolve the configured provider, falling back to webspeech when the requested
// one is unknown or (like realtime today) not actually usable.
export function getVoiceProvider() {
  const requested = (import.meta.env?.VITE_VOICE_PROVIDER || 'webspeech').trim()
  const provider = PROVIDERS[requested]
  if (!provider) return webspeech
  // realtime advertises `configured: false` until its backend exists.
  if (provider.configured === false) return webspeech
  return provider
}

export { webspeech, realtime }
