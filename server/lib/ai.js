// LLM helper for tailoring resumes and generating cover letters.
//
// Routes through the Agent Harness LLM layer (harness/llm), which picks the
// provider per task (OpenRouter / Ollama / Anthropic). The match score is a
// separate deterministic heuristic (lib/score.js) and never touches this file
// — it must work with no LLM configured at all.
//
// Contract:
//  - aiEnabled()  → true when any LLM provider is configured.
//  - tailorResume / generateCoverLetter throw a tagged error on failure:
//      { code: 'llm_not_configured' } → no provider (caller returns 503)
//      { code: 'generation_failed' }  → LLM call failed (caller returns 502)
import { complete, llmEnabled } from '../harness/llm/index.js';
import { extractKeywords } from './score.js';

export function aiEnabled() {
  return llmEnabled();
}

export async function tailorResume({ profile, job }) {
  const system =
    'You are an expert resume writer. Rewrite the candidate\'s base resume so it ' +
    'is tailored to the specific job. Keep every claim truthful to the base ' +
    'resume — do not invent experience. Emphasize the skills and keywords the ' +
    'job asks for where the candidate genuinely has them. Return only the ' +
    'tailored resume text, no preamble.';

  const prompt = [
    `JOB TITLE: ${job.title}`,
    `COMPANY: ${job.company}`,
    'JOB DESCRIPTION:',
    job.description,
    '',
    'CANDIDATE BASE RESUME / PROFILE:',
    profile,
  ].join('\n');

  return complete({ task: 'resume_tailor', system, prompt, maxTokens: 2048 });
}

export async function generateCoverLetter({ profile, job }) {
  const system =
    'You are an expert cover-letter writer. Write a personalized cover letter ' +
    'for the candidate applying to the job. Name the company and reflect its ' +
    'stack/requirements. Keep it truthful to the candidate\'s base resume. ' +
    'Return only the cover letter text, no preamble.';

  const prompt = [
    `JOB TITLE: ${job.title}`,
    `COMPANY: ${job.company}`,
    'JOB DESCRIPTION:',
    job.description,
    '',
    'CANDIDATE BASE RESUME / PROFILE:',
    profile,
  ].join('\n');

  return complete({ task: 'cover_letter', system, prompt, maxTokens: 2048 });
}

// ---------------------------------------------------------------------------
// Deterministic no-AI fallbacks. Used when ANTHROPIC_API_KEY is absent so the
// full core loop (tailor → score, cover letter) works end-to-end with no key.
// Synchronous, never throw; output is clearly labelled as a mock.
// ---------------------------------------------------------------------------

function firstLine(profile) {
  const line = (profile || '').split('\n').map((s) => s.trim()).find(Boolean);
  return line || 'Candidate';
}

// Keywords from the job description, de-noised and capped for readability.
function jobSkills(job, max = 12) {
  return extractKeywords(job.description)
    .filter((k) => k.length > 2)
    .slice(0, max);
}

export function tailorResumeFallback({ profile, job }) {
  const skills = jobSkills(job);
  const focus = skills.slice(0, 4).join(', ');
  return [
    firstLine(profile),
    `Tailored for ${job.title} at ${job.company}`,
    '',
    'PROFESSIONAL SUMMARY',
    `${job.title} candidate aligning proven experience to ${job.company}'s needs` +
      (focus ? `, with emphasis on ${focus}.` : '.'),
    '',
    'BASE EXPERIENCE',
    profile.trim(),
    '',
    'SKILLS ALIGNED TO THIS ROLE',
    skills.length ? skills.join(' · ') : '(no distinct skills detected in the job description)',
    '',
    '— Generated without AI (deterministic mock). Add an ANTHROPIC_API_KEY for AI-tailored output.',
  ].join('\n');
}

export function generateCoverLetterFallback({ profile, job }) {
  const skills = jobSkills(job, 5);
  const focus = skills.length ? skills.slice(0, 3).join(', ') : 'the requirements outlined in the posting';
  return [
    `Dear ${job.company} Hiring Team,`,
    '',
    `I'm excited to apply for the ${job.title} role at ${job.company}. My background maps directly to what you're looking for, particularly ${focus}.`,
    '',
    `Across my career I've focused on the outcomes that matter for a role like this, and I'd bring that same focus to ${job.company}. The strengths in my profile align closely with your needs, and I'm confident I can contribute quickly.`,
    '',
    'I would welcome the opportunity to discuss how I can help your team. Thank you for your consideration.',
    '',
    'Sincerely,',
    firstLine(profile),
    '',
    '— Generated without AI (deterministic mock). Add an ANTHROPIC_API_KEY for AI-written letters.',
  ].join('\n');
}
