// Behavioral interview-question generation.
//
// Turns a job description (and, when available, the candidate's Career Vault
// items) into STAR-eliciting behavioral interview questions. Mirrors lib/ai.js:
//   - an LLM path (generateQuestionsGrounded) when a provider is configured,
//   - a deterministic fallback (generateQuestionsFallback) that always works
//     with no model at all, so the demo runs free.
//
// Every question is a plain object { text, competency, source }, which maps
// one-to-one onto the `questions` table columns. `source` is either a Career
// Vault item id (a question grounded in the candidate's real experience), the
// string 'jd' (drawn from a job-description skill), or 'core' (a role-agnostic
// behavioral competency).
import { complete } from '../harness/llm/index.js';
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

// A short, human label for a career item (title, else a trimmed snippet).
function itemLabel(item) {
  const title = item && typeof item.title === 'string' ? item.title.trim() : '';
  if (title) return title;
  const content = item && typeof item.content === 'string' ? item.content.trim() : '';
  return content.length > 60 ? `${content.slice(0, 57)}…` : content || 'that experience';
}

// Deterministic, no-LLM behavioral questions. Blends three sources so the set is
// varied: the candidate's real Career Vault items (grounded), the job's skills,
// and role-agnostic behavioral competencies. Round-robins between them so a
// short interview still samples all three, then trims to `count`.
export function generateQuestionsFallback({ job, items = [], count = 6 } = {}) {
  const n = clampCount(count);
  const role = roleLabel(job);
  const at = companySuffix(job);

  const vaultQs = (Array.isArray(items) ? items : []).map((item) => ({
    text:
      `You recorded "${itemLabel(item)}". Walk me through it using STAR — ` +
      'the situation, your task, the actions you took, and the result.',
    competency: 'Experience deep-dive',
    source: item.id != null ? String(item.id) : 'vault',
  }));

  const skills = extractKeywords((job && job.description) || '')
    .filter((k) => k.length > 2)
    .slice(0, n);
  const skillQs = skills.map((skill) => ({
    text:
      `Tell me about a time you applied ${skill} to solve a real problem. ` +
      'Describe the situation, your specific actions, and the result.',
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
  const pools = [vaultQs, skillQs, coreQs];
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

// Parse the {"questions":[...]} array from a model reply, tolerating code fences
// / stray prose. Keeps only well-formed questions; normalizes `source` so it
// either names a real provided item id or is the literal 'jd' / 'core'.
function parseQuestions(raw, items) {
  const ids = new Set((items || []).map((i) => String(i.id)));
  let parsed;
  try {
    const match = String(raw).match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    parsed = null;
  }
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return list
    .filter((q) => q && typeof q.text === 'string' && q.text.trim())
    .map((q) => {
      const src = q.source != null ? String(q.source) : 'core';
      return {
        text: q.text.trim(),
        competency:
          typeof q.competency === 'string' && q.competency.trim() ? q.competency.trim() : 'Behavioral',
        source: ids.has(src) ? src : src === 'jd' ? 'jd' : 'core',
      };
    });
}

// LLM path: ask the model for behavioral questions grounded in the JD and, when
// provided, the candidate's real career items. Falls back to the deterministic
// generator if the model returns nothing usable, so a weak local model can
// never leave the caller empty-handed.
export async function generateQuestionsGrounded({ job, items = [], count = 6 } = {}) {
  const n = clampCount(count);
  const system =
    'You are an experienced behavioral interviewer. Write behavioral interview ' +
    'questions for the target role that each elicit a STAR answer (Situation, ' +
    'Task, Action, Result). Ground questions in the job description and, where ' +
    "given, the candidate's real career items — reference them so the candidate " +
    'can answer from genuine experience. Vary the competencies probed. Return ' +
    'ONLY a JSON object of the form {"questions":[{"text":"...","competency":' +
    '"...","source":"<career item id | jd | core>"}]} with no prose.';

  const itemList = (Array.isArray(items) ? items : [])
    .map((it) => `- id: ${it.id}\n  (${it.kind}) ${it.title}: ${it.content}`)
    .join('\n');

  const prompt = [
    `JOB TITLE: ${(job && job.title) || ''}`,
    `COMPANY: ${(job && job.company) || ''}`,
    'JOB DESCRIPTION:',
    (job && job.description) || '',
    '',
    itemList ? 'CANDIDATE CAREER ITEMS (cite these ids when relevant):' : '',
    itemList,
    '',
    `Generate ${n} behavioral questions. Return JSON only.`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await complete({ task: 'question_gen', system, prompt, maxTokens: 2048 });
  const questions = parseQuestions(raw, items);
  return questions.length ? questions.slice(0, n) : generateQuestionsFallback({ job, items, count: n });
}
