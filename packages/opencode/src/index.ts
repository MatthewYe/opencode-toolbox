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
  getAgentsDir,
  getCoreDir,
  getPrinciplesDir,
} from "@matthewye/autopilot-toolkit-core";
import type { PrincipleSections } from "@matthewye/autopilot-toolkit-core";

type DynamicConfig = Config & Record<string, any>;

export const AutopilotToolkit: Plugin = async ({ directory: _directory }) => {
  const pkgDir = path.resolve(import.meta.dirname, "..");
  const skillsDir = path.resolve(pkgDir, "skills");
  const agentsDir = getAgentsDir();
  const commandsDir = path.resolve(pkgDir, "commands");
  const principlesPath = path.resolve(getPrinciplesDir(), "karpathy.md");
  const primaryPrinciplesPath = path.resolve(getPrinciplesDir(), "karpathy-primary.md");

  const agentsRaw = readMarkdownConfigs(agentsDir);
  const commandsRaw = readMarkdownConfigs(commandsDir);

  const agentConfigs = buildAgentConfigs(agentsRaw);
  const commandConfigs = buildCommandConfigs(commandsRaw);

  const skillCommands = readSkillDirCommands(skillsDir);
  const skillCommandConfigs = buildCommandConfigs(skillCommands);

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
      if (!cfg.skills.paths.includes(skillsDir)) {
        cfg.skills.paths.push(skillsDir);
      }

      if (cfg.lsp === undefined) {
        cfg.lsp = true as unknown as typeof cfg.lsp;
      }

      cfg.agent = { ...(cfg.agent ?? {}), ...agentConfigs };
      cfg.command = { ...skillCommandConfigs, ...commandConfigs, ...(cfg.command ?? {}) };

      if (principleSections) {
        for (const [agentName, agentCfg] of Object.entries(cfg.agent)) {
          if (!agentCfg) continue;
          const block = buildPrinciplesBlock(principleSections, agentName);
          if (block) {
            agentCfg.prompt = block + (agentCfg.prompt ?? "");
          }
        }
      }

      cfg.instructions = cfg.instructions || [];
      if (!cfg.instructions.includes(primaryPrinciplesPath)) {
        cfg.instructions.push(primaryPrinciplesPath);
      }
    },
  };
};
