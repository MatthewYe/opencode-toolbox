import { existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, relative, join, basename, dirname } from "node:path";
import AdmZip from "adm-zip";
import { validateSkill } from "./quick_validate";

/**
 * Exclude patterns matching TypeScript package_skill.ts behavior.
 */
const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules"]);
const EXCLUDE_GLOBS = ["*.pyc"];
const EXCLUDE_FILES = new Set([".DS_Store"]);
// Directories excluded only at the skill root (not when nested deeper).
const ROOT_EXCLUDE_DIRS = new Set(["evals"]);

/**
 * Check if a relative path should be excluded from packaging.
 * relPath is relative to skill_path.parent (e.g., "my-skill/SKILL.md").
 */
export function shouldExclude(relPath: string): boolean {
  const parts = relPath.split("/");
  const name = parts[parts.length - 1];

  // EXCLUDE_DIRS: __pycache__, node_modules anywhere in path
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true;
  }

  // ROOT_EXCLUDE_DIRS: evals only at skill root (parts[1])
  if (parts.length > 1 && ROOT_EXCLUDE_DIRS.has(parts[1])) return true;

  // EXCLUDE_FILES: .DS_Store (anywhere)
  if (EXCLUDE_FILES.has(name)) return true;

  // EXCLUDE_GLOBS: *.pyc
  for (const glob of EXCLUDE_GLOBS) {
    if (name.endsWith(".pyc")) return true;
  }

  return false;
}

/**
 * Package a skill folder into a .skill zip file.
 *
 * @param skillPath - Path to the skill folder.
 * @param outputDir - Optional output directory (defaults to cwd).
 * @returns Path to the created .skill file, or null on error.
 */
export function packageSkill(
  skillPath: string,
  outputDir?: string,
): string | null {
  const resolvedSkillPath = resolve(skillPath);

  if (!existsSync(resolvedSkillPath)) {
    console.error(`Error: Skill folder not found: ${resolvedSkillPath}`);
    return null;
  }

  if (!statSync(resolvedSkillPath).isDirectory()) {
    console.error(`Error: Path is not a directory: ${resolvedSkillPath}`);
    return null;
  }

  const skillMdPath = join(resolvedSkillPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    console.error(`Error: SKILL.md not found in ${resolvedSkillPath}`);
    return null;
  }

  // Run validation before packaging
  console.log("Validating skill...");
  const { valid, message } = validateSkill(resolvedSkillPath);
  if (!valid) {
    console.error(`Validation failed: ${message}`);
    console.error("   Please fix the validation errors before packaging.");
    return null;
  }
  console.log(`  ${message}\n`);

  // Determine output location
  const skillName = basename(resolvedSkillPath);
  const outputPath = outputDir ? resolve(outputDir) : process.cwd();
  mkdirSync(outputPath, { recursive: true });

  const skillFilename = join(outputPath, `${skillName}.skill`);
  const skillParent = resolve(resolvedSkillPath, "..");

  try {
    const zip = new AdmZip();

    // Walk directory recursively (matching Python's rglob('*') + is_file() filter)
    const entries = readdirSync(resolvedSkillPath, {
      recursive: true,
      encoding: "utf-8",
    }) as string[];

    for (const entry of entries) {
      const fullPath = join(resolvedSkillPath, entry);
      // Skip directories (Python: if not file_path.is_file(): continue)
      if (!statSync(fullPath).isFile()) continue;

      // Compute archive name relative to skill_path.parent
      const arcname = relative(skillParent, fullPath);

      if (shouldExclude(arcname)) {
        console.log(`  Skipped: ${arcname}`);
        continue;
      }

      zip.addLocalFile(fullPath, dirname(arcname) + "/", basename(arcname));
      console.log(`  Added: ${arcname}`);
    }

    zip.writeZip(skillFilename);
    console.log(`\nSuccessfully packaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`Error creating .skill file: ${errMsg}`);
    return null;
  }
}

// CLI entry point: when run directly with `bun run package_skill.ts`
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: bun run package_skill.ts <path/to/skill-folder> [output-directory]",
    );
    console.error("\nExample:");
    console.error("  bun run package_skill.ts skills/public/my-skill");
    console.error("  bun run package_skill.ts skills/public/my-skill ./dist");
    process.exit(1);
  }

  const skillPath = args[0];
  const outputDir = args.length > 1 ? args[1] : undefined;

  console.log(`Packaging skill: ${skillPath}`);
  if (outputDir) {
    console.log(`   Output directory: ${outputDir}`);
  }
  console.log();

  const result = packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
}
