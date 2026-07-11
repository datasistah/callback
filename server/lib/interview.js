// Interview question-generation agent — the first flow to actually drive the
// reason→act→observe loop (harness/agent/loop.js), not just the deterministic
// orchestrator. This is where Callback proves the model-driven path.
//
// When a model is configured, we run the ReAct loop over a registry holding
// `vault_search` + `question_gen`: the model decides to retrieve the
// candidate's Career Vault first and then generate questions grounded in it.
// The authoritative, structured questions come from the recorded `question_gen`
// tool observation in the trace — the loop drives *tool selection*, while the
// tool (validated, deterministic-capable) owns the output shape. This keeps a
// weak local model from having to emit clean JSON as its final answer.
//
// When no model is configured (the free/local/mock guarantee), we skip the loop
// and call the tools directly: best-effort vault retrieval, then the
// deterministic question_gen fallback — sensible questions with no LLM at all.
import { createDefaultRegistry, runAgentLoop } from '../harness/agent/index.js';
import { llmEnabled } from '../harness/llm/index.js';

// Pull the structured questions out of the loop trace: the most recent
// successful `question_gen` observation (JSON we stringified when running the
// tool). Returns an array, or null if the model never produced one.
function questionsFromTrace(trace) {
  for (let i = trace.length - 1; i >= 0; i--) {
    const entry = trace[i];
    if (entry && entry.tool === 'question_gen' && typeof entry.observation === 'string') {
      try {
        const parsed = JSON.parse(entry.observation);
        if (Array.isArray(parsed.questions)) return parsed.questions;
      } catch {
        // Not the JSON we want (e.g. an ERROR observation) — keep scanning.
      }
    }
  }
  return null;
}

// Best-effort vault retrieval used by the deterministic path. Never throws:
// no db (hermetic tests) or an empty/failing vault just yields [], and the
// question generator still produces JD- and competency-based questions.
async function safeVaultSearch(registry, job, ctx) {
  if (!ctx.db) return [];
  try {
    const { items } = await registry.run('vault_search', { job }, ctx);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

// Generate behavioral interview questions for a job.
//   db       — user-scoped Supabase client (or null; vault grounding is then skipped)
//   job      — { title, company, description }
//   count    — how many questions (default 6, clamped by the tool)
//   complete — inject a completion fn for tests; forces the model-driven path
// Returns { questions, mode } where mode is 'agentic' (loop-driven),
// 'agentic-fallback' (loop attempted but did not yield questions), or
// 'deterministic' (no model — direct tool call).
export async function generateInterviewQuestions(db, { job, count = 6, complete = null } = {}) {
  const registry = createDefaultRegistry();
  const ctx = { db };
  const useModel = Boolean(complete) || llmEnabled();

  if (useModel) {
    let trace = null;
    try {
      ({ trace } = await runAgentLoop({
        registry,
        goal:
          `Generate ${count} behavioral interview questions for a ` +
          `"${job.title || 'candidate'}" role${job.company ? ` at ${job.company}` : ''}. ` +
          'First retrieve the candidate\'s Career Vault items with vault_search, then ' +
          'call question_gen with the job and those items so the questions are grounded ' +
          'in real experience. Finish once question_gen has returned.',
        system:
          'You prepare candidates for interviews. Use vault_search to fetch relevant ' +
          'experience, then question_gen to produce STAR-eliciting behavioral questions.',
        ctx,
        task: 'question_gen',
        allow: ['vault_search', 'question_gen'],
        maxSteps: 6,
        complete,
      }));
    } catch (err) {
      // The loop can throw agent_max_steps even AFTER the model called
      // question_gen — a weak model that produced questions but never emitted a
      // clean {"final"} within the step budget. It attaches the trace to the
      // error; recover it so we credit and use the questions already generated
      // rather than discarding them and paying for a redundant backstop call.
      // Any other failure (unconfigured provider, provider error) leaves trace
      // null and falls through to the deterministic backstop below.
      trace = err.trace || null;
    }
    const questions = trace ? questionsFromTrace(trace) : null;
    if (questions && questions.length) return { questions, mode: 'agentic' };
    // Model path attempted but yielded nothing usable: deterministic backstop.
    const items = await safeVaultSearch(registry, job, ctx);
    const { questions: fallbackQuestions } = await registry.run('question_gen', { job, items, count }, ctx);
    return { questions: fallbackQuestions, mode: 'agentic-fallback' };
  }

  // No model configured: direct, deterministic tool calls. Best-effort vault
  // grounding, then the no-LLM question_gen fallback.
  const items = await safeVaultSearch(registry, job, ctx);
  const { questions } = await registry.run('question_gen', { job, items, count }, ctx);
  return { questions, mode: 'deterministic' };
}
