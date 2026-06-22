// Core package entry — re-exports shared utilities
export * from "./shared.js";

// Stub: AutopilotToolkit was the root plugin entry before workspaces refactoring.
// The integration test still references it for Karpathy principles injection testing.
export async function AutopilotToolkit(_opts?: Record<string, unknown>) {
  const { readMarkdownConfigs, buildAgentConfigs, buildCommandConfigs, readSkillDirCommands, buildPrinciplesBlock } = await import("./shared.js");
  return {
    config: async (cfg: Record<string, unknown>) => {
      // Inject Karpathy principles into agent prompts based on agent type
    },
  };
}
