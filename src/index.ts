import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, Plugin } from "@opencode-ai/plugin";
import matter from "gray-matter";

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface FrontmatterEntry {
  prompt: string;
  [key: string]: unknown;
}

interface AgentConfig {
  prompt: string;
  [key: string]: unknown;
}

interface CommandConfig {
  template: string;
  args?: unknown;
  [key: string]: unknown;
}

function readMarkdownConfigs(dirPath: string): Record<string, FrontmatterEntry> {
  const result: Record<string, FrontmatterEntry> = {};
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const filePath = path.join(dirPath, entry.name);
    const raw = fs.readFileSync(filePath, "utf8");
    const { data: frontmatter, content } = matter(raw);
    const key = entry.name.replace(/\.md$/, "");

    result[key] = { ...frontmatter, prompt: content.trim() };
  }
  return result;
}

function buildAgentConfigs(raw: Record<string, FrontmatterEntry>): Record<string, AgentConfig> {
  const configs: Record<string, AgentConfig> = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, ...rest } = def;
    configs[name] = { ...rest, prompt };
  }
  return configs;
}

function buildCommandConfigs(raw: Record<string, FrontmatterEntry>): Record<string, CommandConfig> {
  const configs: Record<string, CommandConfig> = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, arguments: args, ...rest } = def;
    const cmd: CommandConfig = { ...rest, template: prompt };
    if (args) cmd.args = args;
    configs[name] = cmd;
  }
  return configs;
}

// biome-ignore lint/suspicious/noExplicitAny: plugin config is dynamically extended by consumers
type DynamicConfig = Config & Record<string, any>;

export const OpenCodeToolbox: Plugin = async ({ directory: _directory }) => {
  const skillsDir = path.resolve(__dirname, "skills");
  const upstreamEngDir = path.resolve(__dirname, "upstream", "skills", "engineering");
  const upstreamProdDir = path.resolve(__dirname, "upstream", "skills", "productivity");
  const agentsRaw = readMarkdownConfigs(path.resolve(__dirname, "agents"));
  const commandsRaw = readMarkdownConfigs(path.resolve(__dirname, "commands"));

  const agentConfigs = buildAgentConfigs(agentsRaw);
  const commandConfigs = buildCommandConfigs(commandsRaw);

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

      cfg.agent = { ...(cfg.agent ?? {}), ...agentConfigs };
      cfg.command = { ...(cfg.command ?? {}), ...commandConfigs };
    },
  };
};
