// webspeech — the $0 default voice provider.
//
// Voice is a STT -> (LLM) -> TTS pipeline, and — like the server's LLM router —
// it's a swappable seam. This provider uses only the browser's built-in Web
// Speech APIs, so the interview demo runs with zero external cost and no voice
// server: SpeechSynthesis reads a question aloud (TTS), SpeechRecognition
// transcribes the spoken answer (STT). Both are best-effort — support varies by
// browser (Chrome/Edge are fullest; Safari partial; Firefox lacks recognition),
// so every capability is feature-detected and callers must degrade gracefully.

// SpeechRecognition is still vendor-prefixed in most engines.
const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

const hasSynthesis =
  typeof window !== 'undefined' && 'speechSynthesis' in window

// The set of installed system voices. getVoices() is often empty on first call
// and populates asynchronously, so we also listen for `voiceschanged`.
function listVoices() {
  if (!hasSynthesis) return []
  try {
    return window.speechSynthesis.getVoices() || []
  } catch {
    return []
  }
}

// Subscribe to the voice list becoming available/changing. Returns an
// unsubscribe fn. Callers use this to refresh a voice picker once the browser
// has loaded its catalogue.
function subscribeVoices(cb) {
  if (!hasSynthesis || typeof window.speechSynthesis.addEventListener !== 'function') {
    return () => {}
  }
  const handler = () => cb(listVoices())
  window.speechSynthesis.addEventListener('voiceschanged', handler)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
}

// Speak `text` aloud in the chosen voice. Resolves when the utterance finishes
// (or immediately if TTS is unavailable, so callers can always await it without
// branching). Cancels any in-flight speech first so questions never overlap.
function speak(text, { voiceURI, rate = 1, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!hasSynthesis || !text) {
      resolve(false)
      return
    }
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const match = voiceURI && listVoices().find((v) => v.voiceURI === voiceURI)
      if (match) {
        u.voice = match
        u.lang = match.lang
      }
      u.rate = rate
      u.pitch = pitch
      u.onend = () => resolve(true)
      u.onerror = () => resolve(false)
      window.speechSynthesis.speak(u)
    } catch {
      resolve(false)
    }
  })
}

// Stop any in-flight TTS immediately.
function cancelSpeech() {
  if (hasSynthesis) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* no-op */
    }
  }
}

// Create a recognizer that streams a live transcript. Callbacks:
//   onInterim(text) — the in-progress guess for the current utterance
//   onFinal(text)   — a settled chunk, appended to the running transcript
//   onError(kind)   — 'not-allowed' (mic denied), 'no-speech', or the raw code
//   onEnd()         — recognition stopped (manually or by the engine)
// Returns a controller { start, stop }. Recognition runs continuously until
// stop() is called; some engines still fire `onend` on their own, so callers
// should treat onEnd as informational, not a completion signal.
function createRecognizer({ onInterim, onFinal, onError, onEnd, lang = 'en-US' } = {}) {
  if (!SpeechRecognition) return null

  const rec = new SpeechRecognition()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true

  rec.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const chunk = result[0]?.transcript || ''
      if (result.isFinal) {
        onFinal?.(chunk.trim())
      } else {
        interim += chunk
      }
    }
    if (interim) onInterim?.(interim.trim())
  }
  rec.onerror = (event) => onError?.(event.error || 'unknown')
  rec.onend = () => onEnd?.()

  let running = false
  return {
    start() {
      if (running) return
      try {
        rec.start()
        running = true
      } catch {
        // start() throws if already started — treat as running.
        running = true
      }
    },
    stop() {
      if (!running) return
      running = false
      try {
        rec.stop()
      } catch {
        /* no-op */
      }
    },
  }
}

export const webspeech = {
  id: 'webspeech',
  label: 'Browser (Web Speech)',
  ttsSupported: hasSynthesis,
  sttSupported: Boolean(SpeechRecognition),
  speak,
  cancelSpeech,
  createRecognizer,
  listVoices,
  subscribeVoices,
}
