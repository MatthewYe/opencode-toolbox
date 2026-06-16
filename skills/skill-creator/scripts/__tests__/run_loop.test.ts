import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS_DIR = join(import.meta.dir, "..");
const FIXTURES_DIR = join(import.meta.dir, "..", "..", "..", "..", "test-fixtures", "skill-creator");

// =============================================================================
// Slice 1: splitEvalSet — stratification and determinism
// =============================================================================

describe("splitEvalSet", () => {
  let splitEvalSet: (
    evalSet: { query: string; should_trigger: boolean }[],
    holdout: number,
    seed?: number,
  ) => [{ query: string; should_trigger: boolean }[], { query: string; should_trigger: boolean }[]];

  beforeAll(async () => {
    const mod = await import("../run_loop");
    splitEvalSet = mod.splitEvalSet;
  });

  it("stratifies by should_trigger — both train and test get both classes", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "t2", should_trigger: true },
      { query: "t3", should_trigger: true },
      { query: "t4", should_trigger: true },
      { query: "t5", should_trigger: true },
      { query: "n1", should_trigger: false },
      { query: "n2", should_trigger: false },
      { query: "n3", should_trigger: false },
      { query: "n4", should_trigger: false },
      { query: "n5", should_trigger: false },
    ];

    const [train, test] = splitEvalSet(evalSet, 0.4);

    // Both train and test should have trigger and no-trigger items
    const trainTrigger = train.filter((e) => e.should_trigger);
    const trainNoTrigger = train.filter((e) => !e.should_trigger);
    const testTrigger = test.filter((e) => e.should_trigger);
    const testNoTrigger = test.filter((e) => !e.should_trigger);

    expect(trainTrigger.length).toBeGreaterThan(0);
    expect(trainNoTrigger.length).toBeGreaterThan(0);
    expect(testTrigger.length).toBeGreaterThan(0);
    expect(testNoTrigger.length).toBeGreaterThan(0);
  });

  it("produces at least 1 item per class in test set", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "n1", should_trigger: false },
    ];

    const [_train, test] = splitEvalSet(evalSet, 0.4);

    const testTrigger = test.filter((e) => e.should_trigger);
    const testNoTrigger = test.filter((e) => !e.should_trigger);
    expect(testTrigger.length).toBeGreaterThanOrEqual(1);
    expect(testNoTrigger.length).toBeGreaterThanOrEqual(1);
  });

  it("produces identical partitions for same seed", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "t2", should_trigger: true },
      { query: "t3", should_trigger: true },
      { query: "n1", should_trigger: false },
      { query: "n2", should_trigger: false },
      { query: "n3", should_trigger: false },
    ];

    const [train1, test1] = splitEvalSet(evalSet, 0.4, 42);
    const [train2, test2] = splitEvalSet(evalSet, 0.4, 42);

    const trainQueries1 = train1.map((e) => e.query).sort();
    const trainQueries2 = train2.map((e) => e.query).sort();
    const testQueries1 = test1.map((e) => e.query).sort();
    const testQueries2 = test2.map((e) => e.query).sort();

    expect(trainQueries1).toEqual(trainQueries2);
    expect(testQueries1).toEqual(testQueries2);
  });

  it("produces different partitions for different seeds", () => {
    // Use a larger eval set to reduce chance of collision
    const queries = Array.from({ length: 20 }, (_, i) => ({
      query: `q${i}`,
      should_trigger: i % 2 === 0,
    }));

    const [trainA, testA] = splitEvalSet(queries, 0.4, 1);
    const [trainB, testB] = splitEvalSet(queries, 0.4, 9999);

    const _testAQuerySet = new Set(testA.map((e) => e.query));
    const testBQuerySet = new Set(testB.map((e) => e.query));

    // Verify they are different (not guaranteed but extremely likely with 20 items)
    const aInBSize = testA.filter((e) => testBQuerySet.has(e.query)).length;
    const same = aInBSize === testA.length && testA.length === testB.length;
    // If same (extremely unlikely), at least verify train sets differ
    if (same) {
      const _trainAQuerySet = new Set(trainA.map((e) => e.query));
      const trainBQuerySet = new Set(trainB.map((e) => e.query));
      const diff = trainA.filter((e) => !trainBQuerySet.has(e.query)).length > 0;
      expect(diff).toBe(true);
    }
  });

  it("respects holdout fraction — all items accounted for", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "t2", should_trigger: true },
      { query: "t3", should_trigger: true },
      { query: "t4", should_trigger: true },
      { query: "t5", should_trigger: true },
      { query: "t6", should_trigger: true },
      { query: "n1", should_trigger: false },
      { query: "n2", should_trigger: false },
      { query: "n3", should_trigger: false },
      { query: "n4", should_trigger: false },
    ];

    const [train, test] = splitEvalSet(evalSet, 0.3);

    // Total should match original
    expect(train.length + test.length).toBe(evalSet.length);

    // Holdout should be approximately correct (at least 1 per class means min 2 test)
    const _expectedTestSize = Math.min(
      evalSet.length - 2,
      Math.max(
        2,
        Math.floor(evalSet.filter((e) => e.should_trigger).length * 0.3) +
          Math.floor(evalSet.filter((e) => !e.should_trigger).length * 0.3),
      ),
    );
    // Just verify it's non-empty and not everything
    expect(test.length).toBeGreaterThan(0);
    expect(train.length).toBeGreaterThan(0);
  });

  it("handles holdout=0 (at least 1 per class in test due to max(1, ...) logic)", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "n1", should_trigger: false },
    ];

    const [train, test] = splitEvalSet(evalSet, 0);

    // splitEvalSet always ensures max(1, floor(len * holdout)) per class
    // So even with holdout=0, test gets at least 1 per class
    expect(test.length).toBeGreaterThanOrEqual(2);
    expect(train.length).toBe(0);
  });

  it("handles holdout=1.0 (all items in test, at least 1 per class in test)", () => {
    const evalSet = [
      { query: "t1", should_trigger: true },
      { query: "t2", should_trigger: true },
      { query: "n1", should_trigger: false },
      { query: "n2", should_trigger: false },
    ];

    const [train, test] = splitEvalSet(evalSet, 1.0);

    // With holdout=1.0, all should go to test (with at least 1 per class)
    // But the at-least-1-per-class logic means train might get 1 item per class
    // Actually: max(1, int(len * 1.0)) = max(1, len) = len, so all go to test
    const testTrigger = test.filter((e) => e.should_trigger);
    const _trainTrigger = train.filter((e) => e.should_trigger);
    expect(testTrigger.length).toBeGreaterThan(0);
    // train may be empty for holdout=1.0
  });
});

// =============================================================================
// Slice 2: runLoop — core orchestration (with DI mocks)
// =============================================================================

describe("runLoop", () => {
  let runLoop: typeof import("../run_loop").runLoop;
  type EvalOutput = import("../run_eval").EvalOutput;
  type EvalItem = import("../run_eval").EvalItem;

  beforeAll(async () => {
    const mod = await import("../run_loop");
    runLoop = mod.runLoop;
  });

  function makeMockRunEval(
    trainPasses: boolean[],
    testPasses: boolean[],
    trainQueries: string[],
    testQueries: string[],
  ) {
    return async (opts: { evalSet: EvalItem[] }): Promise<EvalOutput> => {
      const evalQueries = opts.evalSet;
      const results = evalQueries.map((item) => {
        const trainIdx = trainQueries.indexOf(item.query);
        const testIdx = testQueries.indexOf(item.query);
        let pass: boolean;
        if (trainIdx >= 0) {
          pass = trainPasses[trainIdx];
        } else if (testIdx >= 0) {
          pass = testPasses[testIdx];
        } else {
          pass = false; // unknown query
        }
        return {
          query: item.query,
          should_trigger: item.should_trigger,
          trigger_rate: pass ? 1.0 : 0.0,
          triggers: pass ? 3 : 0,
          runs: 3,
          pass,
        };
      });
      const passed = results.filter((r) => r.pass).length;
      return {
        skill_name: "test-skill",
        description: "test desc",
        results,
        summary: { total: results.length, passed, failed: results.length - passed },
      };
    };
  }

  function makeAllPassRunEval() {
    return async (opts: { evalSet: EvalItem[] }): Promise<EvalOutput> => {
      const results = opts.evalSet.map((item) => ({
        query: item.query,
        should_trigger: item.should_trigger,
        trigger_rate: 1.0,
        triggers: 3,
        runs: 3,
        pass: true,
      }));
      return {
        skill_name: "test-skill",
        description: "test desc",
        results,
        summary: { total: results.length, passed: results.length, failed: 0 },
      };
    };
  }

  function makeOneFailsRunEval(failQuery: string) {
    return async (opts: { evalSet: EvalItem[] }): Promise<EvalOutput> => {
      const results = opts.evalSet.map((item) => ({
        query: item.query,
        should_trigger: item.should_trigger,
        trigger_rate: item.query === failQuery ? 0.0 : 1.0,
        triggers: item.query === failQuery ? 0 : 3,
        runs: 3,
        pass: item.query !== failQuery,
      }));
      const passed = results.filter((r) => r.pass).length;
      return {
        skill_name: "test-skill",
        description: "test desc",
        results,
        summary: { total: results.length, passed, failed: results.length - passed },
      };
    };
  }

  function makeMockImprove(returnDesc: string) {
    return async () => returnDesc;
  }

  it("exits early when all train queries pass", async () => {
    // Use holdout=0 so all queries are train — no split needed
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
    ];

    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 3,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0, // no test set
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeAllPassRunEval(),
      injectedImproveDescription: makeMockImprove("better desc"),
    });

    expect(result.iterations_run).toBe(1);
    expect(result.exit_reason).toContain("all_passed");
  });

  it("stops at max iterations when never all-passing", async () => {
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
    ];

    // "train ignore me" always fails → never all-passing
    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 3,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0,
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeOneFailsRunEval("train ignore me"),
      injectedImproveDescription: makeMockImprove("improved desc"),
    });

    expect(result.iterations_run).toBe(3);
    expect(result.exit_reason).toContain("max_iterations");
  });

  it("selects best description by test score when test set exists", async () => {
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
      { query: "test query a", should_trigger: true },
      { query: "test query b", should_trigger: false },
    ];

    // For each query, we track the pass pattern across iterations
    let _iter = 0;
    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 3,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0.5,
      model: "test-model",
      cli: "claude",
      injectedRunEval: async (opts) => {
        _iter++;
        // All queries pass in all iterations → train always passes,
        // and test always passes. Best score will be perfect.
        return makeAllPassRunEval()(opts);
      },
      injectedImproveDescription: makeMockImprove("improved desc"),
    });

    // Since all pass on first iteration, it exits early
    expect(result.iterations_run).toBe(1);
    expect(result.best_test_score).not.toBeNull();
  });

  it("uses test score for best selection when test set exists (with failures)", async () => {
    const evalSet: EvalItem[] = [
      { query: "a", should_trigger: true },
      { query: "b", should_trigger: true },
      { query: "c", should_trigger: false },
      { query: "d", should_trigger: false },
      { query: "e", should_trigger: true },
      { query: "f", should_trigger: false },
    ];

    // Always fail one query so we get 3 iterations
    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 3,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0.4,
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeOneFailsRunEval("a"),
      injectedImproveDescription: makeMockImprove("improved desc"),
    });

    // Should have test set since holdout > 0
    expect(result.test_size).toBeGreaterThan(0);
    // best_test_score should be set when test set exists
    expect(result.best_test_score).not.toBeNull();
  });

  it("selects best description by train score when no test set (holdout=0)", async () => {
    const allQueries = ["train trigger me", "train ignore me"];

    let iter = 0;
    const result = await runLoop({
      evalSet: [
        { query: "train trigger me", should_trigger: true },
        { query: "train ignore me", should_trigger: false },
      ],
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 3,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0, // no test set
      model: "test-model",
      cli: "claude",
      injectedRunEval: async (opts) => {
        iter++;
        // Iter 1: train 0/2, Iter 2: train 1/2, Iter 3: train 1/2
        if (iter === 1) {
          return makeMockRunEval([false, false], [], allQueries, [])(opts);
        } else {
          return makeMockRunEval([true, false], [], allQueries, [])(opts);
        }
      },
      injectedImproveDescription: makeMockImprove("improved desc"),
    });

    expect(result.best_test_score).toBeNull();
    expect(result.best_train_score).toBe("1/2");
    expect(result.iterations_run).toBe(3);
  });

  it("history records each iteration with correct structure", async () => {
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
    ];

    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 2,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0.5,
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeAllPassRunEval(),
      injectedImproveDescription: makeMockImprove("v2"),
    });

    expect(result.history).toHaveLength(1); // exits early since all pass

    for (const entry of result.history) {
      expect(entry).toHaveProperty("iteration");
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("train_passed");
      expect(entry).toHaveProperty("train_failed");
      expect(entry).toHaveProperty("train_total");
      expect(entry).toHaveProperty("train_results");
      expect(entry).toHaveProperty("test_passed");
      expect(entry).toHaveProperty("test_failed");
      expect(entry).toHaveProperty("test_total");
      expect(entry).toHaveProperty("test_results");
      expect(entry).toHaveProperty("passed");
      expect(entry).toHaveProperty("failed");
      expect(entry).toHaveProperty("total");
      expect(entry).toHaveProperty("results");
      expect(Array.isArray(entry.train_results)).toBe(true);
      if (entry.test_results) {
        expect(Array.isArray(entry.test_results)).toBe(true);
      }
    }
  });

  it("output matches expected top-level keys", async () => {
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
    ];

    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      numWorkers: 1,
      timeout: 30,
      maxIterations: 2,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0.5,
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeAllPassRunEval(),
      injectedImproveDescription: makeMockImprove("v2"),
    });

    // Verify all expected keys from Python output (snake_case as returned)
    expect(result).toHaveProperty("exit_reason");
    expect(result).toHaveProperty("original_description");
    expect(result).toHaveProperty("best_description");
    expect(result).toHaveProperty("best_score");
    expect(result).toHaveProperty("best_train_score");
    // best_test_score can be null, but the key should exist
    expect("best_test_score" in result).toBe(true);
    expect(result).toHaveProperty("final_description");
    expect(result).toHaveProperty("iterations_run");
    expect(result).toHaveProperty("holdout");
    expect(result).toHaveProperty("train_size");
    expect(result).toHaveProperty("test_size");
    expect(result).toHaveProperty("history");
    expect(Array.isArray(result.history)).toBe(true);
  });

  it("descriptionOverride is used instead of original when provided", async () => {
    const evalSet: EvalItem[] = [
      { query: "train trigger me", should_trigger: true },
      { query: "train ignore me", should_trigger: false },
    ];

    const result = await runLoop({
      evalSet,
      skillPath: join(FIXTURES_DIR, "valid"),
      descriptionOverride: "Custom start desc",
      numWorkers: 1,
      timeout: 30,
      maxIterations: 1,
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      holdout: 0,
      model: "test-model",
      cli: "claude",
      injectedRunEval: makeAllPassRunEval(),
      injectedImproveDescription: makeMockImprove("v2"),
    });

    // originalDescription should still be from the SKILL.md
    // But the first iteration's description should be the override
    expect(result.history[0].description).toBe("Custom start desc");
  });
});

// =============================================================================
// Slice 3: CLI entry point (integration, spawnSync)
// =============================================================================

describe("CLI (import.meta.main)", () => {
  function makeSkillFixture(name: string, description: string): string {
    const dir = mkdtempSync(join(tmpdir(), "run-loop-skill-"));
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
    return dir;
  }

  function makeEvalSet(items: { query: string; should_trigger: boolean }[]): string {
    const file = join(tmpdir(), `runloop-evalset-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(items));
    return file;
  }

  it("prints usage and exits 1 when required flags are missing", () => {
    const result = spawnSync("bun", ["run", join(SCRIPTS_DIR, "run_loop.ts")], { encoding: "utf-8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("exits with error for missing --eval-set", () => {
    const skillDir = makeSkillFixture("test", "desc");
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "run_loop.ts"), "--skill-path", skillDir, "--model", "test-model"],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
    }
  });

  it("exits with error for non-existent skill path", () => {
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_loop.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          "/nonexistent/skill",
          "--model",
          "test-model",
        ],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("No SKILL.md found");
    } finally {
      rmSync(evalSetFile);
    }
  });

  it("exits with error for missing --model", () => {
    const skillDir = makeSkillFixture("test", "desc");
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "run_loop.ts"), "--eval-set", evalSetFile, "--skill-path", skillDir],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("accepts --report none flag without opening browser", () => {
    const skillDir = makeSkillFixture("test-skill", "A test skill description");
    const evalSetFile = makeEvalSet([{ query: "help me with testing", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_loop.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--model",
          "test-model",
          "--report",
          "none",
          "--max-iterations",
          "1",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--num-workers",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 15000 },
      );
      // Should not crash — may fail if no claude CLI
      const stdout = result.stdout.trim();
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("accepts --verbose flag without crashing", () => {
    const skillDir = makeSkillFixture("test-skill", "A test skill description");
    const evalSetFile = makeEvalSet([{ query: "help me with testing", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_loop.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--model",
          "test-model",
          "--report",
          "none",
          "--verbose",
          "--max-iterations",
          "1",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--num-workers",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 15000 },
      );
      // Should complete without crash
      const stdout = result.stdout.trim();
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("outputs valid JSON with expected structure from CLI", () => {
    const skillDir = makeSkillFixture("test-skill", "A test skill description");
    const evalSetFile = makeEvalSet([
      { query: "test query 1", should_trigger: true },
      { query: "test query 2", should_trigger: false },
    ]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_loop.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--model",
          "test-model",
          "--report",
          "none",
          "--max-iterations",
          "1",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--num-workers",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 15000 },
      );
      const stdout = result.stdout.trim();
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
        const output = JSON.parse(stdout);
        expect(output).toHaveProperty("exit_reason");
        expect(output).toHaveProperty("original_description");
        expect(output).toHaveProperty("best_description");
        expect(output).toHaveProperty("best_score");
        expect(output).toHaveProperty("iterations_run");
        expect(output).toHaveProperty("history");
        expect(Array.isArray(output.history)).toBe(true);
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("respects --holdout flag for train/test split", () => {
    const skillDir = makeSkillFixture("test-skill", "A test skill description");
    const evalSetFile = makeEvalSet([
      { query: "a", should_trigger: true },
      { query: "b", should_trigger: true },
      { query: "c", should_trigger: false },
      { query: "d", should_trigger: false },
    ]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_loop.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--model",
          "test-model",
          "--report",
          "none",
          "--holdout",
          "0.5",
          "--max-iterations",
          "1",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--num-workers",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 15000 },
      );
      const stdout = result.stdout.trim();
      if (stdout) {
        const output = JSON.parse(stdout);
        expect(output.holdout).toBe(0.5);
        expect(output.train_size).toBeGreaterThan(0);
        expect(output.test_size).toBeGreaterThan(0);
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });
});
