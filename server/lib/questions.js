// Behavioral interview-question generation.
//
// Turns a JOB DESCRIPTION into the STAR-eliciting behavioral questions a
// candidate is likely to be ASKED for that role — the goal is interview prep,
// so questions are derived from the role's responsibilities and required
// skills, NOT from the candidate's own history. Mirrors lib/ai.js:
//   - an LLM path (generateQuestionsGrounded) when a provider is configured,
//   - a deterministic fallback (generateQuestionsFallback) that always works
//     with no model at all, so the demo runs free.
//
// Every question is a plain object { text, competency, source }, which maps
// one-to-one onto the `questions` table columns. `source` is either 'jd' (drawn
// from the job description — its skills or the role itself) or 'core' (a
// role-agnostic behavioral competency).
import { complete as defaultComplete } from '../harness/llm/index.js';
import { aiEnabled } from './ai.js';
import { extractKeywords } from './score.js';

export { aiEnabled };

// Clamp the requested question count to a sensible interview length.
function clampCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return 6;
  return Math.max(1, Math.min(12, Math.round(n)));
}

// Role-agnostic behavioral competencies. Each renders a STAR-eliciting prompt,
// lightly personalized with the role/company when we have them.
const CORE_COMPETENCIES = [
  {
    competency: 'Impact',
    render: (role, at) =>
      `Tell me about a time you delivered measurable impact${at}. What was the situation, what did you do, and what was the result?`,
  },
  {
    competency: 'Ownership',
    render: (role) =>
      `Walk me through a project you owned end to end as a ${role}. What actions did you personally take, and how did it turn out?`,
  },
  {
    competency: 'Collaboration',
    render: () =>
      'Describe a time you worked with a difficult stakeholder or teammate. How did you handle the situation, and what was the outcome?',
  },
  {
    competency: 'Ambiguity',
    render: () =>
      'Tell me about a decision you had to make with incomplete information. What was your approach, and what happened?',
  },
  {
    competency: 'Failure & learning',
    render: () =>
      'Describe a project that did not go as planned. What was your role, what did you do, and what did you learn?',
  },
  {
    competency: 'Conflict',
    render: () =>
      'Give an example of a technical disagreement with a colleague. What was the situation, and how was it resolved?',
  },
  {
    competency: 'Leadership',
    render: () =>
      'Tell me about a time you drove a decision or influenced a team without formal authority. What actions did you take?',
  },
];

function roleLabel(job) {
  return (job && job.title && job.title.trim()) || 'this role';
}

function companySuffix(job) {
  return job && job.company && job.company.trim() ? ` at ${job.company.trim()}` : '';
}

// Deterministic, no-LLM behavioral questions — all derived from the JOB, so the
// candidate can rehearse what they're likely to be asked. Blends three sources
// for variety: role-fit questions about the job itself, skill questions drawn
// from the description's keywords, and role-agnostic behavioral competencies.
// Round-robins between them so a short interview still samples all three, then
// trims to `count`.
export function generateQuestionsFallback({ job, count = 6 } = {}) {
  const n = clampCount(count);
  const role = roleLabel(job);
  const at = companySuffix(job);

  // Questions about the role itself — the kind almost every interview opens with.
  const roleQs = [
    {
      text: `What draws you to this ${role} role${at}, and why are you a strong fit?`,
      competency: 'Motivation & fit',
      source: 'jd',
    },
    {
      text: `Which responsibilities of this ${role} role are you most confident in, and where would you need to ramp up?`,
      competency: 'Self-awareness',
      source: 'jd',
    },
  ];

  const skills = extractKeywords((job && job.description) || '')
    .filter((k) => k.length > 2)
    .slice(0, n);
  const skillQs = skills.map((skill) => ({
    text:
      `This role calls for ${skill}. Tell me about a time you applied ${skill} to solve a real problem — ` +
      'the situation, your specific actions, and the result.',
    competency: `Skill: ${skill}`,
    source: 'jd',
  }));

  const coreQs = CORE_COMPETENCIES.map((c) => ({
    text: c.render(role, at),
    competency: c.competency,
    source: 'core',
  }));

  // Round-robin across the three pools for variety, then trim to length. Bound
  // the loop by the longest pool so duplicate texts (which dedup drops) can
  // never keep it spinning.
  const pools = [roleQs, skillQs, coreQs];
  const maxLen = Math.max(0, ...pools.map((p) => p.length));
  const ordered = [];
  const seen = new Set();
  for (let i = 0; i < maxLen; i++) {
    for (const pool of pools) {
      if (i < pool.length) {
        const q = pool[i];
        if (!seen.has(q.text)) {
          seen.add(q.text);
          ordered.push(q);
        }
      }
    }
  }
  return ordered.slice(0, n);
}

// Pull the question list out of a model reply, tolerating the shapes weak models
// actually emit: a {"questions":[...]} object, a bare top-level [...] array, and
// either one wrapped in prose or ```json code fences. Tries the object slice
// (first { … last }), then the array slice (first [ … last ]), then the whole
// string, and returns the first parse that yields a usable list. Without this,
// a model that answered with a bare array silently fell back to templates.
function extractQuestionList(raw) {
  const text = String(raw || '');
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const toList = (p) =>
    Array.isArray(p) ? p : Array.isArray(p?.questions) ? p.questions : null;

  const slices = [];
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) slices.push(text.slice(objStart, objEnd + 1));
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) slices.push(text.slice(arrStart, arrEnd + 1));
  slices.push(text.trim());

  for (const slice of slices) {
    const list = toList(tryParse(slice));
    if (list) return list;
  }
  return [];
}

// Normalize a parsed question list into { text, competency, source }. Keeps only
// well-formed questions; normalizes `source` to the literal 'jd' or 'core'.
function parseQuestions(raw) {
  const list = extractQuestionList(raw);
  return list
    .filter((q) => q && typeof q.text === 'string' && q.text.trim())
    .map((q) => {
      const src = q.source != null ? String(q.source) : 'core';
      return {
        text: q.text.trim(),
        competency:
          typeof q.competency === 'string' && q.competency.trim() ? q.competency.trim() : 'Behavioral',
        source: src === 'jd' ? 'jd' : 'core',
      };
    });
}

// LLM path: ask the model for the behavioral questions a candidate is likely to
// be ASKED for this role, derived from the job description alone — this is
// interview prep, so nothing about the candidate's own history is assumed. Falls
// back to the deterministic generator if the model returns nothing usable, so a
// weak local model can never leave the caller empty-handed.
export async function generateQuestionsGrounded({ job, count = 6, complete = defaultComplete } = {}) {
  const n = clampCount(count);
  const system =
    'You are an experienced interviewer helping a candidate PREPARE for an ' +
    'interview. From the job description, write the behavioral interview ' +
    'questions the candidate is most likely to be asked for this role. Derive ' +
    "them from the role's responsibilities and required skills — do NOT assume " +
    'any particular candidate background. Each question must elicit a STAR ' +
    'answer (Situation, Task, Action, Result). Vary the competencies probed. ' +
    'Return ONLY a JSON object of the form {"questions":[{"text":"...",' +
    '"competency":"...","source":"jd|core"}]} with no prose, where "jd" means ' +
    'the question is drawn from this job description and "core" means a general ' +
    'behavioral competency.';

  const prompt = [
    `JOB TITLE: ${(job && job.title) || ''}`,
    `COMPANY: ${(job && job.company) || ''}`,
    'JOB DESCRIPTION:',
    (job && job.description) || '',
    '',
    `Generate ${n} likely interview questions for this role. Return JSON only.`,
  ]
    .filter(Boolean)
    .join('\n');

  let raw;
  try {
    raw = await complete({ task: 'question_gen', system, prompt, maxTokens: 2048 });
  } catch (err) {
    // A provider error — a rate-limited free tier (HTTP 429), a provider outage,
    // a network blip — is the same situation as empty output: never leave the
    // caller empty-handed. Fall back to the deterministic generator so a
    // throttled model degrades to sensible questions instead of a 500.
    console.warn(`question_gen: LLM failed, using deterministic fallback (${err.message}).`);
    return generateQuestionsFallback({ job, count: n });
  }
  const questions = parseQuestions(raw);
  return questions.length ? questions.slice(0, n) : generateQuestionsFallback({ job, count: n });
}
