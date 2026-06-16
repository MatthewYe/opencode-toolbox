import fs from "node:fs";
import path from "node:path";
import { readMarkdownConfigs, getPackageRoot } from "./shared.js";

const ROOT = getPackageRoot();

// ── Plugin manifest ─────────────────────────────────────────────

function generatePluginJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return {
    name: "autopilot-toolkit",
    version: pkg.version,
    description: "Autopilot development toolkit — skills, agents, and commands for autonomous development workflows",
    author: { name: "Matthew Ye", url: "https://github.com/MatthewYe" },
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
      defaultPrompt: [
        "Run the autopilot on my issue",
        "Review this code with TDD discipline",
        "Set up autopilot toolkit for this project",
      ],
    },
  };
}

// ── Command → Skill bridges ─────────────────────────────────────

const SKILL_NAME_COLLISIONS: Record<string, string> = {
  "audit-autopilot": "autopilot-audit",
  "git-guardrails": "git-guardrails-cmd",
  "skill-creator": "skill-creator-cmd",
  teach: "teach-cmd",
  autopilot: "autopilot",
};

function buildCommandBridges() {
  const commandsDir = path.join(ROOT, "commands");
  if (!fs.existsSync(commandsDir)) return;
  const commands = readMarkdownConfigs(commandsDir);
  console.log(`  Found ${Object.keys(commands).length} commands`);
  for (const [cmdName, entry] of Object.entries(commands)) {
    const skillName = SKILL_NAME_COLLISIONS[cmdName] ?? cmdName;
    const skillDir = path.join(ROOT, "skills", skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    const desc = entry.description || `Execute the ${cmdName} workflow`;
    fs.writeFileSync(path.join(skillDir, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: ${desc}\n---\n\n${entry.prompt}\n`, "utf8");
    console.log(`  Generated skill bridge: skills/${skillName}/SKILL.md`);
  }
}

// ── Upstream skill copies ───────────────────────────────────────

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}


function copyUpstreamSkills() {
  const upstreamDir = path.join(ROOT, "upstream", "skills");
  if (!fs.existsSync(upstreamDir)) {
    console.log("  No upstream/skills/, skipping.");
    return;
  }

  // Clean old upstream symlinks
  for (const name of fs.readdirSync(path.join(ROOT, "skills"))) {
    const p = path.join(ROOT, "skills", name);
    try { if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p); } catch {}
  }

  for (const cat of fs.readdirSync(upstreamDir, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name === "deprecated") continue;
    for (const sk of fs.readdirSync(path.join(upstreamDir, cat.name), { withFileTypes: true })) {
      if (!sk.isDirectory()) continue;
      const srcDir = path.join(upstreamDir, cat.name, sk.name);
      const skillMd = path.join(srcDir, "SKILL.md");
      const destDir = path.join(ROOT, "skills", sk.name);
      try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
      copyDir(srcDir, destDir);
      console.log(`  Copied upstream: skills/${sk.name}`);
    }
  }
}

// ── Agent .toml generation ──────────────────────────────────────

function escapeToml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildAgentTomls() {
  const agentsDir = path.join(ROOT, "agents");
  if (!fs.existsSync(agentsDir)) return;
  const agents = readMarkdownConfigs(agentsDir);
  const tomlDir = path.join(ROOT, "templates", "agents");
  fs.mkdirSync(tomlDir, { recursive: true });
  for (const [name, entry] of Object.entries(agents)) {
    const toml = `name = "${name}"\ndescription = "${escapeToml(entry.description || "")}"\ndeveloper_instructions = """\n${entry.prompt}\n"""\n`;
    fs.writeFileSync(path.join(tomlDir, `${name}.toml`), toml, "utf8");
    console.log(`  Generated agent .toml: templates/agents/${name}.toml`);
  }
}

// ── Templates ───────────────────────────────────────────────────

function buildTemplates() {
  const tplDir = path.join(ROOT, "templates");
  fs.mkdirSync(tplDir, { recursive: true });
  const principlesPath = path.join(ROOT, "principles", "karpathy-primary.md");
  if (fs.existsSync(principlesPath)) {
    const principles = fs.readFileSync(principlesPath, "utf8");
    fs.writeFileSync(path.join(tplDir, "AGENTS.md"),
      `# Autopilot Toolkit — Karpathy Coding Principles\n\n${principles}\n`, "utf8");
    console.log("  Generated templates/AGENTS.md");
  }
}

// ── Main ────────────────────────────────────────────────────────

function main() {
  console.log("Generating Codex plugin artifacts...\n");

  const codexDir = path.join(ROOT, ".codex-plugin");
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, "plugin.json"), JSON.stringify(generatePluginJson(), null, 2) + "\n", "utf8");
  console.log("  Generated .codex-plugin/plugin.json\n");

  buildCommandBridges();
  console.log("");
  copyUpstreamSkills();
  buildAgentTomls();
  buildTemplates();

  console.log("\nCodex plugin artifacts generated successfully.");
}

main();
