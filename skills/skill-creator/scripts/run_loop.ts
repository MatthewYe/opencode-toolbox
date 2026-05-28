/**
 * Run the eval + improve loop until all pass or max iterations reached.
 *
 * Combines run_eval.ts and improve_description.ts in a loop, tracking history
 * and returning the best description found. Supports train/test split to prevent
 * overfitting. Works with both `claude` (Claude Code) and `opencode run` (OpenCode).
 *
 * Usage:
 *     bun run run_loop.ts --eval-set <path> --skill-path <path> --model <name> [options]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseSkillMd } from "./utils";
import { runEval, findProjectRoot, type EvalItem, type EvalOutput, type RunEvalOptions } from "./run_eval";
import { improveDescription, detectCli, type EvalResults, type ImproveDescriptionOptions } from "./improve_description";
import { generateHtml } from "./generate_report";

// =============================================================================
// Types
// =============================================================================

export interface QueryResult {
  query: string;
  should_trigger: boolean;
  pass: boolean;
  triggers: number;
  runs: number;
}

export interface HistoryEntry {
  iteration: number;
  description: string;
  train_passed: number;
  train_failed: number;
  train_total: number;
  train_results: QueryResult[];
  test_passed: number | null;
  test_failed: number | null;
  test_total: number | null;
  test_results: QueryResult[] | null;
  passed: number;
  failed: number;
  total: number;
  results: QueryResult[];
}

export interface RunLoopOutput {
  exit_reason: string;
  original_description: string;
  best_description: string;
  best_score: string;
  best_train_score: string;
  best_test_score: string | null;
  final_description: string;
  iterations_run: number;
  holdout: number;
  train_size: number;
  test_size: number;
  history: HistoryEntry[];
}

export interface RunLoopOptions {
  evalSet: EvalItem[];
  skillPath: string;
  descriptionOverride?: string;
  numWorkers: number;
  timeout: number;
  maxIterations: number;
  runsPerQuery: number;
  triggerThreshold: number;
  holdout: number;
  model: string;
  cli: string;
  verbose?: boolean;
  liveReportPath?: string;
  logDir?: string;
  // DI for testing
  injectedRunEval?: (opts: RunEvalOptions) => Promise<EvalOutput>;
  injectedImproveDescription?: (opts: ImproveDescriptionOptions) => Promise<string>;
}

// =============================================================================
// Slice 1: splitEvalSet — pure function for stratified train/test split
// =============================================================================

/**
 * Split eval set into train and test sets, stratified by should_trigger.
 *
 * Uses a seeded random shuffle to produce deterministic partitions.
 * Guarantees at least 1 item per class in test set.
 * Matching Python's split_eval_set() behavior.
 */
export function splitEvalSet(
  evalSet: { query: string; should_trigger: boolean }[],
  holdout: number,
  seed: number = 42,
): [{ query: string; should_trigger: boolean }[], { query: string; should_trigger: boolean }[]] {
  // Simple seeded PRNG (same algorithm as Python's random for default seed behavior)
  let state = seed;
  function random(): number {
    // Mulberry32 PRNG — fast, good distribution
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function shuffle<T>(arr: T[]): void {
    // Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  const trigger = evalSet.filter((e) => e.should_trigger);
  const noTrigger = evalSet.filter((e) => !e.should_trigger);

  shuffle(trigger);
  shuffle(noTrigger);

  const nTriggerTest = Math.max(1, Math.floor(trigger.length * holdout));
  const nNoTriggerTest = Math.max(1, Math.floor(noTrigger.length * holdout));

  const testSet = trigger.slice(0, nTriggerTest).concat(noTrigger.slice(0, nNoTriggerTest));
  const trainSet = trigger.slice(nTriggerTest).concat(noTrigger.slice(nNoTriggerTest));

  return [trainSet, testSet];
}

// =============================================================================
// Slice 2: runLoop — core orchestration
// =============================================================================

/**
 * Run the eval + improvement loop.
 *
 * Iteratively runs eval on train+test sets, records history,
 * calls AI to improve description, and selects best-performing description.
 */
export async function runLoop(options: RunLoopOptions): Promise<RunLoopOutput> {
  const {
    evalSet,
    skillPath,
    descriptionOverride,
    numWorkers,
    timeout,
    maxIterations,
    runsPerQuery,
    triggerThreshold,
    holdout,
    model,
    cli,
    verbose = false,
    liveReportPath,
    logDir,
    injectedRunEval,
    injectedImproveDescription,
  } = options;

  const runEvalFn = injectedRunEval || runEval;
  const improveDescFn = injectedImproveDescription || improveDescription;

  const projectRoot = findProjectRoot();
  const { name, description: originalDescription, fullContent: content } = parseSkillMd(skillPath);
  let currentDescription = descriptionOverride || originalDescription;

  let trainSet: EvalItem[];
  let testSet: EvalItem[];

  if (holdout > 0) {
    [trainSet, testSet] = splitEvalSet(evalSet, holdout);
    if (verbose) {
      console.error(
        `Split: ${trainSet.length} train, ${testSet.length} test (holdout=${holdout})`,
      );
    }
  } else {
    trainSet = evalSet;
    testSet = [];
  }

  const history: HistoryEntry[] = [];
  let exitReason = "unknown";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.error(`\n${"=".repeat(60)}`);
      console.error(`Iteration ${iteration}/${maxIterations}`);
      console.error(`Description: ${currentDescription}`);
      console.error(`${"=".repeat(60)}`);
    }

    const iterStart = Date.now();
    const allQueries = trainSet.concat(testSet);
    const evalOutput = await runEvalFn({
      evalSet: allQueries,
      skillName: name,
      description: currentDescription,
      numWorkers,
      timeout,
      projectRoot,
      runsPerQuery,
      triggerThreshold,
      cli,
      model,
    });
    const elapsedSec = (Date.now() - iterStart) / 1000;

    const trainQueriesSet = new Set(trainSet.map((q) => q.query));
    const trainResultList = evalOutput.results.filter((r) =>
      trainQueriesSet.has(r.query),
    );
    const testResultList = evalOutput.results.filter(
      (r) => !trainQueriesSet.has(r.query),
    );

    const trainPassed = trainResultList.filter((r) => r.pass).length;
    const trainTotal = trainResultList.length;
    const trainSummary = {
      passed: trainPassed,
      failed: trainTotal - trainPassed,
      total: trainTotal,
    };

    let testSummary: { passed: number; failed: number; total: number } | null = null;
    let testResults: QueryResult[] | null = null;

    if (testSet.length > 0) {
      const testPassed = testResultList.filter((r) => r.pass).length;
      const testTotal = testResultList.length;
      testSummary = {
        passed: testPassed,
        failed: testTotal - testPassed,
        total: testTotal,
      };
      testResults = testResultList;
    }

    history.push({
      iteration,
      description: currentDescription,
      train_passed: trainSummary.passed,
      train_failed: trainSummary.failed,
      train_total: trainSummary.total,
      train_results: trainResultList,
      test_passed: testSummary ? testSummary.passed : null,
      test_failed: testSummary ? testSummary.failed : null,
      test_total: testSummary ? testSummary.total : null,
      test_results: testResults,
      passed: trainSummary.passed,
      failed: trainSummary.failed,
      total: trainSummary.total,
      results: trainResultList,
    });

    // Write live HTML report
    if (liveReportPath) {
      const partialOutput = {
        original_description: originalDescription,
        best_description: currentDescription,
        best_score: "in progress",
        iterations_run: history.length,
        holdout,
        train_size: trainSet.length,
        test_size: testSet.length,
        history,
      } as RunLoopOutput;
      writeFileSync(
        liveReportPath,
        generateHtml(partialOutput, { autoRefresh: true, skillName: name }),
      );
    }

    if (verbose) {
      function printEvalStats(
        label: string,
        results: QueryResult[],
        elapsedSecs: number,
      ): void {
        const pos = results.filter((r) => r.should_trigger);
        const neg = results.filter((r) => !r.should_trigger);
        const tp = pos.reduce((sum, r) => sum + (r.triggers || 0), 0);
        const posRuns = pos.reduce((sum, r) => sum + (r.runs || 0), 0);
        const fn = posRuns - tp;
        const fp = neg.reduce((sum, r) => sum + (r.triggers || 0), 0);
        const negRuns = neg.reduce((sum, r) => sum + (r.runs || 0), 0);
        const tn = negRuns - fp;
        const total = tp + tn + fp + fn;
        const accuracy = total > 0 ? (tp + tn) / total : 0.0;
        console.error(
          `${label}: ${tp + tn}/${total} correct, accuracy=${(accuracy * 100).toFixed(0)}% (${elapsedSecs.toFixed(1)}s)`,
        );
      }

      printEvalStats("Train", trainResultList, elapsedSec);
      if (testSummary) {
        printEvalStats("Test ", testResultList, elapsedSec);
      }
    }

    // Early exit: all train queries pass
    if (trainSummary.failed === 0) {
      exitReason = `all_passed (iteration ${iteration})`;
      if (verbose) {
        console.error(`\nAll train queries passed on iteration ${iteration}!`);
      }
      break;
    }

    if (iteration === maxIterations) {
      exitReason = `max_iterations (${maxIterations})`;
      if (verbose) {
        console.error(`\nMax iterations reached (${maxIterations}).`);
      }
      break;
    }

    if (verbose) {
      console.error(`\nImproving description...`);
    }

    // Build blinded history (strip test_ prefixed keys)
    const blindedHistory = history.map((h) => {
      const entry: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(h)) {
        if (!k.startsWith("test_")) {
          entry[k] = v;
        }
      }
      return entry;
    });

    const newDescription = await improveDescFn({
      skillName: name,
      skillContent: content,
      currentDescription,
      evalResults: {
        skill_name: name,
        description: currentDescription,
        results: trainResultList,
        summary: {
          total: trainSummary.total,
          passed: trainSummary.passed,
          failed: trainSummary.failed,
        },
      },
      history: blindedHistory,
      model,
      cli,
      logDir,
      iteration,
    });

    if (verbose) {
      console.error(`Proposed: ${newDescription}`);
    }

    currentDescription = newDescription;
  }

  // Best description selection
  let best: HistoryEntry;
  let bestScore: string;

  if (testSet.length > 0) {
    best = history.reduce((a, b) =>
      (b.test_passed ?? 0) > (a.test_passed ?? 0) ? b : a,
    );
    bestScore = `${best.test_passed}/${best.test_total}`;
  } else {
    best = history.reduce((a, b) =>
      b.train_passed > a.train_passed ? b : a,
    );
    bestScore = `${best.train_passed}/${best.train_total}`;
  }

  if (verbose) {
    console.error(`\nExit reason: ${exitReason}`);
    console.error(`Best score: ${bestScore} (iteration ${best.iteration})`);
  }

  return {
    exit_reason: exitReason,
    original_description: originalDescription,
    best_description: best.description,
    best_score: bestScore,
    best_train_score: `${best.train_passed}/${best.train_total}`,
    best_test_score: testSet.length > 0 ? `${best.test_passed}/${best.test_total}` : null,
    final_description: currentDescription,
    iterations_run: history.length,
    holdout,
    train_size: trainSet.length,
    test_size: testSet.length,
    history,
  };
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

  const evalSetPath = getArg("--eval-set");
  const skillPath = getArg("--skill-path");
  const model = getArg("--model");

  if (!evalSetPath || !skillPath || !model) {
    console.error(
      "Usage: bun run run_loop.ts --eval-set <path> --skill-path <path> --model <name> [options]",
    );
    console.error("");
    console.error("Options:");
    console.error("  --eval-set <path>         Path to eval set JSON file (required)");
    console.error("  --skill-path <path>       Path to skill directory (required)");
    console.error("  --model <name>            Model for improvement (required)");
    console.error("  --description <text>      Override starting description");
    console.error("  --num-workers <n>         Number of parallel workers (default: 10)");
    console.error("  --timeout <n>             Timeout per query in seconds (default: 30)");
    console.error("  --max-iterations <n>      Max improvement iterations (default: 5)");
    console.error("  --runs-per-query <n>      Number of runs per query (default: 3)");
    console.error("  --trigger-threshold <n>   Trigger rate threshold (default: 0.5)");
    console.error("  --holdout <n>             Fraction of eval set to hold out for testing (default: 0.4)");
    console.error("  --cli <name>              AI CLI: claude or opencode (auto-detected)");
    console.error("  --verbose                 Print progress to stderr");
    console.error("  --report <path|none>      HTML report path or 'none' to disable (default: auto)");
    console.error("  --results-dir <path>      Save all outputs to a timestamped subdirectory");
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

  // Detect CLI
  let cli: string;
  try {
    cli = getArg("--cli") || detectCli();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  const { name } = parseSkillMd(skillPath);
  const numWorkers = parseInt(getArg("--num-workers") || "10", 10);
  const timeout = parseInt(getArg("--timeout") || "30", 10);
  const maxIterations = parseInt(getArg("--max-iterations") || "5", 10);
  const runsPerQuery = parseInt(getArg("--runs-per-query") || "3", 10);
  const triggerThreshold = parseFloat(getArg("--trigger-threshold") || "0.5");
  const holdout = parseFloat(getArg("--holdout") || "0.4");
  const verbose = hasFlag("--verbose");
  const descriptionOverride = getArg("--description");
  const reportArg = getArg("--report") || "auto";

  // Live HTML report
  let liveReportPath: string | undefined;
  if (reportArg !== "none") {
    if (reportArg === "auto") {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")
        .replace("T", "_");
      const safeName = skillPath.replace(/[/\\]/g, "_").replace(/^_+/, "");
      liveReportPath = join(
        tmpdir(),
        `skill_description_report_${safeName}_${timestamp}.html`,
      );
    } else {
      liveReportPath = reportArg;
    }
    writeFileSync(
      liveReportPath,
      `<html><body><h1>Starting optimization loop...</h1><meta http-equiv='refresh' content='5'></body></html>`,
    );
    try {
      const { execSync } = await import("node:child_process");
      execSync(`open "${liveReportPath}"`);
    } catch {
      // best-effort browser open
    }
  }

  // Results directory
  let resultsDir: string | undefined;
  const resultsDirArg = getArg("--results-dir");
  if (resultsDirArg) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:]/g, "-")
      .replace("T", "_")
      .replace(/\.\d{3}/, "");
    resultsDir = join(resultsDirArg, timestamp);
    mkdirSync(resultsDir, { recursive: true });
  }

  const logDir = resultsDir ? join(resultsDir, "logs") : undefined;

  runLoop({
    evalSet,
    skillPath,
    descriptionOverride,
    numWorkers,
    timeout,
    maxIterations,
    runsPerQuery,
    triggerThreshold,
    holdout,
    model,
    cli,
    verbose,
    liveReportPath,
    logDir,
  }).then((output) => {
    const snaked: Record<string, unknown> = {
      exit_reason: output.exit_reason,
      original_description: output.original_description,
      best_description: output.best_description,
      best_score: output.best_score,
      best_train_score: output.best_train_score,
      best_test_score: output.best_test_score,
      final_description: output.final_description,
      iterations_run: output.iterations_run,
      holdout: output.holdout,
      train_size: output.train_size,
      test_size: output.test_size,
      history: output.history,
    };

    const jsonOutput = JSON.stringify(snaked, null, 2);
    console.log(jsonOutput);

    if (resultsDir) {
      writeFileSync(join(resultsDir, "results.json"), jsonOutput);
    }

    if (liveReportPath) {
      writeFileSync(
        liveReportPath,
        generateHtml(output, { autoRefresh: false, skillName: name }),
      );
      console.error(`\nReport: ${liveReportPath}`);
    }

    if (resultsDir && liveReportPath) {
      writeFileSync(
        join(resultsDir, "report.html"),
        generateHtml(output, { autoRefresh: false, skillName: name }),
      );
    }

    if (resultsDir) {
      console.error(`Results saved to: ${resultsDir}`);
    }

    process.exit(0);
  }).catch((e) => {
    console.error(`Error: ${e}`);
    process.exit(1);
  });
}
