/**
 * Run trigger evaluation for a skill description.
 *
 * Tests whether a skill's description causes the agent to trigger (load the skill)
 * for a set of queries. Supports both `claude` (Claude Code) and `opencode run`
 * (OpenCode) via --cli flag.
 *
 * Usage:
 *     bun run run_eval.ts --eval-set <path> --skill-path <path> [options]
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseSkillMd } from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface EvalItem {
  query: string;
  should_trigger: boolean;
}

export interface EvalResult {
  query: string;
  should_trigger: boolean;
  trigger_rate: number;
  triggers: number;
  runs: number;
  pass: boolean;
}

export interface EvalOutput {
  skill_name: string;
  description: string;
  results: EvalResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface RunEvalOptions {
  evalSet: EvalItem[];
  skillName: string;
  description: string;
  numWorkers: number;
  timeout: number;
  projectRoot: string;
  runsPerQuery: number;
  triggerThreshold: number;
  cli: string;
  model?: string;
  runQuery?: (query: string) => Promise<boolean>;
}

// =============================================================================
// Pure functions
// =============================================================================

/**
 * Find the project root by walking up from a start directory.
 * Looks for .claude or .opencode directory.
 */
export function findProjectRoot(startDir?: string): string {
  const current = startDir ? resolve(startDir) : process.cwd();
  const parts = current.split("/").filter(Boolean);

  // Walk up from current directory
  for (let i = parts.length; i >= 0; i--) {
    const dir = "/" + parts.slice(0, i).join("/");
    if (existsSync(join(dir, ".claude")) || existsSync(join(dir, ".opencode"))) {
      return dir;
    }
  }

  // Also check root
  if (existsSync("/.claude") || existsSync("/.opencode")) {
    return "/";
  }

  return current;
}

/**
 * Detect which AI CLI is available in PATH.
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

  throw new Error("Neither 'claude' nor 'opencode' CLI found.");
}

// =============================================================================
// Stream-json parsing (pure function)
// =============================================================================

/**
 * Parse Claude's stream-json output and determine if the skill was triggered.
 *
 * Pure function: takes an array of JSON lines and a clean name,
 * returns whether the skill was triggered.
 * Implements the same state machine as the Python version.
 */
export function parseClaudeStreamResponse(
  lines: string[],
  cleanName: string,
): boolean {
  let triggered = false;
  let pendingToolName: string | null = null;
  let accumulatedJson = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      // Skip invalid JSON lines (Python also ignores JSONDecodeError)
      continue;
    }

    if (event.type === "stream_event") {
      const se = (event.event || {}) as Record<string, unknown>;
      const seType = se.type as string;

      if (seType === "content_block_start") {
        const cb = (se.content_block || {}) as Record<string, unknown>;
        if (cb.type === "tool_use") {
          const toolName = (cb.name || "") as string;
          if (toolName === "Skill" || toolName === "Read") {
            pendingToolName = toolName;
            accumulatedJson = "";
          } else {
            return false;
          }
        }
      } else if (seType === "content_block_delta" && pendingToolName) {
        const delta = (se.delta || {}) as Record<string, unknown>;
        if (delta.type === "input_json_delta") {
          accumulatedJson += (delta.partial_json || "") as string;
          if (accumulatedJson.includes(cleanName)) {
            return true;
          }
        }
      } else if (seType === "content_block_stop" || seType === "message_stop") {
        if (pendingToolName) {
          return accumulatedJson.includes(cleanName);
        }
        if (seType === "message_stop") {
          return false;
        }
      }
    } else if (event.type === "assistant") {
      const message = (event.message || {}) as Record<string, unknown>;
      const content = (message.content || []) as Record<string, unknown>[];
      for (const contentItem of content) {
        if (contentItem.type !== "tool_use") continue;
        const toolName = (contentItem.name || "") as string;
        const toolInput = (contentItem.input || {}) as Record<string, unknown>;

        if (toolName === "Skill" && String(toolInput.skill || "").includes(cleanName)) {
          triggered = true;
        } else if (toolName === "Read" && String(toolInput.file_path || "").includes(cleanName)) {
          triggered = true;
        }
        return triggered;
      }
    } else if (event.type === "result") {
      return triggered;
    }
  }

  return triggered;
}

/**
 * Parse OpenCode CLI output to detect if the skill was referenced.
 *
 * Pure function: takes stdout, stderr, clean name, and skill name,
 * returns whether the skill was triggered (referenced in output).
 */
export function parseOpencodeResponse(
  stdout: string,
  stderr: string,
  cleanName: string,
  skillName: string,
): boolean {
  const output = stdout + stderr;
  return output.includes(cleanName) || output.includes(skillName);
}

// =============================================================================
// CLI-spawning functions (boundary: child_process)
// =============================================================================

/**
 * Run a single query against Claude Code CLI and detect triggering.
 */
function runClaude(
  query: string,
  cleanName: string,
  skillName: string,
  skillDescription: string,
  timeout: number,
  projectRoot: string,
  model?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const projectCommandsDir = join(projectRoot, ".claude", "commands");
    const commandFile = join(projectCommandsDir, `${cleanName}.md`);

    // Create command file for Claude to discover
    mkdirSync(projectCommandsDir, { recursive: true });
    const indentedDesc = skillDescription.split("\n").join("\n  ");
    const commandContent =
      `---\n` +
      `description: |\n` +
      `  ${indentedDesc}\n` +
      `---\n\n` +
      `# ${skillName}\n\n` +
      `This skill handles: ${skillDescription}\n`;
    writeFileSync(commandFile, commandContent);

    const args = [
      "-p", query,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
    ];
    if (model) {
      args.push("--model", model);
    }

    // Strip CLAUDECODE env var
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn("claude", args, {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const lines: string[] = [];
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        cleanup();
        resolve(false);
      }
    }, timeout * 1000);

    function cleanup() {
      clearTimeout(timer);
      try {
        if (existsSync(commandFile)) {
          unlinkSync(commandFile);
        }
      } catch {
        // best-effort cleanup
      }
    }

    function finalize(triggered: boolean) {
      if (!resolved) {
        resolved = true;
        proc.kill();
        cleanup();
        resolve(triggered);
      }
    }

    let buffer = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      // Split on newlines, keeping any partial last line in buffer
      const parts = buffer.split("\n");
      buffer = parts.pop() || ""; // last incomplete line stays in buffer
      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line) continue;
        lines.push(line);
      }
      // Check inline for early detection
      const result = parseClaudeStreamResponse(lines, cleanName);
      if (result) {
        finalize(true);
      }
    });

    proc.on("close", () => {
      if (!resolved) {
        const result = parseClaudeStreamResponse(lines, cleanName);
        finalize(result);
      }
    });

    proc.on("error", () => {
      finalize(false);
    });
  });
}

/**
 * Run a single query against OpenCode CLI and detect triggering.
 */
function runOpencode(
  query: string,
  cleanName: string,
  skillName: string,
  _skillDescription: string,
  timeout: number,
  projectRoot: string,
  model?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ["run", query, "--format", "json"];
    if (model) {
      args.push("--model", model);
    } else {
      args.push("--agent", "general");
    }

    const env = { ...process.env };

    const proc = spawn("opencode", args, {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        resolve(false);
      }
    }, timeout * 1000);

    function finalize(triggered: boolean) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(triggered);
      }
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("close", () => {
      if (!resolved) {
        const triggered = parseOpencodeResponse(
          stdout,
          stderr,
          cleanName,
          skillName,
        );
        finalize(triggered);
      }
    });

    proc.on("error", () => {
      finalize(false);
    });
  });
}

/**
 * Run a single query and return whether the skill was triggered.
 */
function runSingleQuery(
  query: string,
  skillName: string,
  skillDescription: string,
  timeout: number,
  projectRoot: string,
  cli: string,
  model?: string,
): Promise<boolean> {
  const uniqueId = Math.random().toString(36).slice(2, 10);
  const cleanName = `${skillName}-skill-${uniqueId}`;

  if (cli === "claude") {
    return runClaude(query, cleanName, skillName, skillDescription, timeout, projectRoot, model);
  } else if (cli === "opencode") {
    return runOpencode(query, cleanName, skillName, skillDescription, timeout, projectRoot, model);
  } else {
    throw new Error(`Unknown CLI: ${cli}`);
  }
}

// =============================================================================
// Orchestration
// =============================================================================

/**
 * Run the full eval set and return results.
 *
 * Uses a concurrency pool to run queries in parallel, matching Python's
 * ProcessPoolExecutor behavior.
 */
export async function runEval(options: RunEvalOptions): Promise<EvalOutput> {
  const {
    evalSet,
    skillName,
    description,
    numWorkers,
    timeout,
    projectRoot,
    runsPerQuery,
    triggerThreshold,
    cli,
    model,
    runQuery: injectedRunQuery,
  } = options;

  // Allow dependency-injected runQuery for testing
  const queryRunner =
    injectedRunQuery ||
    ((query: string) =>
      runSingleQuery(query, skillName, description, timeout, projectRoot, cli, model));

  // Build all tasks
  interface Task {
    item: EvalItem;
    runIdx: number;
    query: string;
  }
  const allTasks: Task[] = [];
  for (const item of evalSet) {
    for (let runIdx = 0; runIdx < runsPerQuery; runIdx++) {
      allTasks.push({ item, runIdx, query: item.query });
    }
  }

  // Run with concurrency pool (matching Python's ProcessPoolExecutor behavior)
  const taskResults: { query: string; triggered: boolean }[] = new Array(allTasks.length);
  let taskIdx = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const i = taskIdx++;
      if (i >= allTasks.length) break;
      try {
        const triggered = await queryRunner(allTasks[i].query);
        taskResults[i] = { query: allTasks[i].query, triggered };
      } catch {
        taskResults[i] = { query: allTasks[i].query, triggered: false };
      }
    }
  }

  const poolSize = Math.min(numWorkers, allTasks.length);
  const workers = Array.from({ length: poolSize }, () => runWorker());
  await Promise.all(workers);

  // Group results by query
  const triggersByQuery: Map<string, boolean[]> = new Map();
  const itemsByQuery: Map<string, EvalItem> = new Map();

  for (const item of evalSet) {
    itemsByQuery.set(item.query, item);
  }

  for (const result of taskResults) {
    if (!result) continue; // skip gaps (shouldn't happen with atomic taskIdx)
    if (!triggersByQuery.has(result.query)) {
      triggersByQuery.set(result.query, []);
    }
    triggersByQuery.get(result.query)!.push(result.triggered);
  }

  // Compute results
  const evalResults: EvalResult[] = [];
  for (const [query, triggers] of triggersByQuery) {
    const item = itemsByQuery.get(query)!;
    const triggerRate = triggers.filter(Boolean).length / triggers.length;
    const shouldTrigger = item.should_trigger;
    const didPass = shouldTrigger
      ? triggerRate >= triggerThreshold
      : triggerRate < triggerThreshold;

    evalResults.push({
      query,
      should_trigger: shouldTrigger,
      trigger_rate: triggerRate,
      triggers: triggers.filter(Boolean).length,
      runs: triggers.length,
      pass: didPass,
    });
  }

  const passed = evalResults.filter((r) => r.pass).length;
  const total = evalResults.length;

  return {
    skill_name: skillName,
    description,
    results: evalResults,
    summary: {
      total,
      passed,
      failed: total - passed,
    },
  };
}

// =============================================================================
// CLI entry point
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);

  function getArg(
    flag: string,
  ): string | undefined {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  }

  function hasFlag(flag: string): boolean {
    return args.includes(flag);
  }

  const evalSetPath = getArg("--eval-set");
  const skillPath = getArg("--skill-path");

  if (!evalSetPath || !skillPath) {
    console.error(
      "Usage: bun run run_eval.ts --eval-set <path> --skill-path <path> [options]",
    );
    console.error("");
    console.error("Options:");
    console.error("  --eval-set <path>          Path to eval set JSON file (required)");
    console.error("  --skill-path <path>        Path to skill directory (required)");
    console.error("  --description <text>       Override description to test");
    console.error("  --num-workers <n>          Number of parallel workers (default: 10)");
    console.error("  --timeout <n>              Timeout per query in seconds (default: 30)");
    console.error("  --runs-per-query <n>       Number of runs per query (default: 3)");
    console.error("  --trigger-threshold <n>    Trigger rate threshold (default: 0.5)");
    console.error("  --model <name>             Model to use");
    console.error("  --cli <name>               AI CLI: claude or opencode (auto-detected)");
    console.error("  --verbose                  Print progress to stderr");
    process.exit(1);
  }

  // Read eval set
  let evalSet: EvalItem[];
  try {
    evalSet = JSON.parse(readFileSync(evalSetPath, "utf-8"));
  } catch (e) {
    console.error(`Error reading eval set: ${e}`);
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

  const { name, description: originalDescription } = parseSkillMd(skillPath);
  const description = getArg("--description") || originalDescription;
  const projectRoot = findProjectRoot();

  const numWorkers = parseInt(getArg("--num-workers") || "10", 10);
  const timeout = parseInt(getArg("--timeout") || "30", 10);
  const runsPerQuery = parseInt(getArg("--runs-per-query") || "3", 10);
  const triggerThreshold = parseFloat(
    getArg("--trigger-threshold") || "0.5",
  );
  const model = getArg("--model");
  const verbose = hasFlag("--verbose");

  if (verbose) {
    console.error(`Using CLI: ${cli}`);
    console.error(`Evaluating: ${description}`);
  }

  runEval({
    evalSet,
    skillName: name,
    description,
    numWorkers,
    timeout,
    projectRoot,
    runsPerQuery,
    triggerThreshold,
    cli,
    model,
  }).then((output) => {
    if (verbose) {
      const summary = output.summary;
      console.error(`Results: ${summary.passed}/${summary.total} passed`);
      for (const r of output.results) {
        const status = r.pass ? "PASS" : "FAIL";
        const rateStr = `${r.triggers}/${r.runs}`;
        console.error(
          `  [${status}] rate=${rateStr} expected=${r.should_trigger}: ${r.query.slice(0, 70)}`,
        );
      }
    }
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }).catch((e) => {
    console.error(`Error: ${e}`);
    process.exit(1);
  });
}
