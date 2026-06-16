import fs from "node:fs";
import path from "node:path";
import type { Config, Plugin } from "@opencode-ai/plugin";
import {
  buildAgentConfigs,
  buildCommandConfigs,
  buildPrinciplesBlock,
  parsePrinciples,
  readMarkdownConfigs,
  readSkillDirCommands,
} from "./shared.js";
import type { PrincipleSections } from "./shared.js";

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// biome-ignore lint/suspicious/noExplicitAny: plugin config is dynamically extended by consumers
type DynamicConfig = Config & Record<string, any>;

export const AutopilotToolkit: Plugin = async ({ directory: _directory }) => {
  const skillsDir = path.resolve(__dirname, "skills");
  const upstreamEngDir = path.resolve(__dirname, "upstream", "skills", "engineering");
  const upstreamProdDir = path.resolve(__dirname, "upstream", "skills", "productivity");
  const agentsRaw = readMarkdownConfigs(path.resolve(__dirname, "agents"));
  const commandsRaw = readMarkdownConfigs(path.resolve(__dirname, "commands"));

  const agentConfigs = buildAgentConfigs(agentsRaw);
  const commandConfigs = buildCommandConfigs(commandsRaw);

  const upstreamCommandsRaw = {
    ...readSkillDirCommands(upstreamEngDir),
    ...readSkillDirCommands(upstreamProdDir),
  };
  const upstreamCommandConfigs = buildCommandConfigs(upstreamCommandsRaw);

  const principlesPath = path.resolve(__dirname, "principles", "karpathy.md");
  const primaryPrinciplesPath = path.resolve(__dirname, "principles", "karpathy-primary.md");
  let principleSections: PrincipleSections | null = null;
  if (fs.existsSync(principlesPath)) {
    const rawPrinciples = fs.readFileSync(principlesPath, "utf8");
    principleSections = parsePrinciples(rawPrinciples);
  }

  return {
    config: async (config) => {
      const cfg = config as DynamicConfig;
      cfg.skills = cfg.skills || {};
      cfg.skills.paths = cfg.skills.paths || [];
      const skillPaths = [skillsDir, upstreamEngDir, upstreamProdDir];
      for (const p of skillPaths) {
        if (!cfg.skills.paths.includes(p)) {
          cfg.skills.paths.push(p);
        }
      }

      if (cfg.lsp === undefined) {
        cfg.lsp = true as unknown as typeof cfg.lsp;
      }

      cfg.agent = { ...(cfg.agent ?? {}), ...agentConfigs };
      cfg.command = { ...upstreamCommandConfigs, ...commandConfigs, ...(cfg.command ?? {}) };

      // Prepend Karpathy principles to agent prompts based on agent mapping
      if (principleSections) {
        for (const [agentName, agentCfg] of Object.entries(cfg.agent)) {
          if (!agentCfg) continue;
          const block = buildPrinciplesBlock(principleSections, agentName);
          if (block) {
            agentCfg.prompt = block + (agentCfg.prompt ?? "");
          }
        }
      }

      // Primary agent: inject full Karpathy principles via instructions
      cfg.instructions = cfg.instructions || [];
      if (!cfg.instructions.includes(primaryPrinciplesPath)) {
        cfg.instructions.push(primaryPrinciplesPath);
      }
    },
  };
};
