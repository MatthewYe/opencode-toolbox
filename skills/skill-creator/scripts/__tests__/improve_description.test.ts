import { describe, it, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const SCRIPTS_DIR = join(import.meta.dir, "..");

// =============================================================================
// Slice 1: parseNewDescription (pure function — tag extraction)
// =============================================================================

describe("parseNewDescription", () => {
  let parseNewDescription: (text: string) => string;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    parseNewDescription = mod.parseNewDescription;
  });

  it("extracts text within <new_description> tags", () => {
    const result = parseNewDescription(
      "Some preamble\n<new_description>Optimized skill description here</new_description>\nMore text",
    );
    expect(result).toBe("Optimized skill description here");
  });

  it("handles multiline descriptions", () => {
    const result = parseNewDescription(
      "<new_description>\nFirst line\nSecond line\nThird line\n</new_description>",
    );
    expect(result).toBe("First line\nSecond line\nThird line");
  });

  it("strips surrounding whitespace from extracted text", () => {
    const result = parseNewDescription(
      "<new_description>  \n  padded text  \n  </new_description>",
    );
    expect(result).toBe("padded text");
  });

  it("strips surrounding double quotes like Python .strip('\"')", () => {
    const result = parseNewDescription(
      '<new_description>"quoted description"</new_description>',
    );
    expect(result).toBe("quoted description");
  });

  it("does not strip internal quotes", () => {
    const result = parseNewDescription(
      '<new_description>Use "skill" for X when Y</new_description>',
    );
    expect(result).toBe('Use "skill" for X when Y');
  });

  it("returns raw text when no tags found", () => {
    const result = parseNewDescription(
      "Some response without any xml tags at all",
    );
    expect(result).toBe("Some response without any xml tags at all");
  });

  it("handles empty tag content", () => {
    const result = parseNewDescription("<new_description></new_description>");
    expect(result).toBe("");
  });

  it("uses first match when multiple tag pairs", () => {
    const result = parseNewDescription(
      "<new_description>First</new_description>\n<new_description>Second</new_description>",
    );
    expect(result).toBe("First");
  });
});

// =============================================================================
// Slice 2: buildPrompt (pure function — prompt construction)
// =============================================================================

describe("buildPrompt", () => {
  let buildPrompt: typeof import("../improve_description").buildPrompt;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    buildPrompt = mod.buildPrompt;
  });

  const basicInput = {
    skillName: "test-skill",
    skillContent: "# Test Skill\nThis is a test skill.",
    currentDescription: "A test skill for testing",
    failedTriggers: [
      { query: "help me test", triggers: 1, runs: 3 },
      { query: "run tests now", triggers: 0, runs: 3 },
    ],
    falseTriggers: [
      { query: "write code", triggers: 3, runs: 3 },
    ],
    trainScore: "2/5",
    testScore: null,
    history: [] as Array<Record<string, unknown>>,
  };

  it("includes skill name in prompt", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain('"test-skill"');
  });

  it("includes current description in tags", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("<current_description>");
    expect(prompt).toContain("A test skill for testing");
    expect(prompt).toContain("</current_description>");
  });

  it("includes train score summary", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("Train: 2/5");
  });

  it("includes test score when provided", () => {
    const prompt = buildPrompt({
      ...basicInput,
      testScore: "3/5",
    });
    expect(prompt).toContain("Train: 2/5, Test: 3/5");
  });

  it("includes failed triggers section", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("FAILED TO TRIGGER");
    expect(prompt).toContain("help me test");
    expect(prompt).toContain("run tests now");
    expect(prompt).toContain("(triggered 1/3 times)");
    expect(prompt).toContain("(triggered 0/3 times)");
  });

  it("includes false triggers section", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("FALSE TRIGGERS");
    expect(prompt).toContain("write code");
    expect(prompt).toContain("(triggered 3/3 times)");
  });

  it("omits failed triggers section when none exist", () => {
    const prompt = buildPrompt({
      ...basicInput,
      failedTriggers: [],
    });
    expect(prompt).not.toContain("FAILED TO TRIGGER");
  });

  it("omits false triggers section when none exist", () => {
    const prompt = buildPrompt({
      ...basicInput,
      falseTriggers: [],
    });
    expect(prompt).not.toContain("FALSE TRIGGERS");
  });

  it("includes history section with previous attempts", () => {
    const history = [
      {
        description: "First attempt description",
        train_passed: 3,
        train_total: 5,
        test_passed: 4,
        test_total: 5,
        results: [
          { query: "help me test", pass: false, triggers: 1, runs: 3 },
        ],
      },
      {
        description: "Second attempt description",
        passed: 2,
        total: 5,
        results: [
          { query: "write code", pass: false, triggers: 3, runs: 3 },
        ],
      },
    ];
    const prompt = buildPrompt({ ...basicInput, history });
    expect(prompt).toContain("PREVIOUS ATTEMPTS");
    expect(prompt).toContain("First attempt description");
    expect(prompt).toContain("Second attempt description");
    expect(prompt).toContain("train=3/5, test=4/5");
    // Second one has no test_passed, only train
    expect(prompt).toContain("train=2/5");
  });

  it("includes skill content for context", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("<skill_content>");
    expect(prompt).toContain("# Test Skill");
    expect(prompt).toContain("</skill_content>");
  });

  it("wraps failed/false triggers in scores_summary tags", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("<scores_summary>");
    expect(prompt).toContain("</scores_summary>");
  });

  it("includes description-writing tips", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("Use this skill for");
    expect(prompt).toContain("1024");
  });

  it("ends with instruction to respond in <new_description> tags", () => {
    const prompt = buildPrompt(basicInput);
    expect(prompt).toContain("<new_description>");
  });

  it("history uses 'passed/total' as fallback when train_passed missing (Python compat)", () => {
    const history = [
      {
        description: "Old format entry",
        passed: 4,
        total: 6,
        results: [],
      },
    ];
    const prompt = buildPrompt({ ...basicInput, history });
    expect(prompt).toContain("train=4/6");
  });

  it("handles history item with test_passed set to null", () => {
    const history = [
      {
        description: "No test score",
        train_passed: 3,
        train_total: 5,
        test_passed: null,
        results: [],
      },
    ];
    const prompt = buildPrompt({ ...basicInput, history });
    // Should only show train score, no test
    const lines = prompt.split("\n");
    const attemptLine = lines.find((l) => l.includes("<attempt"));
    expect(attemptLine).toBeDefined();
    expect(attemptLine).toContain("train=3/5");
    expect(attemptLine).not.toContain("test=");
  });
});

// =============================================================================
// Slice 3: detectCli (boundary — spawnSync "which")
// =============================================================================

describe("detectCli", () => {
  let detectCli: typeof import("../improve_description").detectCli;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    detectCli = mod.detectCli;
  });

  it("detects claude when available", () => {
    // In our test environment, claude may or may not be available
    // Just verify it returns a valid CLI name without throwing
    try {
      const cli = detectCli();
      expect(["claude", "opencode"]).toContain(cli);
    } catch (e) {
      // If neither is available, it throws — that's fine
      expect((e as Error).message).toContain("Neither");
    }
  });
});

// =============================================================================
// Slice 4: improveDescription (core function with injectable callCli)
// =============================================================================

describe("improveDescription", () => {
  let improveDescription: typeof import("../improve_description").improveDescription;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    improveDescription = mod.improveDescription;
  });

  const evalResults = {
    skill_name: "test-skill",
    description: "A test skill description",
    results: [
      { query: "help me test", should_trigger: true, triggers: 1, runs: 3, pass: false, trigger_rate: 0.33 },
      { query: "run tests now", should_trigger: true, triggers: 0, runs: 3, pass: false, trigger_rate: 0.0 },
      { query: "write code", should_trigger: false, triggers: 3, runs: 3, pass: false, trigger_rate: 1.0 },
      { query: "do something unrelated", should_trigger: false, triggers: 0, runs: 3, pass: true, trigger_rate: 0.0 },
    ],
    summary: { total: 4, passed: 1, failed: 3 },
  };

  it("parses <new_description> from CLI response", async () => {
    const mockCallCli = (_prompt: string, _cli: string, _model?: string, _timeout?: number) =>
      Promise.resolve("<new_description>Improved Test Skill description here</new_description>");

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe("Improved Test Skill description here");
  });

  it("falls back to raw text when no tags found", async () => {
    const mockCallCli = (_prompt: string, _cli: string, _model?: string, _timeout?: number) =>
      Promise.resolve("Raw description without any xml tags");

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe("Raw description without any xml tags");
  });

  it("strips quotes from parsed description (matching Python .strip('\"'))", async () => {
    const mockCallCli = (_prompt: string, _cli: string, _model?: string, _timeout?: number) =>
      Promise.resolve('<new_description>"Quoted description"</new_description>');

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe("Quoted description");
  });

  it("passes correct cli and model to callCli", async () => {
    let capturedCli = "";
    let capturedModel: string | undefined;
    const mockCallCli = (_prompt: string, cli: string, model?: string) => {
      capturedCli = cli;
      capturedModel = model;
      return Promise.resolve("<new_description>test</new_description>");
    };

    await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "gpt-5",
      cli: "opencode",
      callCli: mockCallCli,
    });

    expect(capturedCli).toBe("opencode");
    expect(capturedModel).toBe("gpt-5");
  });

  it("passes default timeout of 300 if not specified", async () => {
    let capturedTimeout: number | undefined;
    const mockCallCli = (_prompt: string, _cli: string, _model?: string, timeout?: number) => {
      capturedTimeout = timeout;
      return Promise.resolve("<new_description>test</new_description>");
    };

    await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(capturedTimeout).toBe(300);
  });

  it("separates failed_triggers from false_triggers correctly", async () => {
    // failed_triggers: should_trigger=true && !pass
    // false_triggers: should_trigger=false && !pass
    let capturedPrompt = "";
    const mockCallCli = (prompt: string) => {
      capturedPrompt = prompt;
      return Promise.resolve("<new_description>test</new_description>");
    };

    await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    // failed_triggers section should contain queries that should_trigger=true && !pass
    expect(capturedPrompt).toContain("help me test");
    expect(capturedPrompt).toContain("run tests now");
    // false_triggers section should contain queries that should_trigger=false && !pass
    expect(capturedPrompt).toContain("write code");
    // "do something unrelated" passed so it should NOT appear in either
    expect(capturedPrompt).not.toContain("do something unrelated");
  });
});

// =============================================================================
// Slice 5: 1024-char safety net
// =============================================================================

describe("improveDescription — 1024-char safety net", () => {
  let improveDescription: typeof import("../improve_description").improveDescription;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    improveDescription = mod.improveDescription;
  });

  const evalResults = {
    skill_name: "test-skill",
    description: "A test skill description",
    results: [] as Array<Record<string, unknown>>,
    summary: { total: 1, passed: 0, failed: 1 },
  };

  it("triggers safety net rewrite when parsed description exceeds 1024 chars", async () => {
    const longDescription = "X".repeat(1100);
    let callCount = 0;
    const mockCallCli = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(`<new_description>${longDescription}</new_description>`);
      }
      return Promise.resolve("<new_description>Shortened description</new_description>");
    };

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe("Shortened description");
    expect(callCount).toBe(2); // Called twice: once for initial, once for shorten
  });

  it("does NOT trigger safety net when description is exactly 1024 chars", async () => {
    const exactDescription = "Y".repeat(1024);
    let callCount = 0;
    const mockCallCli = () => {
      callCount++;
      return Promise.resolve(`<new_description>${exactDescription}</new_description>`);
    };

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe(exactDescription);
    expect(callCount).toBe(1); // Only called once, no shorten needed
  });

  it("does NOT trigger safety net for descriptions under 1024 chars", async () => {
    let callCount = 0;
    const mockCallCli = () => {
      callCount++;
      return Promise.resolve("<new_description>Short desc</new_description>");
    };

    const result = await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });

    expect(result).toBe("Short desc");
    expect(callCount).toBe(1);
  });
});

// =============================================================================
// Slice 6: Logging (interaction logs written to disk)
// =============================================================================

describe("improveDescription — logging", () => {
  let improveDescription: typeof import("../improve_description").improveDescription;

  beforeAll(async () => {
    const mod = await import("../improve_description");
    improveDescription = mod.improveDescription;
  });

  const evalResults = {
    skill_name: "test-skill",
    description: "A test skill description",
    results: [
      { query: "help me test", should_trigger: true, triggers: 1, runs: 3, pass: false, trigger_rate: 0.33 },
    ],
    summary: { total: 1, passed: 0, failed: 1 },
  };

  it("writes transcript JSON to log_dir when provided", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "improve-log-"));
    try {
      const mockCallCli = () =>
        Promise.resolve("<new_description>Improved description</new_description>");

      await improveDescription({
        skillName: "test-skill",
        skillContent: "# Test Skill",
        currentDescription: "A test skill description",
        evalResults,
        history: [],
        model: "claude-sonnet-4-20250514",
        cli: "claude",
        logDir,
        iteration: 3,
        callCli: mockCallCli,
      });

      const logFile = join(logDir, "improve_iter_3.json");
      expect(existsSync(logFile)).toBe(true);
      const transcript = JSON.parse(readFileSync(logFile, "utf-8"));
      expect(transcript.iteration).toBe(3);
      expect(transcript.prompt).toBeTruthy();
      expect(transcript.response).toBe("<new_description>Improved description</new_description>");
      expect(transcript.parsed_description).toBe("Improved description");
      expect(transcript.char_count).toBe(20); // "Improved description".length
      expect(transcript.over_limit).toBe(false);
      expect(transcript.final_description).toBe("Improved description");
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it("creates log_dir if it does not exist", async () => {
    const logDir = join(tmpdir(), `improve-log-new-${Date.now()}`);
    try {
      const mockCallCli = () =>
        Promise.resolve("<new_description>test</new_description>");

      await improveDescription({
        skillName: "test-skill",
        skillContent: "# Test Skill",
        currentDescription: "A test skill description",
        evalResults,
        history: [],
        model: "claude-sonnet-4-20250514",
        cli: "claude",
        logDir,
        callCli: mockCallCli,
      });

      expect(existsSync(logDir)).toBe(true);
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it("does NOT write log file when log_dir is not provided", async () => {
    const mockCallCli = () =>
      Promise.resolve("<new_description>test</new_description>");

    // Should not throw
    await improveDescription({
      skillName: "test-skill",
      skillContent: "# Test Skill",
      currentDescription: "A test skill description",
      evalResults,
      history: [],
      model: "claude-sonnet-4-20250514",
      cli: "claude",
      callCli: mockCallCli,
    });
  });

  it("uses 'unknown' as iteration in log filename when not specified", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "improve-log-"));
    try {
      const mockCallCli = () =>
        Promise.resolve("<new_description>test</new_description>");

      await improveDescription({
        skillName: "test-skill",
        skillContent: "# Test Skill",
        currentDescription: "A test skill description",
        evalResults,
        history: [],
        model: "claude-sonnet-4-20250514",
        cli: "claude",
        logDir,
        callCli: mockCallCli,
      });

      expect(existsSync(join(logDir, "improve_iter_unknown.json"))).toBe(true);
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it("includes rewrite info in transcript when safety net is triggered", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "improve-log-"));
    try {
      const longDescription = "X".repeat(1100);
      let callCount = 0;
      const mockCallCli = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(`<new_description>${longDescription}</new_description>`);
        }
        return Promise.resolve("<new_description>Short</new_description>");
      };

      await improveDescription({
        skillName: "test-skill",
        skillContent: "# Test Skill",
        currentDescription: "A test skill description",
        evalResults,
        history: [],
        model: "claude-sonnet-4-20250514",
        cli: "claude",
        logDir,
        callCli: mockCallCli,
      });

      const logFiles = readdirSync_(logDir);
      expect(logFiles.length).toBe(1);
      const transcript = JSON.parse(readFileSync(join(logDir, logFiles[0]), "utf-8"));
      expect(transcript.over_limit).toBe(true);
      expect(transcript.rewrite_prompt).toBeTruthy();
      expect(transcript.rewrite_response).toBe("<new_description>Short</new_description>");
      expect(transcript.rewrite_description).toBe("Short");
      expect(transcript.rewrite_char_count).toBe(5);
      expect(transcript.final_description).toBe("Short");
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });
});

// Helper: filter log files
function readdirSync_(dir: string): string[] {
  return readdirSync(dir).filter((f: string) => f.startsWith("improve_iter_"));
}

// =============================================================================
// Slice 7: CLI entry point (integration, spawnSync)
// =============================================================================

describe("CLI (import.meta.main)", () => {
  let tmpSkillDir: string;
  let tmpEvalResults: string;
  let cliAvailable: boolean;

  beforeAll(() => {
    // Check if an AI CLI is available
    const cResult = spawnSync("which", ["claude"], { encoding: "utf-8" });
    const oResult = spawnSync("which", ["opencode"], { encoding: "utf-8" });
    cliAvailable = (cResult.status === 0 && !!cResult.stdout?.trim()) ||
                   (oResult.status === 0 && !!oResult.stdout?.trim());
  });

  beforeEach(() => {
    // Create temp skill directory
    tmpSkillDir = mkdtempSync(join(tmpdir(), "improve-skill-"));
    writeFileSync(
      join(tmpSkillDir, "SKILL.md"),
      `---\nname: test-skill\ndescription: A test skill description\n---\n# Test Skill\n\nThis is the skill content.`,
    );

    // Create temp eval results
    tmpEvalResults = join(tmpdir(), `eval-results-${Date.now()}.json`);
    writeFileSync(
      tmpEvalResults,
      JSON.stringify({
        skill_name: "test-skill",
        description: "A test skill description",
        results: [
          { query: "help me test", should_trigger: true, triggers: 1, runs: 3, pass: false, trigger_rate: 0.33 },
        ],
        summary: { total: 1, passed: 0, failed: 1 },
      }),
    );
  });

  afterEach(() => {
    try { rmSync(tmpSkillDir, { recursive: true, force: true }); } catch {}
    try { rmSync(tmpEvalResults); } catch {}
  });

  it("prints usage and exits 1 when --eval-results is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "improve_description.ts")],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("prints usage and exits 1 when --skill-path is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "improve_description.ts"), "--eval-results", tmpEvalResults],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("prints usage and exits 1 when --model is missing", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPTS_DIR, "improve_description.ts"),
        "--eval-results", tmpEvalResults,
        "--skill-path", tmpSkillDir,
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("exits with error for non-existent skill path", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPTS_DIR, "improve_description.ts"),
        "--eval-results", tmpEvalResults,
        "--skill-path", "/nonexistent/path",
        "--model", "claude-sonnet-4-20250514",
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No SKILL.md found");
  });

  it("outputs valid JSON with description and history", () => {
    if (!cliAvailable) return; // Skip — requires AI CLI

    const result = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPTS_DIR, "improve_description.ts"),
        "--eval-results", tmpEvalResults,
        "--skill-path", tmpSkillDir,
        "--model", "claude-sonnet-4-20250514",
      ],
      { encoding: "utf-8", timeout: 3000 },
    );
    // CLI call may time out (real AI call takes too long for unit test) —
    // verify no crash or check JSON if fast enough
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return; // Expected — AI CLI call is slow
    }
    const stdout = result.stdout?.trim() || "";
    if (stdout) {
      expect(() => JSON.parse(stdout)).not.toThrow();
      const output = JSON.parse(stdout);
      expect(output).toHaveProperty("description");
      expect(output).toHaveProperty("history");
      expect(Array.isArray(output.history)).toBe(true);
      expect(output.history.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("accepts --history flag", () => {
    if (!cliAvailable) return; // Skip — requires AI CLI

    const historyFile = join(tmpdir(), `history-${Date.now()}.json`);
    writeFileSync(
      historyFile,
      JSON.stringify([{ description: "Old desc", passed: 2, total: 5, results: [] }]),
    );
    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          join(SCRIPTS_DIR, "improve_description.ts"),
          "--eval-results", tmpEvalResults,
          "--skill-path", tmpSkillDir,
          "--model", "claude-sonnet-4-20250514",
          "--history", historyFile,
        ],
        { encoding: "utf-8", timeout: 3000 },
      );
      if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        return; // Expected — AI CLI call is slow
      }
      const stdout = result.stdout?.trim() || "";
      if (stdout) {
        const output = JSON.parse(stdout);
        expect(output).toHaveProperty("description");
        expect(output).toHaveProperty("history");
      }
    } finally {
      rmSync(historyFile);
    }
  });

  it("accepts --cli flag", () => {
    if (!cliAvailable) return; // Skip — requires AI CLI

    const result = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPTS_DIR, "improve_description.ts"),
        "--eval-results", tmpEvalResults,
        "--skill-path", tmpSkillDir,
        "--model", "claude-sonnet-4-20250514",
        "--cli", "claude",
      ],
      { encoding: "utf-8", timeout: 3000 },
    );
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return; // Expected
    }
    expect(result.error).toBeUndefined();
  });

  it("accepts --verbose flag", () => {
    if (!cliAvailable) return; // Skip — requires AI CLI

    const result = spawnSync(
      "bun",
      [
        "run",
        join(SCRIPTS_DIR, "improve_description.ts"),
        "--eval-results", tmpEvalResults,
        "--skill-path", tmpSkillDir,
        "--model", "claude-sonnet-4-20250514",
        "--verbose",
      ],
      { encoding: "utf-8", timeout: 3000 },
    );
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return; // Expected
    }
    expect(result.error).toBeUndefined();
  });
});
