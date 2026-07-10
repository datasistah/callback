// Tailoring orchestration — turns a job + profile into a tailored resume with
// per-bullet provenance. Keeps routes/jobs.js thin.
//
// Flow:
//   1. Retrieve the candidate's most relevant Career Vault items (pgvector).
//   2a. Vault empty        → legacy freehand tailoring (LLM or mock), no provenance.
//   2b. Vault has items    → grounded tailoring: bullets that cite their source
//                            item, then a groundedness check flags any bullet
//                            not actually supported by its cited item.
//   3. Render bullets into resume text (for storage + scoring) and return the
//      structured provenance alongside it.
import {
  aiEnabled,
  tailorResume,
  tailorResumeFallback,
  tailorResumeGrounded,
  tailorResumeGroundedFallback,
} from './ai.js';
import { retrieveCareerItems, verifyGrounding } from './vault.js';

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
  const items = await retrieveCareerItems(db, { job });

  // No vault yet → legacy path, unchanged behaviour, empty provenance.
  if (items.length === 0) {
    const content = aiEnabled()
      ? await tailorResume({ profile, job })
      : tailorResumeFallback({ profile, job });
    return { content, provenance: [], grounded: false };
  }

  const bullets = aiEnabled()
    ? await tailorResumeGrounded({ job, items })
    : tailorResumeGroundedFallback({ items });

  const provenance = await verifyGrounding(bullets, items);
  const content = renderResume({ profile, job, provenance });
  return { content, provenance, grounded: true };
}
