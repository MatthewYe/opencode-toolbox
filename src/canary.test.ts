import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANARY_SIGNATURE = "CANARY_OK: toolbox skill registration verified";
const CANARY_CMD_SIGNATURE = "CANARY_OK: toolbox command registration verified";

describe("Toolbox Canary — Skill", () => {
  const skillPath = path.resolve(__dirname, "skills", "_toolbox-canary", "SKILL.md");

  test("SKILL.md exists at skills/_toolbox-canary/SKILL.md", () => {
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  test("SKILL.md has valid YAML frontmatter with required fields", () => {
    const raw = fs.readFileSync(skillPath, "utf8");
    const { data: frontmatter, content } = matter(raw);

    expect(frontmatter.name).toBeDefined();
    expect(typeof frontmatter.name).toBe("string");
    expect(frontmatter.name).toBe("_toolbox-canary");

    expect(frontmatter.description).toBeDefined();
    expect(typeof frontmatter.description).toBe("string");
    expect(frontmatter.description.length).toBeGreaterThan(0);

    // content should contain the canary signature
    expect(content.trim()).toContain(CANARY_SIGNATURE);
  });

  test("canary skill body returns fixed signature when loaded", () => {
    const raw = fs.readFileSync(skillPath, "utf8");
    const { content } = matter(raw);

    expect(content.trim()).toContain(CANARY_SIGNATURE);
  });
});

describe("Toolbox Canary — Command", () => {
  const commandPath = path.resolve(__dirname, "commands", "_toolbox-canary.md");

  test("_toolbox-canary.md exists at commands/_toolbox-canary.md", () => {
    expect(fs.existsSync(commandPath)).toBe(true);
  });

  test("_toolbox-canary.md has valid YAML frontmatter with description", () => {
    const raw = fs.readFileSync(commandPath, "utf8");
    const { data: frontmatter, content } = matter(raw);

    expect(frontmatter.description).toBeDefined();
    expect(typeof frontmatter.description).toBe("string");
    expect(frontmatter.description.length).toBeGreaterThan(0);

    // content should contain the canary signature
    expect(content.trim()).toContain(CANARY_CMD_SIGNATURE);
  });

  test("canary command body returns fixed signature when invoked", () => {
    const raw = fs.readFileSync(commandPath, "utf8");
    const { content } = matter(raw);

    expect(content.trim()).toContain(CANARY_CMD_SIGNATURE);
  });
});

describe("Toolbox Canary — Non-interference", () => {
  test("existing skills still load after canary skill is added", () => {
    const skillsDir = path.resolve(__dirname, "skills");

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory());

    // At minimum, we should have the pre-existing skill dirs + the canary
    const skillNames = skillDirs.map((d) => d.name);

    // Pre-existing skills that must still be present
    expect(skillNames).toContain("skill-creator");
    expect(skillNames).toContain("git-guardrails");
    expect(skillNames).toContain("audit-autopilot");
    expect(skillNames).toContain("opencode-plugin-scaffold");

    // Canary skill should be present
    expect(skillNames).toContain("_toolbox-canary");

    // Each skill dir should have a valid SKILL.md
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir.name, "SKILL.md");
      expect(fs.existsSync(skillFile)).toBe(true);
    }
  });

  test("existing commands still load after canary command is added", () => {
    const commandsDir = path.resolve(__dirname, "commands");

    const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
    const commandFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".md"));

    const commandNames = commandFiles.map((f) => f.name.replace(/\.md$/, ""));

    // Pre-existing commands that must still be present
    expect(commandNames).toContain("autopilot");
    expect(commandNames).toContain("teach");
    expect(commandNames).toContain("skill-creator");
    expect(commandNames).toContain("git-guardrails");
    expect(commandNames).toContain("audit-autopilot");

    // Canary command should be present
    expect(commandNames).toContain("_toolbox-canary");
  });
});
