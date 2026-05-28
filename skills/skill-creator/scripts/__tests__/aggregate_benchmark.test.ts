import { describe, it, expect } from "bun:test";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { calculateStats, aggregateResults, generateMarkdown } from "../aggregate_benchmark";
import type { Benchmark, BenchmarkRun } from "../aggregate_benchmark";

const FIXTURES_DIR = join(import.meta.dir, "..", "__fixtures__");
const SCRIPTS_DIR = join(import.meta.dir, "..");

// =============================================================================
// Slice 1: calculate_stats (pure function)
// =============================================================================

describe("calculateStats", () => {
  it("returns zero stats for empty array", () => {
    const result = calculateStats([]);
    expect(result).toEqual({ mean: 0, stddev: 0, min: 0, max: 0 });
  });

  it("computes mean/min/max for single value", () => {
    const result = calculateStats([5.0]);
    expect(result.mean).toBe(5.0);
    expect(result.stddev).toBe(0.0);
    expect(result.min).toBe(5.0);
    expect(result.max).toBe(5.0);
  });

  it("computes stats for multiple values", () => {
    const result = calculateStats([0.85, 0.90]);
    expect(result.mean).toBe(0.875);
    // stddev = sqrt(((0.85-0.875)^2 + (0.90-0.875)^2) / 1) = sqrt(0.00125) ≈ 0.0354
    expect(result.stddev).toBeCloseTo(0.0354, 3);
    expect(result.min).toBe(0.85);
    expect(result.max).toBe(0.90);
  });

  it("rounds results to 4 decimal places", () => {
    const result = calculateStats([1.0 / 3.0, 2.0 / 3.0]);
    expect(result.mean).toBe(0.5);
    // Values like 0.3333 and 0.6667 with rounding
    expect(result.mean.toString()).not.toContain("000000");
  });

  it("computes stddev correctly for 3+ values", () => {
    // 0.55, 0.60, 0.65: mean=0.60
    // variance = ((0.55-0.6)^2 + (0.6-0.6)^2 + (0.65-0.6)^2) / 2 = (0.0025+0+0.0025)/2 = 0.0025
    // stddev = 0.05
    const result = calculateStats([0.55, 0.60, 0.65]);
    expect(result.mean).toBe(0.6);
    expect(result.stddev).toBe(0.05);
    expect(result.min).toBe(0.55);
    expect(result.max).toBe(0.65);
  });
});

// =============================================================================
// Slice 3: aggregateResults (pure function)
// =============================================================================

describe("aggregateResults", () => {
  it("returns empty summaries for configs with no runs", () => {
    const result: Record<string, any> = aggregateResults({ with_skill: [], without_skill: [] });
    expect(result.with_skill.pass_rate).toEqual({ mean: 0, stddev: 0, min: 0, max: 0 });
    expect(result.without_skill.pass_rate).toEqual({ mean: 0, stddev: 0, min: 0, max: 0 });
  });

  it("returns delta of 0 delta fields when no runs", () => {
    const result: Record<string, any> = aggregateResults({ with_skill: [], without_skill: [] });
    expect(result.delta).toBeDefined();
    expect(result.delta.pass_rate).toBe("+0.00");
  });

  it("computes summary stats from run results", () => {
    const results: Record<string, any[]> = {
      with_skill: [
        { pass_rate: 0.85, time_seconds: 45.2, tokens: 2500 },
        { pass_rate: 0.90, time_seconds: 38.7, tokens: 2100 },
      ],
      without_skill: [
        { pass_rate: 0.55, time_seconds: 62.1, tokens: 3500 },
        { pass_rate: 0.60, time_seconds: 58.3, tokens: 3200 },
      ],
    };
    const summary: Record<string, any> = aggregateResults(results);

    // with_skill stats
    expect(summary.with_skill.pass_rate.mean).toBe(0.875);
    expect(summary.with_skill.pass_rate.min).toBe(0.85);
    expect(summary.with_skill.pass_rate.max).toBe(0.90);
    expect(summary.with_skill.time_seconds.mean).toBeCloseTo(41.95, 2);
    expect(summary.with_skill.tokens.mean).toBe(2300);

    // delta (uses banker's rounding matching Python)
    // pass_rate: 0.875 - 0.575 = +0.30
    // time: 41.95 - 60.2 = -18.25 → banker's rounds to -18.2
    // tokens: 2300 - 3350 = -1050
    expect(summary.delta.pass_rate).toBe("+0.30");
    expect(summary.delta.time_seconds).toBe("-18.2");
    expect(summary.delta.tokens).toBe("-1050");
  });

  it("handles single config (no baseline/delta)", () => {
    const results: Record<string, any[]> = {
      with_skill: [{ pass_rate: 0.80, time_seconds: 30.0, tokens: 1000 }],
    };
    const summary: Record<string, any> = aggregateResults(results);
    expect(summary.with_skill.pass_rate.mean).toBe(0.80);
    expect(summary.delta).toBeDefined();
  });

  it("handles token field defaults to 0", () => {
    const results: Record<string, any[]> = {
      with_skill: [{ pass_rate: 0.70, time_seconds: 20.0 }],
      without_skill: [{ pass_rate: 0.50, time_seconds: 25.0, tokens: 100 }],
    };
    const summary: Record<string, any> = aggregateResults(results);
    expect(summary.with_skill.tokens.mean).toBe(0);
    expect(summary.without_skill.tokens.mean).toBe(100);
  });
});

// =============================================================================
// Slice 5: generateMarkdown (pure function)
// =============================================================================

describe("generateMarkdown", () => {
  it("renders header with skill name", () => {
    const benchmark = {
      metadata: {
        skill_name: "my-skill",
        skill_path: "/path/to/skill",
        executor_model: "gpt-4",
        analyzer_model: "gpt-4",
        timestamp: "2026-01-15T10:30:00Z",
        evals_run: [100],
        runs_per_configuration: 3,
      },
      runs: [],
      run_summary: {
        with_skill: {
          pass_rate: { mean: 0.875, stddev: 0.0354, min: 0.85, max: 0.90 },
          time_seconds: { mean: 41.95, stddev: 4.6, min: 38.7, max: 45.2 },
          tokens: { mean: 2300, stddev: 282.8, min: 2100, max: 2500 },
        },
        without_skill: {
          pass_rate: { mean: 0.575, stddev: 0.0354, min: 0.55, max: 0.60 },
          time_seconds: { mean: 60.2, stddev: 2.7, min: 58.3, max: 62.1 },
          tokens: { mean: 3350, stddev: 212.1, min: 3200, max: 3500 },
        },
        delta: { pass_rate: "+0.30", time_seconds: "-18.3", tokens: "-1050" },
      },
      notes: [],
    };
    const md = generateMarkdown(benchmark);

    expect(md).toContain("# Skill Benchmark: my-skill");
    expect(md).toContain("**Model**: gpt-4");
    expect(md).toContain("**Date**: 2026-01-15T10:30:00Z");
    expect(md).toContain("**Evals**: 100 (3 runs each per configuration)");
  });

  it("renders summary table with config labels", () => {
    const benchmark = {
      metadata: {
        skill_name: "test",
        skill_path: "",
        executor_model: "claude",
        analyzer_model: "claude",
        timestamp: "2026-01-15T10:30:00Z",
        evals_run: [1],
        runs_per_configuration: 2,
      },
      runs: [],
      run_summary: {
        new_skill: {
          pass_rate: { mean: 0.90, stddev: 0.01, min: 0.89, max: 0.91 },
          time_seconds: { mean: 30.0, stddev: 2.0, min: 28.0, max: 32.0 },
          tokens: { mean: 500, stddev: 50, min: 450, max: 550 },
        },
        old_skill: {
          pass_rate: { mean: 0.50, stddev: 0.02, min: 0.48, max: 0.52 },
          time_seconds: { mean: 60.0, stddev: 5.0, min: 55.0, max: 65.0 },
          tokens: { mean: 1000, stddev: 100, min: 900, max: 1100 },
        },
        delta: { pass_rate: "+0.40", time_seconds: "-30.0", tokens: "-500" },
      },
      notes: [],
    } satisfies Benchmark;
    const md = generateMarkdown(benchmark);

    // Config names should be transformed: new_skill → New Skill, old_skill → Old Skill
    expect(md).toContain("| New Skill | Old Skill | Delta |");
    // Pass rate formatted as percentages
    expect(md).toContain("90% ± 1%");
    expect(md).toContain("50% ± 2%");
    // Time formatted with 1 decimal
    expect(md).toContain("30.0s ± 2.0s");
    expect(md).toContain("60.0s ± 5.0s");
    // Tokens formatted as integers
    expect(md).toContain("500 ± 50");
    expect(md).toContain("1000 ± 100");
  });

  it("renders Notes section when notes exist", () => {
    const benchmark = {
      metadata: {
        skill_name: "test",
        skill_path: "",
        executor_model: "claude",
        analyzer_model: "claude",
        timestamp: "2026-01-15T10:30:00Z",
        evals_run: [1],
        runs_per_configuration: 1,
      },
      runs: [],
      run_summary: {
        config_a: {
          pass_rate: { mean: 0.90, stddev: 0, min: 0.90, max: 0.90 },
          time_seconds: { mean: 30.0, stddev: 0, min: 30.0, max: 30.0 },
          tokens: { mean: 500, stddev: 0, min: 500, max: 500 },
        },
        delta: {},
      },
      notes: ["Note one", "Note two"],
    } satisfies Benchmark;
    const md = generateMarkdown(benchmark);

    expect(md).toContain("## Notes");
    expect(md).toContain("- Note one");
    expect(md).toContain("- Note two");
  });

  it("does not render Notes section when notes are empty", () => {
    const benchmark = {
      metadata: {
        skill_name: "test",
        skill_path: "",
        executor_model: "claude",
        analyzer_model: "claude",
        timestamp: "2026-01-15T10:30:00Z",
        evals_run: [1],
        runs_per_configuration: 1,
      },
      runs: [],
      run_summary: {
        config_a: {
          pass_rate: { mean: 0.90, stddev: 0, min: 0.90, max: 0.90 },
          time_seconds: { mean: 30.0, stddev: 0, min: 30.0, max: 30.0 },
          tokens: { mean: 500, stddev: 0, min: 500, max: 500 },
        },
        delta: {},
      },
      notes: [],
    } satisfies Benchmark;
    const md = generateMarkdown(benchmark);

    expect(md).not.toContain("## Notes");
  });
});

// =============================================================================
// Tracer bullet: Workspace layout integration (loadRunResults + generateBenchmark)
// =============================================================================

describe("generateBenchmark (workspace layout)", () => {
  it("loads runs from workspace layout and generates benchmark.json", async () => {
    const { generateBenchmark } = await import("../aggregate_benchmark");
    const benchmark = generateBenchmark(
      join(FIXTURES_DIR, "benchmark-workspace"),
      "test-skill",
      "/path/to/skill",
    );

    expect(benchmark.metadata.skill_name).toBe("test-skill");
    expect(benchmark.metadata.skill_path).toBe("/path/to/skill");
    expect(benchmark.metadata.evals_run).toEqual([100]);
    expect(benchmark.runs.length).toBe(4); // 2 with_skill + 2 without_skill

    // Check run_summary
    const rs = benchmark.run_summary;
    expect(rs.with_skill).toBeDefined();
    expect(rs.without_skill).toBeDefined();
    expect(rs.delta).toBeDefined();

    // with_skill: pass_rate mean = (0.85 + 0.90) / 2 = 0.875
    expect((rs.with_skill as any).pass_rate.mean).toBe(0.875);
    // without_skill: pass_rate mean = (0.55 + 0.60) / 2 = 0.575
    expect((rs.without_skill as any).pass_rate.mean).toBe(0.575);
    // delta: 0.875 - 0.575 = +0.30
    expect((rs.delta as any).pass_rate).toBe("+0.30");
  });

  it("extracts expectations and notes from grading.json", async () => {
    const { generateBenchmark } = await import("../aggregate_benchmark");
    const benchmark = generateBenchmark(
      join(FIXTURES_DIR, "benchmark-workspace"),
    );

    // First run should have expectations and notes
    const firstWithSkill = benchmark.runs.find(
      (r: BenchmarkRun) => r.configuration === "with_skill" && r.run_number === 1,
    );
    expect(firstWithSkill).toBeDefined();
    const fws = firstWithSkill!;
    expect(fws.expectations.length).toBe(2);
    expect(fws.notes.length).toBeGreaterThan(0);

    // Run result fields
    expect(fws.result.pass_rate).toBe(0.85);
    expect(fws.result.passed).toBe(17);
    expect(fws.result.failed).toBe(3);
    expect(fws.result.total).toBe(20);
    expect(fws.result.time_seconds).toBe(45.2);
    expect(fws.result.tokens).toBe(2500);
    expect(fws.result.tool_calls).toBe(8);
    expect(fws.result.errors).toBe(1);
  });

  it("uses eval_id from eval_metadata.json when available", async () => {
    const { generateBenchmark } = await import("../aggregate_benchmark");
    const benchmark = generateBenchmark(
      join(FIXTURES_DIR, "benchmark-workspace"),
    );

    const run = benchmark.runs[0];
    expect(run.eval_id).toBe(100);
  });
});

// =============================================================================
// Legacy layout support
// =============================================================================

describe("generateBenchmark (legacy layout)", () => {
  it("loads runs from legacy runs/ subdirectory", async () => {
    const { generateBenchmark } = await import("../aggregate_benchmark");
    const benchmark = generateBenchmark(
      join(FIXTURES_DIR, "benchmark-legacy"),
    );

    expect(benchmark.runs.length).toBe(2); // 1 with_skill + 1 without_skill

    const ws = benchmark.run_summary.with_skill as Record<string, any>;
    const wos = benchmark.run_summary.without_skill as Record<string, any>;

    expect(ws.pass_rate.mean).toBe(0.75);
    expect(wos.pass_rate.mean).toBe(0.40);
    expect((benchmark.run_summary.delta as any).pass_rate).toBe("+0.35");
  });
});

// =============================================================================
// CLI integration tests (import.meta.main block)
// =============================================================================

describe("CLI (import.meta.main)", () => {
  const workspaceFixture = join(FIXTURES_DIR, "benchmark-workspace");

  it("prints usage and exits 1 when no directory arg is provided", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "aggregate_benchmark.ts")],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("generates benchmark.json and benchmark.md from workspace layout", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "aggbench-"));
    const outJson = join(tmpDir, "out.json");
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "aggregate_benchmark.ts"), workspaceFixture, "-o", outJson],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(`Generated: ${outJson}`);

      // Verify benchmark.json was written
      const jsonContent = readFileSync(outJson, "utf-8");
      const parsed = JSON.parse(jsonContent);
      expect(parsed.metadata.skill_name).toBe("<skill-name>");
      expect(parsed.runs.length).toBe(4);

      // Verify benchmark.md was written
      const mdPath = outJson.replace(".json", ".md");
      const mdContent = readFileSync(mdPath, "utf-8");
      expect(mdContent).toContain("# Skill Benchmark:");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts --skill-name and --skill-path flags", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "aggbench-"));
    const outJson = join(tmpDir, "out.json");
    try {
      const result = spawnSync(
        "bun",
        [
          "run", join(SCRIPTS_DIR, "aggregate_benchmark.ts"),
          workspaceFixture,
          "--skill-name", "my-skill",
          "--skill-path", "/custom/path",
          "-o", outJson,
        ],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);

      const jsonContent = readFileSync(outJson, "utf-8");
      const parsed = JSON.parse(jsonContent);
      expect(parsed.metadata.skill_name).toBe("my-skill");
      expect(parsed.metadata.skill_path).toBe("/custom/path");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles legacy layout with runs/ subdirectory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "aggbench-"));
    const outJson = join(tmpDir, "out.json");
    const legacyFixture = join(FIXTURES_DIR, "benchmark-legacy");
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "aggregate_benchmark.ts"), legacyFixture, "-o", outJson],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);

      const jsonContent = readFileSync(outJson, "utf-8");
      const parsed = JSON.parse(jsonContent);
      expect(parsed.runs.length).toBe(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits with error for non-existent directory", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "aggregate_benchmark.ts"), "/nonexistent/path"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Directory not found");
  });
});
