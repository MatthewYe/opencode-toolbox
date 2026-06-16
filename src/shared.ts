import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// ── Types ─────────────────────────────────────────────────────────

export interface FrontmatterEntry {
  prompt: string;
  [key: string]: unknown;
}

export interface AgentConfig {
  prompt: string;
  [key: string]: unknown;
}

export interface CommandConfig {
  template: string;
  args?: unknown;
  [key: string]: unknown;
}

// ── Karpathy Principles ───────────────────────────────────────────

export interface PrincipleSections {
  v1Coding: string;
  v1Judging: string;
  v1Analyzing: string;
  v2: string;
  v3: string;
  v4: string;
}

export function parsePrinciples(content: string): PrincipleSections {
  const sections: Record<string, string> = {};
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

export const AGENT_PRINCIPLE_MAP: Record<string, (keyof PrincipleSections)[]> = {
  implementer: ["v1Coding", "v2", "v3", "v4"],
  general: ["v1Coding", "v2", "v3", "v4"],
  reviewer: ["v1Judging", "v2", "v4"],
  argus: ["v1Analyzing", "v2", "v4"],
};

export const HEADER_TEMPLATES: Record<string, string> = {
  v1Coding: "## Principle 1: Think Before Coding",
  v1Judging: "## Principle 1: Think Before Judging",
  v1Analyzing: "## Principle 1: Think Before Analyzing",
  v2: "## Principle 2: Simplicity First",
  v3: "## Principle 3: Surgical Changes",
  v4: "## Principle 4: Goal-Driven Execution",
};

export function buildPrinciplesBlock(sections: PrincipleSections, agentName: string): string {
  const keys = AGENT_PRINCIPLE_MAP[agentName];
  if (!keys || keys.length === 0) return "";

  const blocks = keys.map((key) => {
    const header = HEADER_TEMPLATES[key];
    const body = sections[key] ?? "";
    return `${header}\n\n${body}`;
  });
  return `# Andrej Karpathy's Coding Principles\n\n${blocks.join("\n\n")}\n\n---\n\n`;
}

// ── Content Loading ───────────────────────────────────────────────

export function readMarkdownConfigs(dirPath: string): Record<string, FrontmatterEntry> {
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

export function buildAgentConfigs(raw: Record<string, FrontmatterEntry>): Record<string, AgentConfig> {
  const configs: Record<string, AgentConfig> = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, ...rest } = def;
    configs[name] = { ...rest, prompt };
  }
  return configs;
}

export function buildCommandConfigs(raw: Record<string, FrontmatterEntry>): Record<string, CommandConfig> {
  const configs: Record<string, CommandConfig> = {};
  for (const [name, def] of Object.entries(raw)) {
    const { prompt, arguments: args, ...rest } = def;
    const cmd: CommandConfig = { ...rest, template: prompt };
    if (args) cmd.args = args;
    configs[name] = cmd;
  }
  return configs;
}

export function readSkillDirCommands(dirPath: string): Record<string, FrontmatterEntry> {
  const result: Record<string, FrontmatterEntry> = {};
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dirPath, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const raw = fs.readFileSync(skillFile, "utf8");
    const { data } = matter(raw);
    const name = data.name || entry.name;
    const description = data.description || "";
    const template = `Load the '${name}' skill and follow its instructions.`;

    result[name] = { description, prompt: template };
  }
  return result;
}

/** Returns the absolute path to the package root directory. */
export function getPackageRoot(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}
