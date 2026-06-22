/**
 * Aggregate individual run results into benchmark summary statistics.
 *
 * Reads grading.json files from run directories and produces:
 * - run_summary with mean, stddev, min, max for each metric
 * - delta between with_skill and without_skill configurations
 *
 * Usage:
 *     bun run aggregate_benchmark.ts <benchmark_dir>
 *
 * Example:
 *     bun run aggregate_benchmark.ts benchmarks/2026-01-15T10-30-00/
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Stats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
}

export interface RunResult {
  eval_id: number;
  run_number: number;
  pass_rate: number;
  passed: number;
  failed: number;
  total: number;
  time_seconds: number;
  tokens: number;
  tool_calls: number;
  errors: number;
  expectations: Record<string, unknown>[];
  notes: string[];
}

export interface BenchmarkRun {
  eval_id: number;
  configuration: string;
  run_number: number;
  result: {
    pass_rate: number;
    passed: number;
    failed: number;
    total: number;
    time_seconds: number;
    tokens: number;
    tool_calls: number;
    errors: number;
  };
  expectations: Record<string, unknown>[];
  notes: string[];
}

export interface Benchmark {
  metadata: {
    skill_name: string;
    skill_path: string;
    executor_model: string;
    analyzer_model: string;
    timestamp: string;
    evals_run: number[];
    runs_per_configuration: number;
  };
  runs: BenchmarkRun[];
  run_summary: Record<string, Record<string, Stats> | Record<string, string>>;
  notes: string[];
}

export function calculateStats(values: number[]): Stats {
  if (!values || values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }

  const n = values.length;
  const mean = values.reduce((sum, x) => sum + x, 0) / n;

  let stddev = 0;
  if (n > 1) {
    const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    stddev = Math.sqrt(variance);
  }

  return {
    mean: pythonRound(mean, 4),
    stddev: pythonRound(stddev, 4),
    min: pythonRound(Math.min(...values), 4),
    max: pythonRound(Math.max(...values), 4),
  };
}

function _roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Python-compatible rounding (banker's rounding / round-half-to-even) */
function pythonRound(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  // If exactly halfway, round to even (banker's rounding)
  if (Math.abs(scaled - rounded) === 0.5) {
    return (rounded % 2 === 0 ? rounded : rounded - 1) / factor;
  }
  return rounded / factor;
}

/** Format number with Python-compatible rounding, always showing sign */
function formatDelta(value: number, decimals: number): string {
  const sign = value >= 0 ? "+" : "";
  const rounded = pythonRound(value, decimals);
  return sign + rounded.toFixed(decimals);
}

export function loadRunResults(benchmarkDir: string): Record<string, RunResult[]> {
  // Support both layouts: eval dirs directly under benchmark_dir, or under runs/
  const runsDir = join(benchmarkDir, "runs");
  let searchDir: string;
  if (existsSync(runsDir)) {
    searchDir = runsDir;
  } else {
    const hasEvalDirs = readdirSync(benchmarkDir).some((d) => {
      try {
        return statSync(join(benchmarkDir, d)).isDirectory() && d.startsWith("eval-");
      } catch {
        return false;
      }
    });
    if (hasEvalDirs) {
      searchDir = benchmarkDir;
    } else {
      console.error(`No eval directories found in ${benchmarkDir} or ${runsDir}`);
      return {};
    }
  }

  const results: Record<string, RunResult[]> = {};

  const evalDirs = readdirSync(searchDir)
    .filter((d) => {
      try {
        return statSync(join(searchDir, d)).isDirectory() && d.startsWith("eval-");
      } catch {
        return false;
      }
    })
    .sort();

  evalDirs.forEach((evalDirName, evalIdx) => {
    const evalDir = join(searchDir, evalDirName);

    // Determine eval_id: check metadata first, then parse from dir name
    let evalId: number;
    const metadataPath = join(evalDir, "eval_metadata.json");
    if (existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
        evalId = metadata.eval_id ?? evalIdx;
      } catch {
        evalId = evalIdx;
      }
    } else {
      try {
        evalId = parseInt(evalDirName.split("-")[1], 10);
      } catch {
        evalId = evalIdx;
      }
    }

    // Discover config directories dynamically
    const entries = readdirSync(evalDir)
      .filter((d) => {
        try {
          return statSync(join(evalDir, d)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();

    for (const configName of entries) {
      const configDir = join(evalDir, configName);

      // Skip non-config directories (no run-* subdirs)
      const hasRuns = readdirSync(configDir).some((r) => r.startsWith("run-"));
      if (!hasRuns) continue;

      if (!results[configName]) {
        results[configName] = [];
      }

      const runDirs = readdirSync(configDir)
        .filter((r) => {
          try {
            return statSync(join(configDir, r)).isDirectory() && r.startsWith("run-");
          } catch {
            return false;
          }
        })
        .sort();

      for (const runDirName of runDirs) {
        const runNumber = parseInt(runDirName.split("-")[1], 10);
        const runDir = join(configDir, runDirName);
        const gradingFile = join(runDir, "grading.json");

        if (!existsSync(gradingFile)) {
          console.error(`Warning: grading.json not found in ${runDir}`);
          continue;
        }

        let grading: Record<string, unknown>;
        try {
          grading = JSON.parse(readFileSync(gradingFile, "utf-8"));
        } catch (e) {
          console.error(`Warning: Invalid JSON in ${gradingFile}: ${e}`);
          continue;
        }

        const summary = (grading.summary || {}) as Record<string, number>;
        const result: RunResult = {
          eval_id: evalId,
          run_number: runNumber,
          pass_rate: summary.pass_rate ?? 0,
          passed: summary.passed ?? 0,
          failed: summary.failed ?? 0,
          total: summary.total ?? 0,
          time_seconds: 0,
          tokens: 0,
          tool_calls: 0,
          errors: 0,
          expectations: [],
          notes: [],
        };

        // Extract timing
        const timing = (grading.timing || {}) as Record<string, number>;
        result.time_seconds = timing.total_duration_seconds ?? 0;

        const timingFile = join(runDir, "timing.json");
        if (result.time_seconds === 0 && existsSync(timingFile)) {
          try {
            const timingData = JSON.parse(readFileSync(timingFile, "utf-8"));
            result.time_seconds = timingData.total_duration_seconds ?? 0;
            result.tokens = timingData.total_tokens ?? 0;
          } catch {
            // ignore timing parse errors
          }
        }

        // Extract execution metrics
        const metrics = (grading.execution_metrics || {}) as Record<string, number>;
        result.tool_calls = metrics.total_tool_calls ?? 0;
        if (!result.tokens) {
          result.tokens = metrics.output_chars ?? 0;
        }
        result.errors = metrics.errors_encountered ?? 0;

        // Extract expectations
        const rawExpectations = (grading.expectations || []) as Record<string, unknown>[];
        for (const exp of rawExpectations) {
          if (!("text" in exp) || !("passed" in exp)) {
            console.error(
              `Warning: expectation in ${gradingFile} missing required fields (text, passed, evidence): ${JSON.stringify(exp)}`,
            );
          }
        }
        result.expectations = rawExpectations;

        // Extract notes from user_notes_summary
        const notesSummary = (grading.user_notes_summary || {}) as Record<string, string[]>;
        const notes: string[] = [];
        notes.push(...(notesSummary.uncertainties || []));
        notes.push(...(notesSummary.needs_review || []));
        notes.push(...(notesSummary.workarounds || []));
        result.notes = notes;

        results[configName].push(result);
      }
    }
  });

  return results;
}

export function aggregateResults(
  results: Record<string, RunResult[]>,
): Record<string, Record<string, Stats> | Record<string, string>> {
  const runSummary: Record<string, Record<string, Stats> | Record<string, string>> = {};
  const configs = Object.keys(results);

  for (const config of configs) {
    const runs = results[config] || [];

    if (runs.length === 0) {
      runSummary[config] = {
        pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
        time_seconds: { mean: 0, stddev: 0, min: 0, max: 0 },
        tokens: { mean: 0, stddev: 0, min: 0, max: 0 },
      } as Record<string, Stats>;
      continue;
    }

    const passRates = runs.map((r) => r.pass_rate);
    const times = runs.map((r) => r.time_seconds);
    const tokens = runs.map((r) => r.tokens ?? 0);

    runSummary[config] = {
      pass_rate: calculateStats(passRates),
      time_seconds: calculateStats(times),
      tokens: calculateStats(tokens),
    } as Record<string, Stats>;
  }

  // Calculate delta between the first two configs
  if (configs.length >= 2) {
    const primary = (runSummary[configs[0]] || {}) as Record<string, Stats>;
    const baseline = (runSummary[configs[1]] || {}) as Record<string, Stats>;
    const deltaPassRate = (primary.pass_rate?.mean ?? 0) - (baseline.pass_rate?.mean ?? 0);
    const deltaTime = (primary.time_seconds?.mean ?? 0) - (baseline.time_seconds?.mean ?? 0);
    const deltaTokens = (primary.tokens?.mean ?? 0) - (baseline.tokens?.mean ?? 0);

    runSummary.delta = {
      pass_rate: formatDelta(deltaPassRate, 2),
      time_seconds: formatDelta(deltaTime, 1),
      tokens: formatDelta(deltaTokens, 0),
    };
  } else {
    const primary = configs.length > 0 ? ((runSummary[configs[0]] || {}) as Record<string, Stats>) : {};
    const deltaPassRate = (primary.pass_rate?.mean ?? 0) - 0;
    const deltaTime = (primary.time_seconds?.mean ?? 0) - 0;
    const deltaTokens = (primary.tokens?.mean ?? 0) - 0;

    runSummary.delta = {
      pass_rate: formatDelta(deltaPassRate, 2),
      time_seconds: formatDelta(deltaTime, 1),
      tokens: formatDelta(deltaTokens, 0),
    };
  }

  return runSummary;
}

export function generateBenchmark(benchmarkDir: string, skillName?: string, skillPath?: string): Benchmark {
  const results = loadRunResults(benchmarkDir);
  const runSummary = aggregateResults(results) as Record<string, Record<string, Stats> | Record<string, string>>;

  // Build runs array
  const runs: BenchmarkRun[] = [];
  for (const config of Object.keys(results)) {
    for (const result of results[config]) {
      runs.push({
        eval_id: result.eval_id,
        configuration: config,
        run_number: result.run_number,
        result: {
          pass_rate: result.pass_rate,
          passed: result.passed,
          failed: result.failed,
          total: result.total,
          time_seconds: result.time_seconds,
          tokens: result.tokens ?? 0,
          tool_calls: result.tool_calls ?? 0,
          errors: result.errors ?? 0,
        },
        expectations: result.expectations,
        notes: result.notes,
      });
    }
  }

  // Determine eval IDs
  const evalIds = new Set<number>();
  for (const configRuns of Object.values(results)) {
    for (const r of configRuns) {
      evalIds.add(r.eval_id);
    }
  }
  const sortedEvalIds = [...evalIds].sort((a, b) => a - b);

  return {
    metadata: {
      skill_name: skillName || "<skill-name>",
      skill_path: skillPath || "<path/to/skill>",
      executor_model: "<model-name>",
      analyzer_model: "<model-name>",
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      evals_run: sortedEvalIds,
      runs_per_configuration: 3,
    },
    runs,
    run_summary: runSummary,
    notes: [],
  };
}

export function generateMarkdown(benchmark: Benchmark): string {
  const metadata = benchmark.metadata;
  const runSummary = benchmark.run_summary;

  // Determine config names (excluding "delta")
  const configs = Object.keys(runSummary).filter((k) => k !== "delta");
  const configA = configs.length >= 1 ? configs[0] : "config_a";
  const configB = configs.length >= 2 ? configs[1] : "config_b";
  const labelA = configA.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const labelB = configB.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const lines: string[] = [
    `# Skill Benchmark: ${metadata.skill_name}`,
    "",
    `**Model**: ${metadata.executor_model}`,
    `**Date**: ${metadata.timestamp}`,
    `**Evals**: ${metadata.evals_run.join(", ")} (${metadata.runs_per_configuration} runs each per configuration)`,
    "",
    "## Summary",
    "",
    `| Metric | ${labelA} | ${labelB} | Delta |`,
    "|--------|------------|---------------|-------|",
  ];

  const aSummary = (runSummary[configA] || {}) as Record<string, Stats>;
  const bSummary = (runSummary[configB] || {}) as Record<string, Stats>;
  const delta = (runSummary.delta || {}) as Record<string, string>;

  // Format pass rate
  const aPr = aSummary.pass_rate || { mean: 0, stddev: 0, min: 0, max: 0 };
  const bPr = bSummary.pass_rate || { mean: 0, stddev: 0, min: 0, max: 0 };
  lines.push(
    `| Pass Rate | ${(aPr.mean * 100).toFixed(0)}% \u00b1 ${(aPr.stddev * 100).toFixed(0)}% | ${(bPr.mean * 100).toFixed(0)}% \u00b1 ${(bPr.stddev * 100).toFixed(0)}% | ${delta.pass_rate || "\u2014"} |`,
  );

  // Format time
  const aTime = aSummary.time_seconds || { mean: 0, stddev: 0, min: 0, max: 0 };
  const bTime = bSummary.time_seconds || { mean: 0, stddev: 0, min: 0, max: 0 };
  lines.push(
    `| Time | ${aTime.mean.toFixed(1)}s \u00b1 ${aTime.stddev.toFixed(1)}s | ${bTime.mean.toFixed(1)}s \u00b1 ${bTime.stddev.toFixed(1)}s | ${delta.time_seconds || "\u2014"}s |`,
  );

  // Format tokens
  const aTokens = aSummary.tokens || { mean: 0, stddev: 0, min: 0, max: 0 };
  const bTokens = bSummary.tokens || { mean: 0, stddev: 0, min: 0, max: 0 };
  lines.push(
    `| Tokens | ${aTokens.mean.toFixed(0)} \u00b1 ${aTokens.stddev.toFixed(0)} | ${bTokens.mean.toFixed(0)} \u00b1 ${bTokens.stddev.toFixed(0)} | ${delta.tokens || "\u2014"} |`,
  );

  // Notes section
  if (benchmark.notes && benchmark.notes.length > 0) {
    lines.push("", "## Notes", "");
    for (const note of benchmark.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

// CLI entry point: when run directly with `bun run aggregate_benchmark.ts`
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: bun run aggregate_benchmark.ts <benchmark_dir> [--skill-name <name>] [--skill-path <path>] [--output|-o <output.json>]",
    );
    process.exit(1);
  }

  const benchmarkDir = args[0];
  let skillName = "";
  let skillPath = "";
  let output: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--skill-name") {
      skillName = args[++i];
    } else if (args[i] === "--skill-path") {
      skillPath = args[++i];
    } else if (args[i] === "--output" || args[i] === "-o") {
      output = args[++i];
    }
  }

  if (!existsSync(benchmarkDir)) {
    console.error(`Directory not found: ${benchmarkDir}`);
    process.exit(1);
  }

  const benchmark = generateBenchmark(benchmarkDir, skillName, skillPath);

  const outputJson = output || join(benchmarkDir, "benchmark.json");
  const outputMd = outputJson.replace(/\.json$/, ".md");

  writeFileSync(outputJson, JSON.stringify(benchmark, null, 2));
  console.error(`Generated: ${outputJson}`);

  const markdown = generateMarkdown(benchmark);
  writeFileSync(outputMd, markdown);
  console.error(`Generated: ${outputMd}`);

  // Print summary
  const runSummary = benchmark.run_summary;
  const configs = Object.keys(runSummary).filter((k) => k !== "delta");
  const delta = (runSummary.delta || {}) as Record<string, string>;

  console.error(`\nSummary:`);
  for (const config of configs) {
    const pr = (runSummary[config] as Record<string, Stats>)?.pass_rate?.mean ?? 0;
    const label = config.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    console.error(`  ${label}: ${(pr * 100).toFixed(1)}% pass rate`);
  }
  console.error(`  Delta:         ${delta.pass_rate || "\u2014"}`);
}
