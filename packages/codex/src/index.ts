// Codex plugin entry
// Generates .codex-plugin/plugin.json and .codex/agents/*.toml at build time.
// Skills are copied from workspace root at build time.

import fs from "node:fs";
import path from "node:path";
import { getAgentsDir } from "@matthewye/autopilot-toolkit-core";

const pkgDir = path.resolve(import.meta.dirname, "..");
// Filter platform markers from content
function filterForCodex(content: string): string {
  return content
    .replace(/<!--\s*OP_ONLY\s*-->[\s\S]*?<!--\s*\/OP_ONLY\s*-->/g, "")
    .replace(/<!--\s*CDX_ONLY\s*-->\n?/g, "")
    .replace(/\n?<!--\s*\/CDX_ONLY\s*-->/g, "");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Convert .md agent files to .toml
function mdToToml(mdPath: string, tomlPath: string) {
  let content = fs.readFileSync(mdPath, "utf8");
  content = filterForCodex(content);
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Record<string, string> = {};
  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split("\n")) {
      const eq = line.indexOf(":");
      if (eq > 0) frontmatter[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  const escapedBody = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

  let toml = `name = "${frontmatter.name || "unknown"}"\n`;
  if (frontmatter.description) toml += `description = """${frontmatter.description}"""\n`;
  toml += `mode = "${frontmatter.mode || "subagent"}"\n`;
  toml += `hidden = ${frontmatter.hidden || "false"}\n`;
  toml += `developer_instructions = """${escapedBody}"""\n`;

  ensureDir(path.dirname(tomlPath));
  fs.writeFileSync(tomlPath, toml, "utf8");
}

// Generate plugin.json
function generatePluginJson() {
  const pluginDir = path.resolve(pkgDir, ".codex-plugin");
  ensureDir(pluginDir);
  const pluginJson = {
    name: "@matthewye/autopilot-toolkit-codex",
    version: "1.0.0",
    description: "Autopilot development toolkit for Codex",
    skills: [{ path: "skills" }],
    interface: {
      agents: ".codex/agents",
    },
  };
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(pluginJson, null, 2), "utf8");
}

// Generate .toml agent files
function generateAgentTomls() {
  const agentsDir = getAgentsDir();
  const tomlDir = path.resolve(pkgDir, ".codex", "agents");
  ensureDir(tomlDir);

  const agentFiles = ["implementer", "reviewer", "argus"];
  for (const name of agentFiles) {
    const mdPath = path.join(agentsDir, `${name}.md`);
    const tomlPath = path.join(tomlDir, `${name}.toml`);
    if (fs.existsSync(mdPath)) {
      mdToToml(mdPath, tomlPath);
      console.log(`[codex] Generated ${name}.toml`);
    }
  }
}

generatePluginJson();
generateAgentTomls();

console.log("[codex] Plugin structure generated.");
