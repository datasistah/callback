// Tailoring orchestration — turns a job + profile into a tailored resume with
// per-bullet provenance. Keeps routes/jobs.js thin.
//
// This is the first flow wired through the Agent Harness agentic layer: the
// grounded path runs as an orchestrated pipeline of registry tools
//   vault_search → tailor_bullets → check_grounding
// so the same capabilities are reusable by other agents (question-gen, STAR
// critique) and, later, exposed over MCP — without changing behaviour here.
//
// Flow:
//   1. Retrieve the candidate's most relevant Career Vault items (vault_search).
//   2a. Vault empty        → legacy freehand tailoring (LLM or mock), no provenance.
//   2b. Vault has items    → grounded pipeline: bullets that cite their source
//                            item (tailor_bullets), then a groundedness check
//                            (check_grounding) flags any unsupported bullet.
//   3. Render bullets into resume text (for storage + scoring) and return the
//      structured provenance alongside it.
import { aiEnabled, tailorResume, tailorResumeFallback } from './ai.js';
import { createDefaultRegistry, runPipeline } from '../harness/agent/index.js';

function firstLine(profile) {
  const line = (profile || '').split('\n').map((s) => s.trim()).find(Boolean);
  return line || 'Candidate';
}

// Assemble readable resume text from graded bullets. Grounded bullets are
// listed as experience; unsupported ones are kept but clearly marked so they
// are never passed off as verified.
function renderResume({ profile, job, provenance }) {
  const grounded = provenance.filter((p) => p.grounded);
  const flagged = provenance.filter((p) => !p.grounded);

  const out = [
    firstLine(profile),
    `Tailored for ${job.title} at ${job.company}`,
    '',
    'EXPERIENCE (grounded in your Career Vault)',
    ...(grounded.length
      ? grounded.map((p) => `- ${p.text}`)
      : ['(no vault-grounded bullets matched this role)']),
  ];

  if (flagged.length) {
    out.push(
      '',
      'UNVERIFIED — not supported by a Career Vault item, review before using:',
      ...flagged.map((p) => `- [unverified] ${p.text}`)
    );
  }

  return out.join('\n');
}

// Build the tailored resume. Returns { content, provenance, grounded }.
//   grounded: true when the Career Vault drove the tailoring (provenance is
//   meaningful); false when we fell back to legacy whole-resume tailoring.
export async function buildTailoredResume(db, { profile, job }) {
  const registry = createDefaultRegistry();
  const ctx = { db };

  const { items } = await registry.run('vault_search', { job }, ctx);

  // No vault yet → legacy freehand path, unchanged behaviour, empty provenance.
  if (items.length === 0) {
    const content = aiEnabled()
      ? await tailorResume({ profile, job })
      : tailorResumeFallback({ profile, job });
    return { content, provenance: [], grounded: false };
  }

  // Grounded path: orchestrate the two dependent tool steps. Deterministic
  // control flow → runs identically with an LLM, a local model, or the mock.
  const { results } = await runPipeline(
    [
      { name: 'tailor_bullets', run: () => registry.run('tailor_bullets', { job, items }, ctx) },
      {
        name: 'check_grounding',
        run: (_ctx, { results }) =>
          registry.run('check_grounding', { bullets: results.tailor_bullets.bullets, items }, ctx),
      },
    ],
    ctx
  );

  const provenance = results.check_grounding.provenance;
  const content = renderResume({ profile, job, provenance });
  return { content, provenance, grounded: true };
}
