import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Config } from "@opencode-ai/plugin";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { OpenCodeToolbox, generateSelfReport, type AgentConfig, type CommandConfig, type PrincipleSections } from "./index";

/**
 * RED phase: Test that principles are prepended to agent prompts based on agent mapping.
 * This test will FAIL until the injection code is implemented in src/index.ts.
 */
describe("Karpathy Principles Injection", () => {
  let result: { config?: (cfg: Config) => Promise<void> } | undefined;

  beforeAll(async () => {
    result = await OpenCodeToolbox({ directory: "." } as any);
  });

  test("implementer gets all four principles with Think Before Coding", async () => {
    const cfg = { agent: {}, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const implPrompt = prompt.implementer?.prompt ?? "";

    expect(implPrompt).toContain("Think Before Coding");
    expect(implPrompt).toContain("Simplicity First");
    expect(implPrompt).toContain("Surgical Changes");
    expect(implPrompt).toContain("Goal-Driven Execution");
  });

  test("general gets all four principles with Think Before Coding", async () => {
    const cfg = { agent: { general: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const genPrompt = prompt.general?.prompt ?? "";

    expect(genPrompt).toContain("Think Before Coding");
    expect(genPrompt).toContain("Simplicity First");
    expect(genPrompt).toContain("Surgical Changes");
    expect(genPrompt).toContain("Goal-Driven Execution");
  });

  test("reviewer gets principles 1(variant),2,4 — Think Before Judging, not Think Before Coding", async () => {
    const cfg = { agent: { reviewer: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const revPrompt = prompt.reviewer?.prompt ?? "";

    // Should have the judging variant
    expect(revPrompt).toContain("Think Before Judging");
    // Should have principles 2 and 4
    expect(revPrompt).toContain("Simplicity First");
    expect(revPrompt).toContain("Goal-Driven Execution");
    // Should NOT have principle 3 (Surgical Changes)
    expect(revPrompt).not.toContain("Surgical Changes");
    // Should NOT have the coder variant
    expect(revPrompt).not.toContain("Think Before Coding");
  });

  test("argus gets principles 1(variant),2,4 — Think Before Analyzing", async () => {
    const cfg = { agent: { argus: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const argusPrompt = prompt.argus?.prompt ?? "";

    // Should have the analyzing variant
    expect(argusPrompt).toContain("Think Before Analyzing");
    // Should have principles 2 and 4
    expect(argusPrompt).toContain("Simplicity First");
    expect(argusPrompt).toContain("Goal-Driven Execution");
    // Should NOT have principle 3
    expect(argusPrompt).not.toContain("Surgical Changes");
    // Should NOT have the coder or judging variants
    expect(argusPrompt).not.toContain("Think Before Coding");
    expect(argusPrompt).not.toContain("Think Before Judging");
  });

  test("explore gets no principles", async () => {
    const cfg = { agent: { explore: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const explorePrompt = prompt.explore?.prompt ?? "";

    // explore should NOT get any principles
    expect(explorePrompt).not.toContain("Think Before Coding");
    expect(explorePrompt).not.toContain("Think Before Judging");
    expect(explorePrompt).not.toContain("Think Before Analyzing");
    expect(explorePrompt).not.toContain("Simplicity First");
    expect(explorePrompt).not.toContain("Surgical Changes");
    expect(explorePrompt).not.toContain("Goal-Driven Execution");
  });

  test("principles are prepended (appear at start of agent prompt)", async () => {
    const cfg = { agent: { implementer: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result?.config?.(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const implPrompt = prompt.implementer?.prompt ?? "";

    // Principles header should be at the very beginning of the prompt
    const headerIndex = implPrompt.indexOf("# Andrej Karpathy's Coding Principles");
    expect(headerIndex).toBe(0);
  });
});

/**
 * Self-report generation — tests for the pure data-shaping function.
 * File I/O is not tested here; integration is verified via config hook output.
 */
describe("Self-Report Generation", () => {
  const fakeAgentConfigs: Record<string, AgentConfig> = {
    implementer: { prompt: "test" },
    reviewer: { prompt: "test" },
    argus: { prompt: "test" },
  };

  const fakeCommandConfigs: Record<string, CommandConfig> = {
    autopilot: { template: "test" },
    "audit-autopilot": { template: "test" },
    "git-guardrails": { template: "test" },
    "skill-creator": { template: "test" },
    teach: { template: "test" },
  };

  const fakeUpstreamCommandConfigs: Record<string, CommandConfig> = {
    caveman: { template: "test" },
    diagnose: { template: "test" },
    tdd: { template: "test" },
    "zoom-out": { template: "test" },
    "to-prd": { template: "test" },
    "to-issues": { template: "test" },
    triage: { template: "test" },
    prototype: { template: "test" },
    "grill-with-docs": { template: "test" },
    "improve-codebase-architecture": { template: "test" },
    "setup-matt-pocock-skills": { template: "test" },
    "grill-me": { template: "test" },
    "write-a-skill": { template: "test" },
    handoff: { template: "test" },
    teach: { template: "test" },
  };

  const fakeSkillPaths = [
    "/abs/skills",
    "/abs/upstream/skills/engineering",
    "/abs/upstream/skills/productivity",
  ];

  // A minimal valid PrincipleSections — all agents in AGENT_PRINCIPLE_MAP will match
  const fullPrincipleSections: PrincipleSections = {
    v1Coding: "Think Before Coding",
    v1Judging: "Think Before Judging",
    v1Analyzing: "Think Before Analyzing",
    v2: "Simplicity First",
    v3: "Surgical Changes",
    v4: "Goal-Driven Execution",
  };

  test("generates correct report structure with principles injected", () => {
    const report = generateSelfReport({
      agentConfigs: fakeAgentConfigs,
      commandConfigs: fakeCommandConfigs,
      upstreamCommandConfigs: fakeUpstreamCommandConfigs,
      skillPaths: fakeSkillPaths,
      principleSections: fullPrincipleSections,
      instructionsInjected: true,
      version: "1.0.0",
    });

    // Top-level fields
    expect(report.version).toBe("1.0.0");
    expect(report.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(report.principles_injected).toBe(true);
    expect(report.instructions_injected).toBe(true);

    // Agents — all three core agents should have principles
    expect(report.agents.implementer.prompt_includes_principles).toBe(true);
    expect(report.agents.reviewer.prompt_includes_principles).toBe(true);
    expect(report.agents.argus.prompt_includes_principles).toBe(true);
    expect(Object.keys(report.agents)).toHaveLength(3);

    // Commands — should include all local commands
    expect(Object.keys(report.commands)).toContain("autopilot");
    expect(Object.keys(report.commands)).toContain("audit-autopilot");
    expect(Object.keys(report.commands)).toContain("git-guardrails");
    expect(Object.keys(report.commands)).toContain("skill-creator");
    expect(Object.keys(report.commands)).toContain("teach");
    expect(Object.keys(report.commands)).toHaveLength(5);

    // Upstream skill commands — should be an array of command names
    expect(report.upstream_skill_commands).toContain("caveman");
    expect(report.upstream_skill_commands).toContain("diagnose");
    expect(report.upstream_skill_commands).toContain("tdd");
    expect(report.upstream_skill_commands).toContain("zoom-out");
    expect(report.upstream_skill_commands).toHaveLength(Object.keys(fakeUpstreamCommandConfigs).length);

    // Skill paths
    expect(report.skill_paths).toEqual(fakeSkillPaths);
  });

  test("principles_injected is false when principleSections is null", () => {
    const report = generateSelfReport({
      agentConfigs: fakeAgentConfigs,
      commandConfigs: fakeCommandConfigs,
      upstreamCommandConfigs: fakeUpstreamCommandConfigs,
      skillPaths: fakeSkillPaths,
      principleSections: null,
      instructionsInjected: false,
      version: "1.0.0",
    });

    expect(report.principles_injected).toBe(false);
    expect(report.instructions_injected).toBe(false);

    // Agents should still be recorded but with false prompt_includes_principles
    expect(report.agents.implementer.prompt_includes_principles).toBe(false);
    expect(report.agents.reviewer.prompt_includes_principles).toBe(false);
    expect(report.agents.argus.prompt_includes_principles).toBe(false);
  });

  test("agent not in AGENT_PRINCIPLE_MAP gets prompt_includes_principles false", () => {
    // "explore" is not in AGENT_PRINCIPLE_MAP and would not receive principles
    const report = generateSelfReport({
      agentConfigs: { ...fakeAgentConfigs, explore: { prompt: "test" } },
      commandConfigs: fakeCommandConfigs,
      upstreamCommandConfigs: fakeUpstreamCommandConfigs,
      skillPaths: fakeSkillPaths,
      principleSections: fullPrincipleSections,
      instructionsInjected: true,
      version: "1.0.0",
    });

    expect(report.agents.explore.prompt_includes_principles).toBe(false);
    expect(report.agents.implementer.prompt_includes_principles).toBe(true);
  });

  test("version comes from the version parameter", () => {
    const report = generateSelfReport({
      agentConfigs: fakeAgentConfigs,
      commandConfigs: fakeCommandConfigs,
      upstreamCommandConfigs: fakeUpstreamCommandConfigs,
      skillPaths: fakeSkillPaths,
      principleSections: fullPrincipleSections,
      instructionsInjected: true,
      version: "2.5.3",
    });

    expect(report.version).toBe("2.5.3");
  });

  test("command values are empty objects", () => {
    const report = generateSelfReport({
      agentConfigs: fakeAgentConfigs,
      commandConfigs: fakeCommandConfigs,
      upstreamCommandConfigs: fakeUpstreamCommandConfigs,
      skillPaths: fakeSkillPaths,
      principleSections: fullPrincipleSections,
      instructionsInjected: true,
      version: "1.0.0",
    });

    for (const cmd of Object.values(report.commands)) {
      expect(cmd).toEqual({});
    }
  });
});

/**
 * toolbox-lint command file — verifies the command definition exists
 * with valid frontmatter and all required content sections.
 */
describe("toolbox-lint command", () => {
  const __testdir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cmdPath = path.join(__testdir, "commands", "toolbox-lint.md");

  test("command file exists", () => {
    expect(fs.existsSync(cmdPath)).toBe(true);
  });

  test("frontmatter is valid with description and no arguments", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    const { data: fm } = matter(raw);

    expect(fm.description).toBeTruthy();
    expect(typeof fm.description).toBe("string");
    expect(fm.description.length).toBeGreaterThan(0);
    expect(fm.arguments).toBeUndefined();
  });

  test("contains TOOLBOX_LINT_REPORT: output marker", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toContain("TOOLBOX_LINT_REPORT:");
  });

  test("contains L1, L2, L3 section markers", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toContain("## L1");
    expect(raw).toContain("## L2");
    expect(raw).toContain("## L3");
  });

  test("contains summary aggregation instructions", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toMatch(/汇总|Summary|summary/);
    expect(raw).toMatch(/PASS.*FAIL.*WARN/);
  });

  test("self-report path references project root, not plugin directory", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toContain(".toolbox-lint-report.json");

    // Self-report section must clarify the file is in project root, not plugin dir
    const selfReportSection = raw.slice(
      raw.indexOf("## Self-report"),
      raw.indexOf("## L1")
    );
    expect(selfReportSection).toMatch(/project root|project-root|project directory|NOT.*plugin/i);
  });

  test("working directory section distinguishes project root from plugin dir", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    const wdSection = raw.slice(
      raw.indexOf("## Working directory"),
      raw.indexOf("## Output format")
    );
    // Working directory must be identified as project root
    expect(wdSection).toMatch(/project root|project-root/);
    // Must distinguish plugin files from self-report path
    expect(wdSection).toMatch(/plugin.*(?:directory|installation|dir)/i);
    // Self-report path must be mentioned in working directory section
    expect(wdSection).toContain(".opencode/.toolbox-lint-report.json");
  });

  test("contains canary skill and command references", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toContain("_toolbox-canary");
  });

  test("contains instructions not to auto-fix failures", () => {
    const raw = fs.readFileSync(cmdPath, "utf8");
    expect(raw).toMatch(/(不.*(?:修复|fix|repair)|do not (?:fix|repair|modify))/i);
  });
});
