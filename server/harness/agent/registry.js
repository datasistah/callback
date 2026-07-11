// Agent Harness — tool registry.
//
// A *tool* is a named, typed, side-effect-scoped capability that either the
// reason→act→observe loop (loop.js) or a deterministic orchestrator
// (orchestrator.js) can call:
//   { name, description, params, handler }
// Handlers receive (args, ctx). `ctx` carries request-scoped state — most
// importantly `ctx.db`, the caller's RLS-scoped Supabase client — so a tool
// never reaches beyond the current user. `args` are validated against `params`
// before the handler runs, so a weak or hallucinating model cannot invoke a
// tool with garbage input.
//
// This registry is the seam the whole agentic layer builds on: features name a
// tool, the registry validates and runs it, and (Phase 2b) an MCP server can
// expose this same registry to external agents unchanged. Every tool here is
// free/local-safe — the only tool that ever touches an LLM is `tailor_bullets`,
// and it falls back to a deterministic path when no model is configured.
import { retrieveCareerItems, verifyGrounding } from '../../lib/vault.js';
import { computeScore } from '../../lib/score.js';
import {
  aiEnabled,
  tailorResumeGrounded,
  tailorResumeGroundedFallback,
} from '../../lib/ai.js';
import { generateQuestionsGrounded, generateQuestionsFallback } from '../../lib/questions.js';
import { gradeAnswerGrounded, gradeAnswerFallback } from '../../lib/grade.js';

// ── Minimal schema validation (zero dependencies) ──────────────────────────
// params shape: { <name>: { type, required?, description? } }
//   type ∈ 'string' | 'number' | 'boolean' | 'array' | 'object'
// Returns an array of human-readable error strings ([] when valid).
export function validateArgs(params, args) {
  const errors = [];
  const a = args && typeof args === 'object' ? args : {};
  for (const [key, spec] of Object.entries(params || {})) {
    const val = a[key];
    if (val === undefined || val === null) {
      if (spec.required) errors.push(`missing required "${key}"`);
      continue;
    }
    const actual = Array.isArray(val) ? 'array' : typeof val;
    if (spec.type && actual !== spec.type) {
      errors.push(`"${key}" must be ${spec.type}, got ${actual}`);
    }
  }
  return errors;
}

// A registry of tools, keyed by name. Small on purpose — the value is the
// uniform validate-then-run contract, not the container.
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool || !tool.name || typeof tool.handler !== 'function') {
      throw new Error('ToolRegistry.register: a tool needs a name and a handler.');
    }
    this.tools.set(tool.name, { description: '', params: {}, ...tool });
    return this;
  }

  has(name) {
    return this.tools.has(name);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  // Model/MCP-facing description of every tool (no handlers).
  list() {
    return [...this.tools.values()].map(({ name, description, params }) => ({
      name,
      description,
      params,
    }));
  }

  // Validate args against the tool's schema, then run it. Throws tagged errors
  // so callers (and the agent loop) can react:
  //   { code: 'unknown_tool' } → no such tool
  //   { code: 'invalid_args' } → args failed schema validation
  async run(name, args, ctx = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      const err = new Error(`Unknown tool "${name}".`);
      err.code = 'unknown_tool';
      throw err;
    }
    const errors = validateArgs(tool.params, args);
    if (errors.length) {
      const err = new Error(`Invalid args for "${name}": ${errors.join('; ')}.`);
      err.code = 'invalid_args';
      throw err;
    }
    return tool.handler(args || {}, ctx);
  }
}

// Build the default registry with Callback's core tools. Cheap to construct, so
// callers make one per request (it holds no request state — that lives in ctx).
export function createDefaultRegistry() {
  const registry = new ToolRegistry();

  registry.register({
    name: 'vault_search',
    description:
      "Retrieve the user's most relevant Career Vault items for a job, via " +
      'pgvector semantic search. Returns { items }. Requires ctx.db.',
    params: {
      job: {
        type: 'object',
        required: true,
        description: 'The target job: { title, company, description }.',
      },
      matchCount: { type: 'number', description: 'How many items to retrieve (default 6).' },
    },
    handler: async ({ job, matchCount }, ctx) => {
      if (!ctx.db) {
        throw new Error('vault_search requires ctx.db (a user-scoped Supabase client).');
      }
      const items = await retrieveCareerItems(ctx.db, { job, matchCount: matchCount || 6 });
      return { items };
    },
  });

  registry.register({
    name: 'tailor_bullets',
    description:
      'Write tailored resume bullets that each CITE the Career Vault item they ' +
      'draw from. Uses the LLM when a provider is configured, otherwise a ' +
      'deterministic one-bullet-per-item fallback. Returns { bullets }.',
    params: {
      job: { type: 'object', required: true, description: 'The target job.' },
      items: { type: 'array', required: true, description: 'Retrieved career items to draw from.' },
    },
    handler: async ({ job, items }) => {
      const bullets = aiEnabled()
        ? await tailorResumeGrounded({ job, items })
        : tailorResumeGroundedFallback({ items });
      return { bullets };
    },
  });

  registry.register({
    name: 'check_grounding',
    description:
      'Verify each bullet against the Career Vault item it cites and flag any ' +
      'bullet not actually supported by its source. Deterministic (no LLM). ' +
      'Returns { provenance: [{ text, source_id, source_title, grounded, similarity }] }.',
    params: {
      bullets: { type: 'array', required: true, description: 'Bullets of { text, source_id }.' },
      items: { type: 'array', required: true, description: 'The cited career items.' },
    },
    handler: async ({ bullets, items }) => {
      const provenance = await verifyGrounding(bullets, items);
      return { provenance };
    },
  });

  registry.register({
    name: 'question_gen',
    description:
      'Generate the behavioral interview questions (STAR-eliciting) a candidate ' +
      'is likely to be ASKED for a job, derived from its description — this is ' +
      'interview prep, so questions come from the role, not the candidate\'s ' +
      'history. Uses the LLM when a provider is configured, otherwise a ' +
      'deterministic fallback. Returns { questions: [{ text, competency, source }] } ' +
      'where source is "jd" (from the job description) or "core" (a general competency).',
    params: {
      job: {
        type: 'object',
        required: true,
        description: 'The target job: { title, company, description }.',
      },
      count: { type: 'number', description: 'How many questions to generate (default 6, max 12).' },
    },
    handler: async ({ job, count }) => {
      const questions = aiEnabled()
        ? await generateQuestionsGrounded({ job, count })
        : generateQuestionsFallback({ job, count });
      return { questions };
    },
  });

  registry.register({
    name: 'score_resume',
    description:
      'Deterministic keyword-match score (0–100) of a resume against a job ' +
      'description, with matched/missing keywords. No LLM. Returns the breakdown.',
    params: {
      jobDescription: { type: 'string', required: true },
      resumeContent: { type: 'string', required: true },
    },
    handler: async ({ jobDescription, resumeContent }) => computeScore(jobDescription, resumeContent),
  });

  registry.register({
    name: 'grade_answer',
    description:
      "Grade a candidate's transcribed answer to a behavioral interview question " +
      'on STAR structure (Situation/Task/Action/Result, each 0–25) and relevance ' +
      '(0–100), with an overall 0–100 score and coaching feedback. Uses the LLM ' +
      'when a provider is configured, otherwise a deterministic rubric. Returns ' +
      '{ overall, star, relevance, feedback, mode }.',
    params: {
      question: { type: 'string', required: true, description: 'The interview question asked.' },
      transcript: { type: 'string', required: true, description: "The candidate's transcribed answer." },
    },
    handler: async ({ question, transcript }) =>
      aiEnabled()
        ? gradeAnswerGrounded({ question, transcript })
        : gradeAnswerFallback({ question, transcript }),
  });

  return registry;
}
