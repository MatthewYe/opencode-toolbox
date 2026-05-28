import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import AdmZip from "adm-zip";
import { shouldExclude, packageSkill } from "../package_skill";

// =============================================================================
// Slice 2: packageSkill (integration with temp dirs)
// =============================================================================

const FIXTURES_DIR = join(import.meta.dir, "..", "__fixtures__");
const SCRIPTS_DIR = join(import.meta.dir, "..");

function makeSkillDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pkg-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (parent) mkdirSync(parent, { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe("packageSkill", () => {
  it("packages a valid skill into a .skill zip file", () => {
    const skillDir = makeSkillDir({
      "SKILL.md": `---
name: test-skill
description: A test skill
---
# Test Skill

Hello world!
`,
      "scripts/init.ts": `console.log("hello");`,
      "assets/logo.svg": `<svg></svg>`,
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-out-"));
    try {
      const result = packageSkill(skillDir, outDir);
      expect(result).not.toBeNull();
      expect(result).toEndWith(".skill");
      expect(existsSync(result!)).toBe(true);
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });

  it("returns null for non-existent path", () => {
    const result = packageSkill("/nonexistent/path/to/skill");
    expect(result).toBeNull();
  });

  it("returns null when SKILL.md is missing", () => {
    const skillDir = makeSkillDir({
      "readme.txt": "no SKILL.md here",
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-out-"));
    try {
      const result = packageSkill(skillDir, outDir);
      expect(result).toBeNull();
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });

  it("returns null when validation fails (invalid skill)", () => {
    const skillDir = makeSkillDir({
      "SKILL.md": `---
name: INVALID-name
description: Has invalid name
---
# Content
`,
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-out-"));
    try {
      const result = packageSkill(skillDir, outDir);
      expect(result).toBeNull();
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });

  it("excludes __pycache__, node_modules, *.pyc, .DS_Store, root evals/ from zip", () => {
    const skillDir = makeSkillDir({
      "SKILL.md": `---
name: exclude-test
description: Testing exclusions
---
# Test
`,
      "scripts/main.ts": `console.log("main");`,
      "__pycache__/cached.pyc": "cache",
      "node_modules/pkg/index.js": "module",
      "scripts/util.pyc": "pyc file",
      ".DS_Store": "ds_store",
      "evals/test.json": "{}",
      "scripts/evals/data.json": "{}", // nested evals — NOT excluded
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-out-"));
    try {
      const result = packageSkill(skillDir, outDir);
      expect(result).not.toBeNull();

      // Verify zip contents
      const zip = new AdmZip(result!);
      const entries = zip.getEntries().map((e) => e.entryName);

      // Should include
      expect(entries).toContain(`${basename(skillDir)}/SKILL.md`);
      expect(entries).toContain(`${basename(skillDir)}/scripts/main.ts`);
      // Nested evals/ should be included (not root-level)
      expect(entries).toContain(`${basename(skillDir)}/scripts/evals/data.json`);

      // Should NOT include
      expect(entries).not.toContain(`${basename(skillDir)}/__pycache__/cached.pyc`);
      expect(entries).not.toContain(`${basename(skillDir)}/node_modules/pkg/index.js`);
      expect(entries).not.toContain(`${basename(skillDir)}/scripts/util.pyc`);
      expect(entries).not.toContain(`${basename(skillDir)}/.DS_Store`);
      expect(entries).not.toContain(`${basename(skillDir)}/evals/test.json`);

      // Verify content of a non-excluded file
      const mainContent = zip.readAsText(`${basename(skillDir)}/scripts/main.ts`);
      expect(mainContent).toBe(`console.log("main");`);
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });
});

describe("shouldExclude", () => {
  // Tracer bullet: excludes __pycache__ anywhere in path
  it("excludes __pycache__ anywhere in path", () => {
    expect(shouldExclude("my-skill/__pycache__/cached.pyc")).toBe(true);
    expect(shouldExclude("my-skill/sub/__pycache__/cached.pyc")).toBe(true);
  });

  it("excludes node_modules anywhere in path", () => {
    expect(shouldExclude("my-skill/node_modules/pkg/index.js")).toBe(true);
    expect(shouldExclude("my-skill/deep/node_modules/pkg/index.js")).toBe(true);
  });

  it("excludes *.pyc files", () => {
    expect(shouldExclude("my-skill/scripts/cached.pyc")).toBe(true);
    expect(shouldExclude("my-skill/__init__.pyc")).toBe(true);
  });

  it("excludes .DS_Store files", () => {
    expect(shouldExclude("my-skill/.DS_Store")).toBe(true);
    expect(shouldExclude("my-skill/sub/.DS_Store")).toBe(true);
  });

  it("excludes root-level evals/ directory", () => {
    expect(shouldExclude("my-skill/evals/test.json")).toBe(true);
    expect(shouldExclude("my-skill/evals/sub/file.txt")).toBe(true);
  });

  it("does NOT exclude nested evals/ (not at root level)", () => {
    expect(shouldExclude("my-skill/scripts/evals/test.json")).toBe(false);
    expect(shouldExclude("my-skill/deep/nested/evals/file.txt")).toBe(false);
  });

  it("does NOT exclude normal files", () => {
    expect(shouldExclude("my-skill/SKILL.md")).toBe(false);
    expect(shouldExclude("my-skill/scripts/init.ts")).toBe(false);
    expect(shouldExclude("my-skill/assets/logo.png")).toBe(false);
  });

  it("combines multiple exclusion rules", () => {
    // __pycache__ takes priority (true regardless of other rules)
    expect(shouldExclude("my-skill/__pycache__/test.pyc")).toBe(true);
    // evals/ is root-only: nested evals/ with normal file → NOT excluded
    expect(shouldExclude("my-skill/scripts/evals/data.txt")).toBe(false);
    // BUT *.pyc inside nested evals/ → excluded by glob rule
    expect(shouldExclude("my-skill/scripts/evals/data.pyc")).toBe(true);
  });
});

// =============================================================================
// CLI integration tests (import.meta.main block)
// =============================================================================

describe("CLI (import.meta.main)", () => {
  it("prints usage and exits 1 when no args provided", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "package_skill.ts")],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("exits 0 and produces .skill file for valid skill", () => {
    const skillDir = makeSkillDir({
      "SKILL.md": `---
name: cli-test
description: CLI test skill
---
# CLI Test
`,
      "scripts/main.ts": `console.log("cli test");`,
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-cli-out-"));
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "package_skill.ts"), skillDir, outDir],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Successfully packaged skill to:");

      // Verify the .skill file exists
      const skillName = basename(skillDir);
      expect(existsSync(join(outDir, `${skillName}.skill`))).toBe(true);
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });

  it("exits 1 for invalid skill (validation fails)", () => {
    const skillDir = makeSkillDir({
      "SKILL.md": `---
name: INVALID
description: Broken
---
# Bad
`,
    });
    const outDir = mkdtempSync(join(tmpdir(), "pkg-cli-out-"));
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "package_skill.ts"), skillDir, outDir],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Validation failed");
    } finally {
      cleanup(skillDir);
      cleanup(outDir);
    }
  });

  it("exits 1 for non-existent path", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "package_skill.ts"), "/nonexistent/path"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Error: Skill folder not found");
  });
});
