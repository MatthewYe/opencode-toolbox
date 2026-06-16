import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { readMarkdownConfigs, getPackageRoot } from "./shared.js";

const ROOT = getPackageRoot();

// ── Plugin manifest ───────────────────────────────────────────────

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: { name: string; url: string };
  homepage: string;
  repository: string;
  license: string;
  keywords: string[];
  skills: string;
  interface: {
    displayName: string;
    shortDescription: string;
    longDescription: string;
    developerName: string;
    category: string;
    capabilities: string[];
    websiteURL: string;
    privacyPolicyURL: string;
    termsOfServiceURL: string;
    brandColor: string;
  };
}

function generatePluginJson(): PluginManifest {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  return {
    name: "autopilot-toolkit",
    version: pkg.version,
    description: "Autopilot development toolkit — skills, agents, and commands for autonomous development workflows",
    author: {
      name: "Matthew Ye",
      url: "https://github.com/MatthewYe",
    },
    homepage: "https://github.com/MatthewYe/autopilot-toolkit",
    repository: "https://github.com/MatthewYe/autopilot-toolkit",
    license: "MIT",
    keywords: ["autopilot", "agent", "tdd", "code-review", "development-workflow"],
    skills: "./skills/",
    interface: {
      displayName: "Autopilot Toolkit",
      shortDescription: "Autonomous development workflow with TDD agents",
      longDescription: "Skills, agents, and commands for autonomous development workflows. Includes implementer, reviewer, and autopilot orchestrator agents following TDD discipline with Karpathy coding principles.",
      developerName: "Matthew Ye",
      category: "Developer Tools",
      capabilities: ["Interactive", "Write"],
      websiteURL: "https://github.com/MatthewYe/autopilot-toolkit",
      privacyPolicyURL: "https://github.com/MatthewYe/autopilot-toolkit",
      termsOfServiceURL: "https://github.com/MatthewYe/autopilot-toolkit",
      brandColor: "#6366F1",
    },
  };
}

// ── Command → Skill bridge ────────────────────────────────────────

const SKILL_NAME_COLLISIONS: Record<string, string> = {
  "audit-autopilot": "autopilot-audit",
  "git-guardrails": "git-guardrails-cmd",
  "skill-creator": "skill-creator-cmd",
  teach: "teach-cmd",
  autopilot: "autopilot",
};

function generateCommandSkillBridge(cmdName: string, entry: { description?: string; prompt: string }): void {
  const skillName = SKILL_NAME_COLLISIONS[cmdName] ?? cmdName;
  const skillDir = path.join(ROOT, "skills", skillName);
  fs.mkdirSync(skillDir, { recursive: true });

  const description = entry.description || `Execute the ${cmdName} workflow`;

  const skillContent = `---
name: ${skillName}
description: ${description}
---

${entry.prompt}
`;

  const skillPath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillPath, skillContent, "utf8");
  console.log(`  Generated skill bridge: skills/${skillName}/SKILL.md`);
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  console.log("Generating Codex plugin artifacts...\n");

  // 1. Generate .codex-plugin/plugin.json
  const codexPluginDir = path.join(ROOT, ".codex-plugin");
  fs.mkdirSync(codexPluginDir, { recursive: true });

  const manifest = generatePluginJson();
  fs.writeFileSync(
    path.join(codexPluginDir, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log("  Generated .codex-plugin/plugin.json\n");

  // 2. Generate command → skill bridges
  const commandsDir = path.join(ROOT, "commands");
  if (fs.existsSync(commandsDir)) {
    const commands = readMarkdownConfigs(commandsDir);
    console.log(`  Found ${Object.keys(commands).length} commands\n`);

    for (const [cmdName, entry] of Object.entries(commands)) {
      generateCommandSkillBridge(cmdName, entry);
    }
  }

  // 3. Generate templates/AGENTS.md if it doesn't exist
  const templatesDir = path.join(ROOT, "templates");
  fs.mkdirSync(templatesDir, { recursive: true });
  const agentsMdPath = path.join(templatesDir, "AGENTS.md");

  const principlesPath = path.join(ROOT, "principles", "karpathy-primary.md");
  if (fs.existsSync(principlesPath)) {
    const principles = fs.readFileSync(principlesPath, "utf8");
    const agentsContent = `# Autopilot Toolkit — Karpathy Coding Principles\n\n${principles}\n`;
    fs.writeFileSync(agentsMdPath, agentsContent, "utf8");
    console.log("  Generated templates/AGENTS.md\n");
  }

  console.log("Codex plugin artifacts generated successfully.");
}

main();
