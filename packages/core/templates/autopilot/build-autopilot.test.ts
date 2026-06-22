import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

const TEMPLATES_DIR = import.meta.dir;
const MANIFEST_PATH = join(TEMPLATES_DIR, "manifest.json");
const PROJECT_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const OPENCODE_OUT = join(PROJECT_ROOT, "packages", "opencode", "commands", "autopilot.md");
const CODEX_OUT = join(PROJECT_ROOT, "packages", "codex", "skills", "autopilot", "SKILL.md");
const GOLDEN_DIR = join(TEMPLATES_DIR, "__golden__");

// Ensure output directories exist
function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

beforeAll(() => {
  ensureDir(join(OPENCODE_OUT, ".."));
  ensureDir(join(CODEX_OUT, ".."));
  ensureDir(GOLDEN_DIR);
});

describe("build-autopilot", () => {
  it("should successfully build opencode output from manifest", async () => {
    // Run the build
    const proc = Bun.spawnSync(["bun", "run", "build:templates"], { cwd: PROJECT_ROOT });
    expect(proc.exitCode).toBe(0);

    // Output files should exist
    expect(existsSync(OPENCODE_OUT)).toBe(true);
    expect(existsSync(CODEX_OUT)).toBe(true);

    // Output files should be non-empty
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const codexContent = readFileSync(CODEX_OUT, "utf-8");
    expect(opencodeContent.length).toBeGreaterThan(1000);
    expect(codexContent.length).toBeGreaterThan(1000);
  });

  it("should produce output containing key autopilot sections", () => {
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const codexContent = readFileSync(CODEX_OUT, "utf-8");

    // Both should contain the Phase 1 dispatch loop concept
    expect(opencodeContent).toContain("Phase 1");
    expect(codexContent).toContain("Phase 1");

    // Both should contain implementer dispatch template
    expect(opencodeContent).toContain("Implementer Dispatch Template");
    expect(codexContent).toContain("Implementer Dispatch Template");

    // Both should contain reviewer dispatch template
    expect(opencodeContent).toContain("Reviewer Dispatch Template");
    expect(codexContent).toContain("Reviewer Dispatch Template");

    // Both should contain meta-reviewer template
    expect(opencodeContent).toContain("Meta-Reviewer Template");
    expect(codexContent).toContain("Meta-Reviewer Template");
  });

  it("should have platform-specific tool syntax in correct files", () => {
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const codexContent = readFileSync(CODEX_OUT, "utf-8");

    // OpenCode-specific: uses "task" tool and "subagent_type"
    expect(opencodeContent).toContain("subagent_type");

    // Codex-specific: uses "spawn_agent" and "exec_command"
    expect(codexContent).toContain("spawn_agent");
    expect(codexContent).toContain("mcp__github__");

    // Neither should mix platform tools
    // OpenCode should NOT contain Codex-specific tools
    expect(opencodeContent).not.toContain("spawn_agent");
    expect(opencodeContent).not.toContain("mcp__github__");

    // Codex should NOT contain OpenCode-specific tools
    expect(codexContent).not.toContain("subagent_type");
  });

  it("should have non-empty frontmatter in both outputs", () => {
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const codexContent = readFileSync(CODEX_OUT, "utf-8");

    // Both should start with frontmatter
    expect(opencodeContent.startsWith("---")).toBe(true);
    expect(codexContent.startsWith("---")).toBe(true);
  });

  it("should include cross-issue suggestion matching logic", () => {
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const codexContent = readFileSync(CODEX_OUT, "utf-8");

    expect(opencodeContent).toContain("CROSS_ISSUE_SUGGESTIONS");
    expect(codexContent).toContain("CROSS_ISSUE_SUGGESTIONS");
  });
});

describe("build-autopilot error handling", () => {
  it("should report error if manifest.json is missing", async () => {
    // Temporarily rename manifest
    const bakPath = MANIFEST_PATH + ".bak";
    if (existsSync(MANIFEST_PATH)) {
      writeFileSync(bakPath, readFileSync(MANIFEST_PATH));
      rmSync(MANIFEST_PATH);
    }

    const proc = Bun.spawnSync(["bun", "run", "build:templates"], { cwd: PROJECT_ROOT });
    // Should fail (non-zero exit or specific error output)
    const stderr = new TextDecoder().decode(proc.stderr);
    const stdout = new TextDecoder().decode(proc.stdout);
    const combined = stderr + stdout;
    expect(combined.includes("manifest") || proc.exitCode !== 0).toBe(true);

    // Restore
    if (existsSync(bakPath)) {
      writeFileSync(MANIFEST_PATH, readFileSync(bakPath));
      rmSync(bakPath);
    }
  });
});

describe("golden file tests", () => {
  function saveGolden(platform: string, content: string) {
    writeFileSync(join(GOLDEN_DIR, `${platform}.md`), content, "utf-8");
  }

  function readGolden(platform: string): string | null {
    const p = join(GOLDEN_DIR, `${platform}.md`);
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf-8");
  }

  it("should match golden file for opencode output", () => {
    const opencodeContent = readFileSync(OPENCODE_OUT, "utf-8");
    const golden = readGolden("opencode");

    if (golden === null) {
      // First run — save golden file
      saveGolden("opencode", opencodeContent);
      console.log("Golden file for opencode saved (first run)");
    } else {
      // Compare byte-for-byte
      expect(opencodeContent).toBe(golden);
    }
  });

  it("should match golden file for codex output", () => {
    const codexContent = readFileSync(CODEX_OUT, "utf-8");
    const golden = readGolden("codex");

    if (golden === null) {
      // First run — save golden file
      saveGolden("codex", codexContent);
      console.log("Golden file for codex saved (first run)");
    } else {
      // Compare byte-for-byte
      expect(codexContent).toBe(golden);
    }
  });
});
