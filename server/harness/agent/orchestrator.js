// Agent Harness — orchestrator.
//
// Sequences specialized steps as *deterministic control flow* — Module 2's
// orchestrator pattern: "coordination, not execution." Each step reads the
// shared ctx plus prior results and returns its output; the next step consumes
// it. This is the always-on backbone of the agentic layer: it runs identically
// with a premium model, a weak local model, or no model at all, because the
// control flow is plain code — only the individual tools a step calls decide
// whether to touch an LLM. That is what keeps the "free/local/mock always
// works" guarantee true no matter how the harness grows.
//
// Failure isolation (Module 2's failure modes): a step's error is recorded in
// the trace instead of throwing an unhandled crash. A `required` step (the
// default) stops the pipeline but returns partial results + trace on the error
// object, so the caller can report a clean failure. An optional step
// (`required: false`) is recorded and skipped, and the pipeline continues.

// steps: [{ name, run: async (ctx, { prior, results }) => output, required? }]
// Returns { results, trace }. `results` is keyed by step name; `trace` records
// each step's ok/error for observability (a product requirement, not just debug).
export async function runPipeline(steps, ctx = {}) {
  const results = {};
  const trace = [];
  let prior = null;

  for (const step of steps) {
    if (!step || !step.name || typeof step.run !== 'function') {
      throw new Error('runPipeline: each step needs a name and a run(ctx, state) function.');
    }
    try {
      const output = await step.run(ctx, { prior, results });
      results[step.name] = output;
      prior = output;
      trace.push({ step: step.name, ok: true });
    } catch (err) {
      trace.push({ step: step.name, ok: false, error: err.message });
      if (step.required === false) {
        // Optional step: isolate the failure and keep going.
        results[step.name] = null;
        prior = null;
        continue;
      }
      // Required step: stop, but hand back what we have rather than crashing.
      err.trace = trace;
      err.partial = results;
      throw err;
    }
  }

  return { results, trace };
}
