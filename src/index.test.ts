import { describe, test, expect, beforeAll } from "bun:test";
import { OpenCodeToolbox } from "./index";
import type { Config } from "@opencode-ai/plugin";

/**
 * RED phase: Test that principles are prepended to agent prompts based on agent mapping.
 * This test will FAIL until the injection code is implemented in src/index.ts.
 */
describe("Karpathy Principles Injection", () => {
  let result: { config?: (cfg: Config) => Promise<void> } | undefined;

  beforeAll(async () => {
    result = await OpenCodeToolbox({ directory: "." });
  });

  test("implementer gets all four principles with Think Before Coding", async () => {
    const cfg = { agent: {}, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result!.config!(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const implPrompt = prompt.implementer?.prompt ?? "";

    expect(implPrompt).toContain("Think Before Coding");
    expect(implPrompt).toContain("Simplicity First");
    expect(implPrompt).toContain("Surgical Changes");
    expect(implPrompt).toContain("Goal-Driven Execution");
  });

  test("general gets all four principles with Think Before Coding", async () => {
    const cfg = { agent: { general: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result!.config!(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const genPrompt = prompt.general?.prompt ?? "";

    expect(genPrompt).toContain("Think Before Coding");
    expect(genPrompt).toContain("Simplicity First");
    expect(genPrompt).toContain("Surgical Changes");
    expect(genPrompt).toContain("Goal-Driven Execution");
  });

  test("reviewer gets principles 1(variant),2,4 — Think Before Judging, not Think Before Coding", async () => {
    const cfg = { agent: { reviewer: {} }, skills: { paths: [] } } as unknown as Config & Record<string, unknown>;
    await result!.config!(cfg as Config);

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
    await result!.config!(cfg as Config);

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
    await result!.config!(cfg as Config);

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
    await result!.config!(cfg as Config);

    const prompt = (cfg as Record<string, unknown>).agent as Record<string, { prompt: string }>;
    const implPrompt = prompt.implementer?.prompt ?? "";

    // Principles header should be at the very beginning of the prompt
    const headerIndex = implPrompt.indexOf("# Andrej Karpathy's Coding Principles");
    expect(headerIndex).toBe(0);
  });
});
