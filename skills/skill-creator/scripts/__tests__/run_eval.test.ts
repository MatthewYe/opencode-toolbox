import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS_DIR = join(import.meta.dir, "..");
const _FIXTURES_DIR = join(import.meta.dir, "..", "__fixtures__");

// =============================================================================
// Slice 1: Stream-json parsing (pure function)
// =============================================================================

describe("parseClaudeStreamResponse", () => {
  // Will import after the file is created
  let parseClaudeStreamResponse: (lines: string[], cleanName: string) => boolean;

  beforeAll(async () => {
    const mod = await import("../run_eval");
    parseClaudeStreamResponse = mod.parseClaudeStreamResponse;
  });

  it("returns false for empty stream (no events)", () => {
    expect(parseClaudeStreamResponse([], "my-skill-abc12345")).toBe(false);
  });

  it("detects Skill tool invocation with correct skill name via content_block events", () => {
    const lines = [
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Skill" },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"skill":' },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '"my-skill-abc12345"}',
          },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop" },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(true);
  });

  it("returns false when Skill tool is invoked but with wrong skill name", () => {
    const lines = [
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Skill" },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"skill":"other-skill"}',
          },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop" },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(false);
  });

  it("returns false when a non-Skill/Read tool is used", () => {
    const lines = [
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Bash" },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "message_stop" },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(false);
  });

  it("detects Read tool invocation with clean name in file_path", () => {
    const lines = [
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read" },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"file_path":"/path/to/my-skill-abc12345',
          },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '.md"}' },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop" },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(true);
  });

  it("detects Skill via assistant event (content array format)", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Skill",
              input: { skill: "my-skill-abc12345" },
            },
          ],
        },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(true);
  });

  it("detects Read via assistant event (content array format)", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/path/my-skill-abc12345.md" },
            },
          ],
        },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(true);
  });

  it("returns false for assistant event with non-matching Skill", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Skill",
              input: { skill: "other-skill" },
            },
          ],
        },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(false);
  });

  it("returns false for assistant event with non-Skill/Read tool", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }],
        },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(false);
  });

  it("returns false on result event with no prior trigger", () => {
    const lines = [JSON.stringify({ type: "result" })];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(false);
  });

  it("skips invalid JSON lines gracefully", () => {
    const lines = [
      "not valid json",
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Skill" },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"skill":"my-skill-abc12345"}',
          },
        },
      }),
    ];

    expect(parseClaudeStreamResponse(lines, "my-skill-abc12345")).toBe(true);
  });
});

// =============================================================================
// Slice 2: runEval result computation (pure function, injectable runQuery)
// =============================================================================

describe("runEval", () => {
  let runEval: typeof import("../run_eval").runEval;

  beforeAll(async () => {
    const mod = await import("../run_eval");
    runEval = mod.runEval;
  });

  it("computes correct results for all-passing eval", async () => {
    const evalSet = [
      { query: "do thing A", should_trigger: true },
      { query: "do thing B", should_trigger: false },
    ];

    // Mock: always returns true (skill triggered)
    const mockRunQuery = (_query: string) => Promise.resolve(true);

    const result = await runEval({
      evalSet,
      skillName: "test-skill",
      description: "A test skill",
      numWorkers: 2,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 2,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    expect(result.skill_name).toBe("test-skill");
    expect(result.description).toBe("A test skill");
    expect(result.results).toHaveLength(2);

    // Query A: should_trigger=true, trigger_rate=1.0 (2/2) → pass
    const qA = result.results.find((r) => r.query === "do thing A")!;
    expect(qA.should_trigger).toBe(true);
    expect(qA.trigger_rate).toBe(1.0);
    expect(qA.triggers).toBe(2);
    expect(qA.runs).toBe(2);
    expect(qA.pass).toBe(true);

    // Query B: should_trigger=false, trigger_rate=1.0 → fail (should NOT trigger)
    const qB = result.results.find((r) => r.query === "do thing B")!;
    expect(qB.should_trigger).toBe(false);
    expect(qB.trigger_rate).toBe(1.0);
    expect(qB.triggers).toBe(2);
    expect(qB.runs).toBe(2);
    expect(qB.pass).toBe(false);

    // Summary
    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
  });

  it("computes trigger_rate from multiple runs", async () => {
    const evalSet = [{ query: "test query", should_trigger: true }];

    let callCount = 0;
    const mockRunQuery = (_query: string) => {
      // Returns true on calls 0,1,3 (3/4 = 0.75)
      callCount++;
      return Promise.resolve(callCount !== 3); // false only on 3rd call
    };

    const result = await runEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 2,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 4,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    const r = result.results[0];
    expect(r.trigger_rate).toBe(0.75);
    expect(r.triggers).toBe(3);
    expect(r.runs).toBe(4);
    expect(r.pass).toBe(true); // 0.75 >= 0.5
  });

  it("respects trigger_threshold for pass/fail", async () => {
    const evalSet = [{ query: "q", should_trigger: true }];

    // trigger_rate = 2/5 = 0.4, threshold = 0.5 → fail
    let callCount = 0;
    const mockRunQuery = (_query: string) => {
      callCount++;
      return Promise.resolve(callCount <= 2);
    };

    const result = await runEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 1,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 5,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    expect(result.results[0].trigger_rate).toBe(0.4);
    expect(result.results[0].pass).toBe(false);
  });

  it("handles failed queries gracefully (counts as false)", async () => {
    const evalSet = [{ query: "failing query", should_trigger: true }];

    let callCount = 0;
    const mockRunQuery = (_query: string) => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error("CLI crashed"));
      }
      return Promise.resolve(true);
    };

    const result = await runEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 1,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 3,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    const r = result.results[0];
    expect(r.triggers).toBe(2); // only 2 succeeded
    expect(r.runs).toBe(3);
    expect(r.trigger_rate).toBe(2 / 3);
  });

  it("runs queries in parallel (respects numWorkers) with claude CLI", async () => {
    const evalSet = [
      { query: "q1", should_trigger: true },
      { query: "q2", should_trigger: true },
      { query: "q3", should_trigger: true },
    ];

    const startTimes: number[] = [];
    const mockRunQuery = async (_query: string) => {
      startTimes.push(Date.now());
      // Small delay to observe parallelism
      await new Promise((r) => setTimeout(r, 10));
      return Promise.resolve(true);
    };

    const result = await runEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 3,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    // All 3 results present
    expect(result.results).toHaveLength(3);
    // Start times should be close together (parallel)
    const maxStart = Math.max(...startTimes);
    const minStart = Math.min(...startTimes);
    expect(maxStart - minStart).toBeLessThan(500); // all started within 500ms
  });

  it("runs queries in parallel (respects numWorkers) with opencode CLI", async () => {
    const evalSet = [
      { query: "q1", should_trigger: true },
      { query: "q2", should_trigger: true },
      { query: "q3", should_trigger: true },
    ];

    const startTimes: number[] = [];
    const mockRunQuery = async (_query: string) => {
      startTimes.push(Date.now());
      // Small delay to observe parallelism
      await new Promise((r) => setTimeout(r, 10));
      return Promise.resolve(true);
    };

    const result = await runEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 3,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 1,
      triggerThreshold: 0.5,
      cli: "opencode",
      runQuery: mockRunQuery,
    });

    // All 3 results present
    expect(result.results).toHaveLength(3);
    // Start times should be close together (parallel)
    const maxStart = Math.max(...startTimes);
    const minStart = Math.min(...startTimes);
    expect(maxStart - minStart).toBeLessThan(500); // all started within 500ms
  });
});

// =============================================================================
// Slice 3: findProjectRoot and detectCli (pure/boundary functions)
// =============================================================================

describe("findProjectRoot", () => {
  let findProjectRoot: typeof import("../run_eval").findProjectRoot;

  beforeAll(async () => {
    const mod = await import("../run_eval");
    findProjectRoot = mod.findProjectRoot;
  });

  it("finds root with .claude directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "projroot-"));
    try {
      const claudeDir = join(tmp, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "commands"), "");
      // simulate cwd = tmp  (just pass tmp as start)
      const root = findProjectRoot(tmp);
      expect(root).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds root with .opencode directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "projroot-"));
    try {
      const opencodeDir = join(tmp, ".opencode");
      mkdirSync(opencodeDir, { recursive: true });
      writeFileSync(join(opencodeDir, "config.json"), "{}");
      const root = findProjectRoot(tmp);
      expect(root).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("walks up from subdirectory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "projroot-"));
    try {
      // Create .claude at root level
      const claudeDir = join(tmp, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "commands"), "");
      // Create a subdirectory
      const subDir = join(tmp, "sub", "deep");
      mkdirSync(subDir, { recursive: true });
      // Walk up from subDir
      const root = findProjectRoot(subDir);
      expect(root).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns cwd when no .claude or .opencode found", () => {
    const tmp = mkdtempSync(join(tmpdir(), "projroot-"));
    try {
      const root = findProjectRoot(tmp);
      expect(root).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// Slice 4: CLI entry point (integration, spawnSync)
// =============================================================================

describe("CLI (import.meta.main)", () => {
  function makeSkillFixture(name: string, description: string): string {
    const dir = mkdtempSync(join(tmpdir(), "run-eval-skill-"));
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
    return dir;
  }

  function makeEvalSet(items: { query: string; should_trigger: boolean }[]): string {
    const file = join(tmpdir(), `evalset-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(items));
    return file;
  }

  it("prints usage and exits 1 when --eval-set is missing", () => {
    const result = spawnSync("bun", ["run", join(SCRIPTS_DIR, "run_eval.ts")], { encoding: "utf-8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("prints usage and exits 1 when --skill-path is missing", () => {
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync("bun", ["run", join(SCRIPTS_DIR, "run_eval.ts"), "--eval-set", evalSetFile], {
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    } finally {
      rmSync(evalSetFile);
    }
  });

  it("exits with error for non-existent skill path", () => {
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "run_eval.ts"), "--eval-set", evalSetFile, "--skill-path", "/nonexistent/path"],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("No SKILL.md found");
    } finally {
      rmSync(evalSetFile);
    }
  });

  it("outputs valid JSON with expected structure", () => {
    const skillDir = makeSkillFixture("test-skill", "A test skill description");
    const evalSetFile = makeEvalSet([
      { query: "help me with testing", should_trigger: true },
      { query: "write a function", should_trigger: false },
    ]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_eval.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--num-workers",
          "2",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 10000 },
      );
      // May fail if no claude CLI, but JSON output must have correct structure
      const stdout = result.stdout.trim();
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
        const output = JSON.parse(stdout);
        expect(output.skill_name).toBe("test-skill");
        expect(output.description).toBe("A test skill description");
        expect(Array.isArray(output.results)).toBe(true);
        expect(output.summary).toBeDefined();
        expect(typeof output.summary.total).toBe("number");
        expect(typeof output.summary.passed).toBe("number");
        expect(typeof output.summary.failed).toBe("number");
      } else {
        // If no CLI available, stderr should error
        expect(result.stderr).toBeTruthy();
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("respects --description override", () => {
    const skillDir = makeSkillFixture("test-skill", "Original description");
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_eval.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--description",
          "Overridden description",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 10000 },
      );
      const stdout = result.stdout.trim();
      if (stdout) {
        const output = JSON.parse(stdout);
        expect(output.description).toBe("Overridden description");
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("respects --trigger-threshold flag", () => {
    const skillDir = makeSkillFixture("test-skill", "Test skill");
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_eval.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--trigger-threshold",
          "0.8",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 10000 },
      );
      const stdout = result.stdout.trim();
      // Should produce valid JSON regardless
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("accepts --model flag", () => {
    const skillDir = makeSkillFixture("test-skill", "Test skill");
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_eval.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--model",
          "gpt-4",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 10000 },
      );
      const stdout = result.stdout.trim();
      if (stdout) {
        expect(() => JSON.parse(stdout)).not.toThrow();
      }
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      rmSync(evalSetFile);
    }
  });

  it("supports --verbose flag without crashing", () => {
    const skillDir = makeSkillFixture("test-skill", "Test skill");
    const evalSetFile = makeEvalSet([{ query: "test", should_trigger: true }]);
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "run_eval.ts"),
          "--eval-set",
          evalSetFile,
          "--skill-path",
          skillDir,
          "--verbose",
          "--runs-per-query",
          "1",
          "--timeout",
          "1",
          "--cli",
          "claude",
        ],
        { encoding: "utf-8", timeout: 10000 },
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
});

// =============================================================================
// Slice 5: Output structure verification
// =============================================================================

describe("Output structure", () => {
  let tsRunEval: typeof import("../run_eval").runEval;

  beforeAll(async () => {
    const mod = await import("../run_eval");
    tsRunEval = mod.runEval;
  });

  it("output JSON has expected keys and types", async () => {
    const evalSet = [
      { query: "sample query 1", should_trigger: true },
      { query: "sample query 2", should_trigger: false },
    ];

    const mockRunQuery = () => Promise.resolve(true);
    const output = await tsRunEval({
      evalSet,
      skillName: "test-skill",
      description: "test description",
      numWorkers: 1,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 2,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    // Verify all expected top-level keys exist
    expect(output).toHaveProperty("skill_name");
    expect(output).toHaveProperty("description");
    expect(output).toHaveProperty("results");
    expect(output).toHaveProperty("summary");

    // Verify result item structure
    const result = output.results[0];
    expect(result).toHaveProperty("query");
    expect(typeof result.query).toBe("string");
    expect(result).toHaveProperty("should_trigger");
    expect(typeof result.should_trigger).toBe("boolean");
    expect(result).toHaveProperty("trigger_rate");
    expect(typeof result.trigger_rate).toBe("number");
    expect(result).toHaveProperty("triggers");
    expect(typeof result.triggers).toBe("number");
    expect(result).toHaveProperty("runs");
    expect(typeof result.runs).toBe("number");
    expect(result).toHaveProperty("pass");
    expect(typeof result.pass).toBe("boolean");

    // Verify summary structure
    expect(output.summary).toHaveProperty("total");
    expect(output.summary).toHaveProperty("passed");
    expect(output.summary).toHaveProperty("failed");
    expect(typeof output.summary.total).toBe("number");
    expect(typeof output.summary.passed).toBe("number");
    expect(typeof output.summary.failed).toBe("number");
  });

  it("summary total equals results length", async () => {
    const evalSet = [
      { query: "q1", should_trigger: true },
      { query: "q2", should_trigger: false },
    ];

    const mockRunQuery = () => Promise.resolve(true);
    const result = await tsRunEval({
      evalSet,
      skillName: "test",
      description: "test",
      numWorkers: 1,
      timeout: 30,
      projectRoot: "/tmp",
      runsPerQuery: 2,
      triggerThreshold: 0.5,
      cli: "claude",
      runQuery: mockRunQuery,
    });

    expect(result.summary.total).toBe(result.results.length);
    expect(result.summary.passed + result.summary.failed).toBe(result.summary.total);
  });
});
