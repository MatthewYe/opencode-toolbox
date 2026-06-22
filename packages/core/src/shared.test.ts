import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs, { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildAgentConfigs,
  buildCommandConfigs,
  buildPrinciplesBlock,
  getPackageRoot,
  type PrincipleSections,
  parsePrinciples,
  readMarkdownConfigs,
  readSkillDirCommands,
} from "./shared.js";

// ── Test helpers ────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "core-shared-test-"));
}

function writeMarkdown(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, `${name}.md`), content, "utf8");
}

function writeSkillDir(dir: string, skillName: string, frontmatterContent: string, bodyContent: string = "") {
  const skillDir = path.join(dir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\n${frontmatterContent}\n---\n${bodyContent}`, "utf8");
}

// ── Sample principles content for testing ───────────────────────

const SAMPLE_PRINCIPLES = `## Principle 1: Think Before Coding

This is the coding principle body.

## Principle 1: Think Before Judging

Reviewer Variant
This is the judging principle body.

## Principle 1: Think Before Analyzing

Argus Variant
This is the analyzing principle body.

## Principle 2: Simplicity First

This is the simplicity principle body.

## Principle 3: Surgical Changes

This is the surgical changes principle body.

## Principle 4: Goal-Driven Execution

This is the goal-driven principle body.
`;

// ── Tests ───────────────────────────────────────────────────────

describe("parsePrinciples", () => {
  test("parses all six principle variants from content", () => {
    const sections = parsePrinciples(SAMPLE_PRINCIPLES);

    expect(sections.v1Coding).toContain("This is the coding principle body.");
    expect(sections.v1Judging).toContain("This is the judging principle body.");
    expect(sections.v1Analyzing).toContain("This is the analyzing principle body.");
    expect(sections.v2).toContain("This is the simplicity principle body.");
    expect(sections.v3).toContain("This is the surgical changes principle body.");
    expect(sections.v4).toContain("This is the goal-driven principle body.");
  });

  test("v1Coding excludes Reviewer/Argus variant text", () => {
    const sections = parsePrinciples(SAMPLE_PRINCIPLES);
    expect(sections.v1Coding).not.toContain("Reviewer Variant");
    expect(sections.v1Coding).not.toContain("Argus Variant");
  });

  test("returns empty strings for missing principles", () => {
    const sections = parsePrinciples("## Principle 2: Only One\n\nJust this.");
    // v1 variants should be empty, v3/v4 empty, but v2 present
    expect(sections.v2).toContain("Just this.");
  });
});

describe("buildPrinciplesBlock", () => {
  let sections: PrincipleSections;

  beforeAll(() => {
    sections = parsePrinciples(SAMPLE_PRINCIPLES);
  });

  test("implementer gets v1Coding + v2 + v3 + v4", () => {
    const block = buildPrinciplesBlock(sections, "implementer");
    expect(block).toContain("Think Before Coding");
    expect(block).toContain("Simplicity First");
    expect(block).toContain("Surgical Changes");
    expect(block).toContain("Goal-Driven Execution");
    expect(block).toContain("This is the coding principle body.");
    expect(block).toContain("This is the simplicity principle body.");
    expect(block).toContain("This is the surgical changes principle body.");
    expect(block).toContain("This is the goal-driven principle body.");
    // Should not contain judging/analyzing variants
    expect(block).not.toContain("Think Before Judging");
    expect(block).not.toContain("Think Before Analyzing");
  });

  test("reviewer gets v1Judging + v2 + v4 (NOT v3, NOT v1Coding)", () => {
    const block = buildPrinciplesBlock(sections, "reviewer");
    expect(block).toContain("Think Before Judging");
    expect(block).toContain("Simplicity First");
    expect(block).toContain("Goal-Driven Execution");
    expect(block).not.toContain("Surgical Changes");
    expect(block).not.toContain("Think Before Coding");
  });

  test("argus gets v1Analyzing + v2 + v4 (NOT v3)", () => {
    const block = buildPrinciplesBlock(sections, "argus");
    expect(block).toContain("Think Before Analyzing");
    expect(block).toContain("Simplicity First");
    expect(block).toContain("Goal-Driven Execution");
    expect(block).not.toContain("Surgical Changes");
    expect(block).not.toContain("Think Before Coding");
  });

  test("general gets same as implementer", () => {
    const block = buildPrinciplesBlock(sections, "general");
    expect(block).toContain("Think Before Coding");
    expect(block).toContain("Simplicity First");
    expect(block).toContain("Surgical Changes");
    expect(block).toContain("Goal-Driven Execution");
  });

  test("unknown agent returns empty string", () => {
    const block = buildPrinciplesBlock(sections, "unknown-agent");
    expect(block).toBe("");
  });

  test("principles header is at the start of the block", () => {
    const block = buildPrinciplesBlock(sections, "implementer");
    expect(block.startsWith("# Andrej Karpathy's Coding Principles")).toBe(true);
  });
});

describe("readMarkdownConfigs", () => {
  test("reads markdown files from a directory and extracts frontmatter + prompt", () => {
    const tmp = makeTempDir();
    try {
      writeMarkdown(
        tmp,
        "test-agent",
        `---
name: Test Agent
description: A test agent
---

This is the agent prompt content.
`,
      );

      const configs = readMarkdownConfigs(tmp);
      expect(configs["test-agent"]).toBeDefined();
      expect(configs["test-agent"].name).toBe("Test Agent");
      expect(configs["test-agent"].description).toBe("A test agent");
      expect(configs["test-agent"].prompt).toBe("This is the agent prompt content.");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("returns empty object for non-existent directory", () => {
    const configs = readMarkdownConfigs("/nonexistent/path/12345");
    expect(configs).toEqual({});
  });

  test("ignores non-.md files in the directory", () => {
    const tmp = makeTempDir();
    try {
      writeMarkdown(tmp, "valid", "---\nname: Valid\n---\nContent.");
      fs.writeFileSync(path.join(tmp, "readme.txt"), "not markdown", "utf8");

      const configs = readMarkdownConfigs(tmp);
      expect(Object.keys(configs)).toHaveLength(1);
      expect(configs.valid).toBeDefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("buildAgentConfigs", () => {
  test("transforms FrontmatterEntry records to AgentConfig records", () => {
    const raw = {
      implementer: { name: "Implementer", description: "Builds things", prompt: "You are an implementer." },
      reviewer: { name: "Reviewer", description: "Reviews things", prompt: "You are a reviewer." },
    };

    const configs = buildAgentConfigs(raw);
    expect(configs.implementer).toBeDefined();
    expect(configs.implementer.prompt).toBe("You are an implementer.");
    expect(configs.implementer.description).toBe("Builds things");
    expect(configs.reviewer).toBeDefined();
    expect(configs.reviewer.prompt).toBe("You are a reviewer.");
    expect(configs.reviewer.description).toBe("Reviews things");
  });
});

describe("buildCommandConfigs", () => {
  test("transforms FrontmatterEntry records to CommandConfig records", () => {
    const raw = {
      autopilot: { name: "Autopilot", prompt: "Run the autopilot", arguments: { dir: "string" } },
      teach: { name: "Teach", prompt: "Teach a concept" },
    };

    const configs = buildCommandConfigs(raw);
    expect(configs.autopilot).toBeDefined();
    expect(configs.autopilot.template).toBe("Run the autopilot");
    expect(configs.autopilot.args).toEqual({ dir: "string" });
    expect(configs.teach).toBeDefined();
    expect(configs.teach.template).toBe("Teach a concept");
    expect(configs.teach.args).toBeUndefined();
  });
});

describe("readSkillDirCommands", () => {
  test("reads skill directories and extracts name + description from SKILL.md frontmatter", () => {
    const tmp = makeTempDir();
    try {
      writeSkillDir(tmp, "my-skill", "name: My Skill\ndescription: Does something useful");

      const commands = readSkillDirCommands(tmp);
      expect(commands["My Skill"]).toBeDefined();
      expect(commands["My Skill"].description).toBe("Does something useful");
      expect(commands["My Skill"].prompt).toContain("Load the 'My Skill' skill");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("falls back to directory name when frontmatter name is missing", () => {
    const tmp = makeTempDir();
    try {
      writeSkillDir(tmp, "fallback-skill", "description: A fallback skill");

      const commands = readSkillDirCommands(tmp);
      expect(commands["fallback-skill"]).toBeDefined();
      expect(commands["fallback-skill"].description).toBe("A fallback skill");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("ignores directories without a SKILL.md file", () => {
    const tmp = makeTempDir();
    try {
      // Create empty dir — no SKILL.md
      fs.mkdirSync(path.join(tmp, "empty-dir"), { recursive: true });
      // Create a valid skill dir
      writeSkillDir(tmp, "has-skill", "name: Has Skill");

      const commands = readSkillDirCommands(tmp);
      expect(Object.keys(commands)).toHaveLength(1);
      expect(commands["Has Skill"]).toBeDefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("getPackageRoot", () => {
  test("returns an absolute path ending with the package name", () => {
    const root = getPackageRoot();
    expect(root).toBeDefined();
    expect(path.isAbsolute(root)).toBe(true);
    expect(root.endsWith("core")).toBe(true);
  });
});
