/**
 * Improve a skill description based on eval results.
 *
 * Takes eval results (from run_eval.ts) and generates an improved description
 * by calling the AI CLI as a subprocess. Supports both `claude` (Claude Code)
 * and `opencode run` (OpenCode) via --cli flag.
 *
 * Default: uses `claude -p` if available, falls back to `opencode run`.
 *
 * Usage:
 *     bun run improve_description.ts --eval-results <path> --skill-path <path> --model <name> [options]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseSkillMd } from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface EvalResult {
  query: string;
  should_trigger: boolean;
  triggers: number;
  runs: number;
  pass: boolean;
  trigger_rate: number;
}

export interface EvalResults {
  skill_name: string;
  description: string;
  results: EvalResult[];
  summary: { total: number; passed: number; failed: number };
}

export interface HistoryEntry {
  description: string;
  passed?: number;
  total?: number;
  train_passed?: number;
  train_total?: number;
  test_passed?: number | null;
  test_total?: number;
  results?: Array<Record<string, unknown>>;
}

export interface FailedTrigger {
  query: string;
  triggers: number;
  runs: number;
}

export interface ImproveDescriptionOptions {
  skillName: string;
  skillContent: string;
  currentDescription: string;
  evalResults: EvalResults;
  history: Array<Record<string, unknown>>;
  model: string;
  cli: string;
  timeout?: number;
  logDir?: string;
  iteration?: number;
  callCli?: (prompt: string, cli: string, model?: string, timeout?: number) => Promise<string>;
}

// =============================================================================
// Slice 1: parseNewDescription — pure function for tag extraction
// =============================================================================

/**
 * Extract the new description from AI CLI response.
 * Looks for <new_description>...</new_description> tags.
 * Falls back to raw text if no tags found.
 *
 * Matches Python behavior: strip whitespace, then strip surrounding double quotes.
 */
export function parseNewDescription(text: string): string {
  const match = text.match(/<new_description>([\s\S]*?)<\/new_description>/);
  if (!match) {
    return text.trim().replace(/^"+|"+$/g, "");
  }
  let description = match[1].trim();
  // Strip surrounding double quotes (matching Python's .strip('"'))
  description = description.replace(/^"+|"+$/g, "");
  return description;
}

// =============================================================================
// Slice 2: buildPrompt — pure function for prompt construction
// =============================================================================

export interface BuildPromptInput {
  skillName: string;
  skillContent: string;
  currentDescription: string;
  failedTriggers: FailedTrigger[];
  falseTriggers: FailedTrigger[];
  trainScore: string;
  testScore: string | null;
  history: Array<Record<string, unknown>>;
}

/**
 * Build the prompt string that will be sent to the AI CLI.
 * Pure function — takes structured data, returns the prompt text.
 */
export function buildPrompt(input: BuildPromptInput): string {
  const {
    skillName,
    skillContent,
    currentDescription,
    failedTriggers,
    falseTriggers,
    trainScore,
    testScore,
    history,
  } = input;

  const scoresSummary = testScore
    ? `Train: ${trainScore}, Test: ${testScore}`
    : `Train: ${trainScore}`;

  let prompt = `You are optimizing a skill description for a skill called "${skillName}". A "skill" is a prompt with progressive disclosure -- there's a title and description that the agent sees when deciding whether to use the skill, and then if it does use the skill, it reads the .md file which has more details.

The description appears in the agent's "available_skills" list. When a user sends a query, the agent decides whether to invoke the skill based solely on the title and on this description. Your goal is to write a description that triggers for relevant queries, and doesn't trigger for irrelevant ones.

Here's the current description:
<current_description>
"${currentDescription}"
</current_description>

Current scores (${scoresSummary}):
<scores_summary>
`;

  if (failedTriggers.length > 0) {
    prompt += "FAILED TO TRIGGER (should have triggered but didn't):\n";
    for (const r of failedTriggers) {
      prompt += `  - "${r.query}" (triggered ${r.triggers}/${r.runs} times)\n`;
    }
    prompt += "\n";
  }

  if (falseTriggers.length > 0) {
    prompt += "FALSE TRIGGERS (triggered but shouldn't have):\n";
    for (const r of falseTriggers) {
      prompt += `  - "${r.query}" (triggered ${r.triggers}/${r.runs} times)\n`;
    }
    prompt += "\n";
  }

  if (history.length > 0) {
    prompt += "PREVIOUS ATTEMPTS (do NOT repeat these — try something structurally different):\n\n";
    for (const h of history) {
      const trainS = `${h.train_passed ?? h.passed ?? 0}/${h.train_total ?? h.total ?? 0}`;
      const testS = h.test_passed != null
        ? `${h.test_passed}/${h.test_total ?? "?"}`
        : null;
      const scoreStr = `train=${trainS}` + (testS ? `, test=${testS}` : "");
      prompt += `<attempt ${scoreStr}>\n`;
      prompt += `Description: "${h.description}"\n`;
      if (h.results && Array.isArray(h.results)) {
        prompt += "Train results:\n";
        for (const r of h.results) {
          const rObj = r as Record<string, unknown>;
          const status = rObj.pass ? "PASS" : "FAIL";
          const query = String(rObj.query ?? "").slice(0, 80);
          prompt += `  [${status}] "${query}" (triggered ${rObj.triggers ?? 0}/${rObj.runs ?? 0})\n`;
        }
      }
      prompt += "</attempt>\n\n";
    }
  }

  prompt += `</scores_summary>

Skill content (for context on what the skill does):
<skill_content>
${skillContent}
</skill_content>

Based on the failures, write a new and improved description that is more likely to trigger correctly. Generalize from the failures to broader categories of user intent and situations. Do not produce an ever-expanding list of specific queries.

Your description should not be more than about 100-200 words, even if that comes at the cost of accuracy. There is a hard limit of 1024 characters — descriptions over that will be truncated.

Tips:
- Phrase in the imperative: "Use this skill for" rather than "this skill does"
- Focus on the user's intent, not implementation details
- The description competes with other skills for attention — make it distinctive
- If you're getting repeated failures, change things up. Try different sentence structures.

Please respond with only the new description text in <new_description> tags, nothing else.`;

  return prompt;
}

// =============================================================================
// Slice 3: detectCli — boundary function
// =============================================================================

/**
 * Detect which AI CLI is available in PATH.
 * Uses spawnSync("which", ...) matching the sibling pattern in run_eval.ts.
 */
export function detectCli(): string {
  const claudeResult = spawnSync("which", ["claude"], { encoding: "utf-8" });
  if (claudeResult.status === 0 && claudeResult.stdout?.trim()) {
    return "claude";
  }

  const opencodeResult = spawnSync("which", ["opencode"], { encoding: "utf-8" });
  if (opencodeResult.status === 0 && opencodeResult.stdout?.trim()) {
    return "opencode";
  }

  throw new Error("Neither 'claude' nor 'opencode' CLI found. Install one to use description optimization.");
}

// =============================================================================
// Slice 4: _callCli — boundary function (child_process)
// =============================================================================

/**
 * Run AI CLI with the prompt on stdin and return the text response.
 *
 * This is the system boundary — mock this in tests.
 */
function _callCli(prompt: string, cli: string, model?: string, timeout: number = 300): string {
  let cmd: string[];
  let shellCmd: string;

  if (cli === "claude") {
    const modelArg = model ? `--model "${model}"` : "";
    shellCmd = `claude -p --output-format text ${modelArg}`;
  } else if (cli === "opencode") {
    if (model) {
      shellCmd = `opencode run --format default --model "${model}"`;
    } else {
      shellCmd = `opencode run --format default --agent general`;
    }
  } else {
    throw new Error(`Unknown CLI: ${cli}`);
  }

  // Using execSync for synchronous execution with stdin
  // Strip CLAUDECODE env var for claude
  const env = { ...process.env };
  if (cli === "claude") {
    delete env.CLAUDECODE;
  }

  const result = spawnSync(
    cli === "claude" ? "claude" : "opencode",
    cli === "claude"
      ? ["-p", "--output-format", "text", ...(model ? ["--model", model] : [])]
      : ["run", "--format", "default", ...(model ? ["--model", model] : ["--agent", "general"])],
    {
      input: prompt,
      encoding: "utf-8",
      env,
      timeout: timeout * 1000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0 || result.error) {
    const stderr = result.stderr || (result.error ? result.error.message : "");
    throw new Error(`${cli} exited ${result.status ?? "with error"}\nstderr: ${stderr}`);
  }

  return result.stdout;
}

// =============================================================================
// Slice 5: improveDescription — core function
// =============================================================================

/**
 * Call the AI CLI to improve the description based on eval results.
 *
 * @param options - All inputs needed for description improvement
 * @returns The improved description string
 */
export async function improveDescription(options: ImproveDescriptionOptions): Promise<string> {
  const {
    skillName,
    skillContent,
    currentDescription,
    evalResults,
    history,
    model,
    cli,
    timeout = 300,
    logDir,
    iteration,
    callCli: injectedCallCli,
  } = options;

  // Separate failed vs false triggers
  const failedTriggers = evalResults.results
    .filter((r) => r.should_trigger && !r.pass)
    .map((r) => ({ query: r.query, triggers: r.triggers, runs: r.runs }));

  const falseTriggers = evalResults.results
    .filter((r) => !r.should_trigger && !r.pass)
    .map((r) => ({ query: r.query, triggers: r.triggers, runs: r.runs }));

  const trainScore = `${evalResults.summary.passed}/${evalResults.summary.total}`;

  const prompt = buildPrompt({
    skillName,
    skillContent,
    currentDescription,
    failedTriggers,
    falseTriggers,
    trainScore,
    testScore: null,
    history,
  });

  const caller = injectedCallCli || (
    (p: string, c: string, m?: string, t?: number) => Promise.resolve(_callCli(p, c, m, t))
  );
  const text = await caller(prompt, cli, model, timeout);
  let description = parseNewDescription(text);

  const transcript: Record<string, unknown> = {
    iteration: iteration ?? null,
    prompt,
    response: text,
    parsed_description: description,
    char_count: description.length,
    over_limit: description.length > 1024,
  };

  // Safety net: if over 1024 chars, do a one-shot rewrite
  if (description.length > 1024) {
    const shortenPrompt =
      `${prompt}\n\n` +
      `---\n\n` +
      `A previous attempt produced this description, which at ` +
      `${description.length} characters is over the 1024-character hard limit:\n\n` +
      `"${description}"\n\n` +
      `Rewrite it to be under 1024 characters while keeping the most ` +
      `important trigger words and intent coverage. Respond with only ` +
      `the new description in <new_description> tags.`;

    const shortenText = await caller(shortenPrompt, cli, model, timeout);
    const shortened = parseNewDescription(shortenText);

    transcript.rewrite_prompt = shortenPrompt;
    transcript.rewrite_response = shortenText;
    transcript.rewrite_description = shortened;
    transcript.rewrite_char_count = shortened.length;
    description = shortened;
  }

  transcript.final_description = description;

  // Write log if logDir provided
  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    const iter = iteration ?? "unknown";
    const logFile = join(resolve(logDir), `improve_iter_${iter}.json`);
    writeFileSync(logFile, JSON.stringify(transcript, null, 2));
  }

  return description;
}

// =============================================================================
// CLI entry point
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  }

  function hasFlag(flag: string): boolean {
    return args.includes(flag);
  }

  const evalResultsPath = getArg("--eval-results");
  const skillPath = getArg("--skill-path");
  const model = getArg("--model");

  if (!evalResultsPath || !skillPath || !model) {
    console.error("Usage: bun run improve_description.ts --eval-results <path> --skill-path <path> --model <name> [options]");
    console.error("");
    console.error("Options:");
    console.error("  --eval-results <path>    Path to eval results JSON (from run_eval.ts) (required)");
    console.error("  --skill-path <path>      Path to skill directory (required)");
    console.error("  --model <name>           Model for improvement (required)");
    console.error("  --history <path>         Path to history JSON (previous attempts)");
    console.error("  --cli <name>             AI CLI: claude or opencode (auto-detected)");
    console.error("  --verbose                Print progress to stderr");
    process.exit(1);
  }

  // Validate skill path
  if (!existsSync(join(skillPath, "SKILL.md"))) {
    console.error(`Error: No SKILL.md found at ${skillPath}`);
    process.exit(1);
  }

  let cli: string;
  try {
    cli = getArg("--cli") || detectCli();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  const verbose = hasFlag("--verbose");

  if (verbose) {
    console.error(`Using CLI: ${cli}`);
  }

  // Read eval results
  let evalResults: EvalResults;
  try {
    evalResults = JSON.parse(readFileSync(evalResultsPath, "utf-8"));
  } catch (e) {
    console.error(`Error reading eval results: ${e}`);
    process.exit(1);
  }

  // Read history
  let history: Array<Record<string, unknown>> = [];
  const historyPath = getArg("--history");
  if (historyPath) {
    try {
      history = JSON.parse(readFileSync(historyPath, "utf-8"));
    } catch (e) {
      console.error(`Error reading history: ${e}`);
      process.exit(1);
    }
  }

  // Parse skill
  const { name, fullContent } = parseSkillMd(skillPath);
  const currentDescription = evalResults.description;

  if (verbose) {
    console.error(`Current: ${currentDescription}`);
    console.error(`Score: ${evalResults.summary.passed}/${evalResults.summary.total}`);
  }

  improveDescription({
    skillName: name,
    skillContent: fullContent,
    currentDescription,
    evalResults,
    history,
    model,
    cli,
  }).then((newDescription) => {
    if (verbose) {
      console.error(`Improved: ${newDescription}`);
    }

    const output = {
      description: newDescription,
      history: [
        ...history,
        {
          description: currentDescription,
          passed: evalResults.summary.passed,
          failed: evalResults.summary.failed,
          total: evalResults.summary.total,
          results: evalResults.results,
        },
      ],
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }).catch((e) => {
    console.error(`Error: ${e}`);
    process.exit(1);
  });
}
