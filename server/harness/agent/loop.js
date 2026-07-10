// Agent Harness — the reason→act→observe loop (ReAct).
//
// Given a goal and a ToolRegistry, drive an instruction-following model through
// a loop: the model replies with a single JSON object — either a tool call
//   {"thought":"…","tool":"<name>","args":{…}}
// or a final answer
//   {"thought":"…","final":"<answer>"}
// We validate + run the tool, feed the observation back, and repeat until the
// model returns a final answer or the step budget is exhausted.
//
// Provider-agnostic: it speaks plain JSON over the router's `complete()`, so it
// works with OpenRouter / Ollama / Anthropic alike — no native tool-calling API
// required (a deliberate choice so weak local models can still participate).
// It DOES require a model, so the "free/local/mock always works" guarantee lives
// in the caller: when no provider is configured, callers run the deterministic
// orchestrator path (orchestrator.js) instead of this loop.
import { complete as routerComplete, llmEnabled } from '../llm/index.js';

// Render the tool list into the system prompt so the model knows what it can do.
function buildSystem(base, tools) {
  const lines = tools.map((t) => {
    const params = Object.entries(t.params || {})
      .map(([k, s]) => `${k}${s.required ? '' : '?'}: ${s.type || 'any'}`)
      .join(', ');
    return `- ${t.name}(${params}) — ${t.description}`;
  });
  return [
    base || 'You are an agent that accomplishes a goal by calling tools.',
    '',
    'On each turn reply with ONE JSON object and nothing else.',
    'To call a tool:  {"thought":"…","tool":"<name>","args":{…}}',
    'When finished:   {"thought":"…","final":"<answer>"}',
    '',
    'Available tools:',
    ...lines,
  ].join('\n');
}

// Pull the first balanced JSON object out of a model reply, tolerating code
// fences and stray prose around it. Returns the parsed object or null.
export function parseAction(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Run the loop. Options:
//   registry  — ToolRegistry the agent may call (required)
//   goal      — the task, in plain language (required)
//   system    — extra system-prompt framing (optional)
//   ctx       — passed to every tool handler, e.g. { db } (optional)
//   task      — LLM router task name for provider/model routing (default 'draft')
//   maxSteps  — hard cap on iterations (default 6)
//   allow     — optional array of tool names to expose (default: all)
//   complete  — inject a completion fn for testing; defaults to the router's
// Returns { output, trace, steps }. Throws { code: 'agent_max_steps' } if the
// model never returns a final answer within the budget.
export async function runAgentLoop({
  registry,
  goal,
  system,
  ctx = {},
  task = 'draft',
  maxSteps = 6,
  allow = null,
  complete = null,
}) {
  const complete_ = complete || routerComplete;
  // Only enforce the provider guard on the real router — an injected completer
  // (tests, or a caller wiring its own model) is trusted to be callable.
  if (!complete && !llmEnabled()) {
    const err = new Error('runAgentLoop requires a configured LLM provider.');
    err.code = 'llm_not_configured';
    throw err;
  }

  const tools = registry.list().filter((t) => !allow || allow.includes(t.name));
  const sys = buildSystem(system, tools);
  const transcript = [`GOAL: ${goal}`];
  const trace = [];

  for (let step = 0; step < maxSteps; step++) {
    const raw = await complete_({
      task,
      system: sys,
      prompt: transcript.join('\n\n'),
      maxTokens: 1024,
    });
    const action = parseAction(raw);

    if (!action) {
      trace.push({ step, error: 'unparseable', raw: String(raw).slice(0, 200) });
      transcript.push('OBSERVATION: Your reply was not valid JSON. Reply with a single JSON object.');
      continue;
    }

    if ('final' in action) {
      trace.push({ step, thought: action.thought, final: action.final });
      return { output: action.final, trace, steps: step + 1 };
    }

    if (action.tool) {
      let observation;
      try {
        const result = await registry.run(action.tool, action.args, ctx);
        observation = JSON.stringify(result);
      } catch (err) {
        // Tool errors are observations, not crashes — the model can recover.
        observation = `ERROR: ${err.message}`;
      }
      trace.push({ step, thought: action.thought, tool: action.tool, args: action.args, observation });
      transcript.push(
        `ACTION: ${JSON.stringify({ tool: action.tool, args: action.args })}`,
        `OBSERVATION: ${observation}`
      );
      continue;
    }

    // Well-formed JSON but neither a tool call nor a final answer.
    trace.push({ step, error: 'no_action', raw: action });
    transcript.push('OBSERVATION: Reply with either {"tool","args"} or {"final"}.');
  }

  const err = new Error(`Agent did not finish within ${maxSteps} steps.`);
  err.code = 'agent_max_steps';
  err.trace = trace;
  throw err;
}
