/**
 * build-autopilot.ts
 * Reads manifest.json and concatenates template files
 * into platform-specific autopilot prompts.
 *
 * Output:
 *   packages/opencode/commands/autopilot.md   (OpenCode)
 *   packages/codex/skills/autopilot/SKILL.md   (Codex)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(import.meta.dir, "..");
const TEMPLATES_DIR = join(ROOT, "packages/core/templates/autopilot");
const MANIFEST_PATH = join(TEMPLATES_DIR, "manifest.json");

const OUTPUTS: Record<string, string> = {
  opencode: join(ROOT, "packages/opencode/commands/autopilot.md"),
  codex: join(ROOT, "packages/codex/skills/autopilot/SKILL.md"),
};

interface Manifest {
  opencode: string[];
  codex: string[];
}

function ensureDir(p: string): void {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

function buildPlatform(platform: "opencode" | "codex", fileList: string[]): string {
  const parts: string[] = [];

  for (const relativePath of fileList) {
    const fullPath = join(TEMPLATES_DIR, relativePath);

    if (!existsSync(fullPath)) {
      throw new Error(
        `Template file not found: ${relativePath}\n` +
        `  Expected at: ${fullPath}\n` +
        `  Platform: ${platform}`
      );
    }

    let content = readFileSync(fullPath, "utf-8");
    parts.push(content);
  }

  return parts.join("");
}

function main(): void {
  // Read manifest
  if (!existsSync(MANIFEST_PATH)) {
    console.error("Error: manifest.json not found at:", MANIFEST_PATH);
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    manifest = JSON.parse(raw);
  } catch (e) {
    console.error("Error: failed to parse manifest.json:", (e as Error).message);
    process.exit(1);
  }

  if (!manifest.opencode || !Array.isArray(manifest.opencode)) {
    console.error("Error: manifest.json missing 'opencode' array");
    process.exit(1);
  }
  if (!manifest.codex || !Array.isArray(manifest.codex)) {
    console.error("Error: manifest.json missing 'codex' array");
    process.exit(1);
  }

  // Build each platform
  for (const platform of ["opencode", "codex"] as const) {
    const outputPath = OUTPUTS[platform];
    ensureDir(dirname(outputPath));

    try {
      const content = buildPlatform(platform, manifest[platform]);
      writeFileSync(outputPath, content, "utf-8");
      console.log(
        `[${platform}] Built ${content.length} bytes → ${outputPath.replace(ROOT + "/", "")}`
      );
    } catch (e) {
      console.error(`[${platform}] Build failed:`, (e as Error).message);
      process.exit(1);
    }
  }

  console.log("\nAutopilot templates built successfully.");
}

main();
