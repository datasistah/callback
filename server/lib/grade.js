// Interview answer grading (Phase 5).
//
// Grades a candidate's transcribed spoken answer to a behavioral question on
// two axes:
//   - STAR structure — is the answer a complete Situation / Task / Action /
//     Result story? Each component scores 0–25, summing to a 0–100 structure
//     sub-score.
//   - Relevance — how on-topic the answer is to the question actually asked.
//
// Mirrors lib/questions.js and lib/ai.js exactly:
//   - an LLM path (gradeAnswerGrounded) when a provider is configured, routed
//     through the harness `star_critique` task,
//   - a deterministic rubric (gradeAnswerFallback) that always works with no
//     model at all, so grading runs free and is the guaranteed floor.
//
// A grade is a plain object:
//   { overall, star: { situation, task, action, result }, relevance, feedback, mode }
// which maps one-to-one onto the `answers` table columns. `mode` is 'llm' when
// a provider produced the grade or 'deterministic' for the no-LLM rubric.
import { complete as defaultComplete } from '../harness/llm/index.js';
import { aiEnabled } from './ai.js';

export { aiEnabled };

const clampInt = (n, lo, hi) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
};

// ── Deterministic rubric (no LLM) ───────────────────────────────────────────
//
// Each STAR component is detected by cue phrases. We deliberately keep this
// transparent and explainable — the four components are exactly what the UI
// shows — over clever NLP. A component scores in clean tiers by how many
// distinct cues fire: absent → 0, one cue → 14, two → 20, three+ → 25. This
// rewards *presence* strongly (a mentioned Result beats an omitted one) and
// detail incrementally, without letting any single axis dominate.
const STAR_TIERS = [0, 14, 20, 25];

// Cue patterns per STAR component. Matching is case-insensitive and counts
// DISTINCT patterns that fire (not total occurrences), so padding one phrase
// can't inflate a component.
const STAR_CUES = {
  // Situation — scene-setting: where/when, the context, the project.
  situation: [
    /\bwhen\b/, /\bwhile\b/, /\bat (?:my|the|a|an)\b/, /\bwe were\b/, /\bthe team\b/,
    /\bproject\b/, /\blast (?:year|month|quarter|week)\b/, /\bat the time\b/,
    /\bworking (?:on|as|at)\b/, /\bcompany\b/, /\bclient\b/, /\bcustomer\b/,
  ],
  // Task — the goal / responsibility / challenge to be solved.
  task: [
    /\bneeded to\b/, /\bhad to\b/, /\bmy (?:job|role|task|goal|responsibilit)/,
    /\bresponsible for\b/, /\btasked with\b/, /\bthe goal (?:was|is)\b/,
    /\bthe challenge\b/, /\bthe problem\b/, /\bobjective\b/, /\bwe needed\b/,
    /\bexpected to\b/, /\basked to\b/,
  ],
  // Action — what the candidate personally DID (first-person ownership).
  action: [
    /\bi (?:led|built|created|designed|implemented|decided|drove|proposed|organized|coordinated|wrote|developed|analyzed|migrated|refactored|shipped|launched|negotiated|mentored|resolved|prioritized)\b/,
    /\bi (?:worked|started|began|reached out|set up|put together|took|made|ran|managed|owned|handled|introduced)\b/,
    /\bmy approach\b/, /\bso i\b/, /\bi personally\b/, /\bwhat i did\b/, /\bi first\b/,
    /\bstep by step\b/,
  ],
  // Result — the outcome, ideally quantified.
  result: [
    /\bas a result\b/, /\bresulted in\b/, /\bwhich led to\b/, /\bthe result\b/,
    /\bin the end\b/, /\bultimately\b/, /\bincreased\b/, /\breduced\b/, /\bimproved\b/,
    /\bsaved\b/, /\bgrew\b/, /\bdelivered\b/, /\bwe (?:shipped|launched|hit)\b/,
    /\d+\s*%/, /\bby \d/, /\$\d/, /\bwon\b/,
  ],
};

function componentScore(text, cues) {
  let hits = 0;
  for (const re of cues) {
    if (re.test(text)) hits++;
  }
  return STAR_TIERS[Math.min(hits, STAR_TIERS.length - 1)];
}

const REL_STOP = new Set([
  'tell', 'me', 'about', 'time', 'you', 'your', 'a', 'an', 'the', 'and', 'or',
  'was', 'were', 'did', 'do', 'what', 'how', 'when', 'where', 'why', 'that',
  'this', 'with', 'for', 'to', 'of', 'in', 'on', 'at', 'as', 'is', 'are', 'be',
  'give', 'example', 'describe', 'walk', 'through', 'situation', 'action',
  'result', 'outcome', 'happened', 'handle', 'handled', 'approach', 'took',
  'their', 'they', 'it', 'its', 'i', 'my', 'we', 'our', 'us', 'had', 'have',
  'would', 'could', 'can', 'will', 'not', 'but', 'so', 'if', 'then', 'than',
]);

// Content words (>=3 chars, not boilerplate) from a chunk of text.
function contentWords(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^[-]+|[-]+$/g, ''))
      .filter((w) => w.length >= 3 && !REL_STOP.has(w))
  );
}

// Relevance: fraction of the question's content words the answer echoes,
// mapped to 0–100. Behavioral questions are generic ("a time you delivered
// impact"), so this is a coarse but honest on-topic signal. When the question
// has no distinct content words to match, stay neutral (50) rather than
// punishing an answer for the question's vagueness.
function relevanceScore(question, transcript) {
  const qWords = contentWords(question);
  if (qWords.size === 0) return 50;
  const aWords = contentWords(transcript);
  let overlap = 0;
  for (const w of qWords) {
    if (aWords.has(w)) overlap++;
  }
  return clampInt((overlap / qWords.size) * 100, 0, 100);
}

// Build short coaching feedback from the component scores: name what's strong
// and what's missing, so the candidate knows how to improve the next take.
function buildFeedback(star, relevance, wordCount) {
  if (wordCount < 8) {
    return 'Too brief to grade as a STAR story — give a full answer with the situation, what you did, and the outcome.';
  }
  const labels = { situation: 'Situation', task: 'Task', action: 'Action', result: 'Result' };
  const missing = Object.keys(star).filter((k) => star[k] < 14);
  const strong = Object.keys(star).filter((k) => star[k] >= 20);

  const parts = [];
  if (strong.length) parts.push(`Strong ${strong.map((k) => labels[k]).join(' and ')}.`);
  if (missing.length) {
    parts.push(
      `Develop the ${missing.map((k) => labels[k]).join(', ')} — ` +
        'name the setting, your specific role, and a concrete, ideally quantified outcome.'
    );
  } else {
    parts.push('Well-structured across all four STAR components.');
  }
  if (relevance < 40) {
    parts.push('Tie your example more directly to what the question asked.');
  }
  return parts.join(' ');
}

// Deterministic STAR grade — the guaranteed-free floor. Never throws.
export function gradeAnswerFallback({ question, transcript } = {}) {
  const text = String(transcript || '').toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const star = {
    situation: componentScore(text, STAR_CUES.situation),
    task: componentScore(text, STAR_CUES.task),
    action: componentScore(text, STAR_CUES.action),
    result: componentScore(text, STAR_CUES.result),
  };
  const relevance = relevanceScore(question, transcript);
  const starTotal = star.situation + star.task + star.action + star.result;
  // Blend structure (the dominant signal) with on-topic relevance.
  const overall = clampInt(0.7 * starTotal + 0.3 * relevance, 0, 100);

  return {
    overall,
    star,
    relevance,
    feedback: buildFeedback(star, relevance, wordCount),
    mode: 'deterministic',
  };
}

// ── LLM path ────────────────────────────────────────────────────────────────

// Pull the grade object out of a model reply, tolerating code fences / prose by
// slicing the first {…last} object, then validate + clamp every field. Returns
// null if nothing usable is present so the caller can fall back.
function parseGrade(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed.star && typeof parsed.star === 'object' ? parsed.star : {};
  const star = {
    situation: clampInt(s.situation, 0, 25),
    task: clampInt(s.task, 0, 25),
    action: clampInt(s.action, 0, 25),
    result: clampInt(s.result, 0, 25),
  };
  // Trust an explicit overall if given, else derive it from the components so a
  // model that scored the parts but omitted the total still yields a number.
  const starTotal = star.situation + star.task + star.action + star.result;
  const overall =
    parsed.overall != null ? clampInt(parsed.overall, 0, 100) : clampInt(starTotal, 0, 100);
  return {
    overall,
    star,
    relevance: clampInt(parsed.relevance, 0, 100),
    feedback:
      typeof parsed.feedback === 'string' && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : '',
    mode: 'llm',
  };
}

// LLM path: ask the model to grade the answer against the question on STAR
// completeness and relevance. Falls back to the deterministic rubric whenever
// the model errors (a rate-limited free tier, an outage) or returns nothing
// usable — so grading can never leave the caller empty-handed or throw a 500.
export async function gradeAnswerGrounded({ question, transcript, complete = defaultComplete } = {}) {
  // Nothing to grade — don't spend a model call on an empty transcript.
  if (!String(transcript || '').trim()) {
    return gradeAnswerFallback({ question, transcript });
  }

  const system =
    'You are an experienced interview coach grading a candidate\'s spoken answer ' +
    'to a behavioral interview question. Grade on two axes: (1) STAR structure — ' +
    'score Situation, Task, Action, and Result each from 0 to 25 by how clearly ' +
    'the answer covers that component; (2) relevance — 0 to 100, how directly the ' +
    'answer addresses the specific question asked. Also give an overall score ' +
    'from 0 to 100 and one or two sentences of concrete, encouraging coaching ' +
    'feedback. Be fair but honest: a vague or incomplete answer should score ' +
    'lower. Return ONLY a JSON object of the form {"overall":0-100,"star":' +
    '{"situation":0-25,"task":0-25,"action":0-25,"result":0-25},"relevance":' +
    '0-100,"feedback":"..."} with no prose.';

  const prompt = [
    'INTERVIEW QUESTION:',
    String(question || '').trim(),
    '',
    "CANDIDATE'S ANSWER (transcribed):",
    String(transcript).trim(),
    '',
    'Grade this answer. Return JSON only.',
  ].join('\n');

  let raw;
  try {
    raw = await complete({ task: 'star_critique', system, prompt, maxTokens: 1024 });
  } catch (err) {
    console.warn(`grade_answer: LLM failed, using deterministic rubric (${err.message}).`);
    return gradeAnswerFallback({ question, transcript });
  }
  return parseGrade(raw) || gradeAnswerFallback({ question, transcript });
}

// Single entry point used by the registry tool / routes: LLM when configured,
// deterministic otherwise. Mirrors the aiEnabled() switch used for tailoring
// and question generation.
export async function gradeAnswer({ question, transcript } = {}) {
  return aiEnabled()
    ? gradeAnswerGrounded({ question, transcript })
    : gradeAnswerFallback({ question, transcript });
}
