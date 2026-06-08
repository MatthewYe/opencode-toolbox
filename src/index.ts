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

// ── Karpathy Principles ───────────────────────────────────────────

interface PrincipleSections {
  v1Coding: string;
  v1Judging: string;
  v1Analyzing: string;
  v2: string;
  v3: string;
  v4: string;
}

function parsePrinciples(content: string): PrincipleSections {
  const sections: Record<string, string> = {};
  // Split by "## Principle" headers; skip the intro before the first header
  const parts = content.split(/(?=^## Principle)/m);
  for (const part of parts) {
    const headerMatch = part.match(/^## Principle\s+(\d).*?\n/);
    if (!headerMatch) continue;
    const num = headerMatch[1];
    const body = part.slice(headerMatch[0].length).trim();

    if (num === "1") {
      if (part.includes("Reviewer Variant")) {
        sections.v1Judging = body;
      } else if (part.includes("Argus Variant")) {
        sections.v1Analyzing = body;
      } else {
        sections.v1Coding = body;
      }
    } else {
      sections[`v${num}`] = body;
    }
  }
  return sections as unknown as PrincipleSections;
}

const AGENT_PRINCIPLE_MAP: Record<string, (keyof PrincipleSections)[]> = {
  implementer: ["v1Coding", "v2", "v3", "v4"],
  general: ["v1Coding", "v2", "v3", "v4"],
  reviewer: ["v1Judging", "v2", "v4"],
  argus: ["v1Analyzing", "v2", "v4"],
};

const HEADER_TEMPLATES: Record<string, string> = {
  v1Coding: "## Principle 1: Think Before Coding",
  v1Judging: "## Principle 1: Think Before Judging",
  v1Analyzing: "## Principle 1: Think Before Analyzing",
  v2: "## Principle 2: Simplicity First",
  v3: "## Principle 3: Surgical Changes",
  v4: "## Principle 4: Goal-Driven Execution",
};

function buildPrinciplesBlock(sections: PrincipleSections, agentName: string): string {
  const keys = AGENT_PRINCIPLE_MAP[agentName];
  if (!keys || keys.length === 0) return "";

  const blocks = keys.map((key) => {
    const header = HEADER_TEMPLATES[key];
    const body = sections[key] ?? "";
    return `${header}\n\n${body}`;
  });
  return `# Andrej Karpathy's Coding Principles\n\n${blocks.join("\n\n")}\n\n---\n\n`;
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

function readSkillDirCommands(dirPath: string): Record<string, FrontmatterEntry> {
  const result: Record<string, FrontmatterEntry> = {};
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dirPath, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const raw = fs.readFileSync(skillFile, "utf8");
    const { data: frontmatter } = matter(raw);
    const name = frontmatter.name || entry.name;
    const description = frontmatter.description || "";
    const template = `Load the '${name}' skill and follow its instructions.`;

    result[name] = { description, prompt: template };
  }
  return result;
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

  const upstreamCommandsRaw = {
    ...readSkillDirCommands(upstreamEngDir),
    ...readSkillDirCommands(upstreamProdDir),
  };
  const upstreamCommandConfigs = buildCommandConfigs(upstreamCommandsRaw);

  // ── Karpathy principles ───────────────────────────────────────
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
