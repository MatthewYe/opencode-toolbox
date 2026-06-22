// Core package entry — re-exports shared utilities
export * from "./shared.js";

// AutopilotToolkit: Karpathy principles injection for agent prompts.
// Retained for backward compatibility with integration tests.
export async function AutopilotToolkit(_opts?: Record<string, unknown>) {
  const { buildPrinciplesBlock, parsePrinciples, getPrinciplesDir } = await import("./shared.js");
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  return {
    config: async (cfg: Record<string, unknown>) => {
      const agents = (cfg as Record<string, unknown>).agent as Record<string, { prompt?: string }> | undefined;
      if (!agents) return;

      const principlesDir = getPrinciplesDir();
      const principlesPath = join(principlesDir, "karpathy.md");
      if (!existsSync(principlesPath)) return;

      const content = readFileSync(principlesPath, "utf8");
      const sections = parsePrinciples(content);

      for (const [agentName, agentCfg] of Object.entries(agents)) {
        if (typeof agentCfg === "object" && agentCfg !== null) {
          const block = buildPrinciplesBlock(sections, agentName);
          if (block) agentCfg.prompt = block;
        }
      }
    },
  };
}
