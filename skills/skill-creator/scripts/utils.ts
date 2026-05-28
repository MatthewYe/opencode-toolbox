import { readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK_STYLES = new Set([">", "|", ">-", "|-"]);

function stripQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, "");
}

/**
 * Parses a SKILL.md file's YAML frontmatter manually (no YAML library).
 * Returns the parsed name, description, and the full file content.
 */
export function parseSkillMd(skillPath: string): {
  name: string;
  description: string;
  fullContent: string;
} {
  const content = readFileSync(join(skillPath, "SKILL.md"), "utf-8");
  const lines = content.split("\n");

  if (lines[0].trim() !== "---") {
    throw new Error("SKILL.md missing frontmatter (no opening ---)");
  }

  // Find closing ---
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    throw new Error("SKILL.md missing frontmatter (no closing ---)");
  }

  let name = "";
  let description = "";
  const frontmatterLines = lines.slice(1, endIdx);
  let i = 0;

  while (i < frontmatterLines.length) {
    const line = frontmatterLines[i];
    if (line.startsWith("name:")) {
      name = stripQuotes(line.slice("name:".length).trim());
    } else if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trim();
      if (BLOCK_STYLES.has(value)) {
        const continuationLines: string[] = [];
        i++;
        while (
          i < frontmatterLines.length &&
          (frontmatterLines[i].startsWith("  ") ||
            frontmatterLines[i].startsWith("\t"))
        ) {
          continuationLines.push(frontmatterLines[i].trim());
          i++;
        }
        description = continuationLines.join(" ");
        continue;
      } else {
        description = stripQuotes(value);
      }
    }
    i++;
  }

  return { name, description, fullContent: content };
}

// CLI entry point: when run directly with `bun run utils.ts`
if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: bun run utils.ts <path-to-skill-dir>");
    process.exit(1);
  }
  const result = parseSkillMd(path);
  console.log(JSON.stringify(result));
}
