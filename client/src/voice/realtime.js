// realtime — opt-in premium voice provider (stub).
//
// This is the paid speech-to-speech seam: a WebSocket to OpenAI Realtime
// (gpt-realtime-*) or Gemini Live, consumed directly from the client/Node with
// no ADK. It is deliberately unimplemented here — its only job in Phase 4 is to
// prove the seam exists so wiring it up later doesn't touch the Studio UI. Per
// the locked "free/local must always work" rule, this provider is never the
// default; selecting it without configuration surfaces a clear message and the
// caller falls back to webspeech.
//
// It intentionally mirrors the webspeech shape (same method names, same return
// contracts) so the Studio treats providers interchangeably.

const NOT_CONFIGURED = 'realtime voice is not configured — using the browser voice instead.'

async function speak() {
  return false
}

function cancelSpeech() {
  /* no-op until a realtime session exists */
}

function createRecognizer() {
  return null
}

function listVoices() {
  return []
}

function subscribeVoices() {
  return () => {}
}

export const realtime = {
  id: 'realtime',
  label: 'Realtime (premium)',
  ttsSupported: false,
  sttSupported: false,
  configured: false,
  reason: NOT_CONFIGURED,
  speak,
  cancelSpeech,
  createRecognizer,
  listVoices,
  subscribeVoices,
}
