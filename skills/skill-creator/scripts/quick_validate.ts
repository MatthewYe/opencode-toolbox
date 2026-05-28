import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "int";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "object") return "dict";
  return typeof value;
}

export function validateSkill(skillPath: string): {
  valid: boolean;
  message: string;
} {
  // Check SKILL.md exists
  const skillMd = join(skillPath, "SKILL.md");
  if (!existsSync(skillMd)) {
    return { valid: false, message: "SKILL.md not found" };
  }

  // Read content
  const content = readFileSync(skillMd, "utf-8");

  // Check for YAML frontmatter markers (matching Python's strict checks)
  if (!content.startsWith("---")) {
    return { valid: false, message: "No YAML frontmatter found" };
  }

  // Python regex: re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
  // Match: starts with ---\n, then any content, then \n---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { valid: false, message: "Invalid frontmatter format" };
  }

  // Parse frontmatter with gray-matter
  let frontmatter: Record<string, unknown>;
  try {
    const parsed = matter(content);
    frontmatter = parsed.data as Record<string, unknown>;

    // Check if it's a dict (object) — not a list, null, or primitive
    if (
      frontmatter === null ||
      Array.isArray(frontmatter) ||
      typeof frontmatter !== "object"
    ) {
      return {
        valid: false,
        message: "Frontmatter must be a YAML dictionary",
      };
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { valid: false, message: `Invalid YAML in frontmatter: ${errMsg}` };
  }

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(frontmatter).filter(
    (k) => !ALLOWED_PROPERTIES.has(k),
  );
  if (unexpectedKeys.length > 0) {
    const sortedUnexpected = [...unexpectedKeys].sort().join(", ");
    const sortedAllowed = [...ALLOWED_PROPERTIES].sort().join(", ");
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${sortedUnexpected}. Allowed properties are: ${sortedAllowed}`,
    };
  }

  // Check required fields
  if (!("name" in frontmatter)) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!("description" in frontmatter)) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  // Validate name
  const name = frontmatter.name;
  if (typeof name !== "string") {
    return {
      valid: false,
      message: `Name must be a string, got ${typeName(name)}`,
    };
  }
  const trimmedName = name.trim();
  if (trimmedName) {
    if (!/^[a-z0-9-]+$/.test(trimmedName)) {
      return {
        valid: false,
        message: `Name '${trimmedName}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (trimmedName.startsWith("-") || trimmedName.endsWith("-") || trimmedName.includes("--")) {
      return {
        valid: false,
        message: `Name '${trimmedName}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    if (trimmedName.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${trimmedName.length} characters). Maximum is 64 characters.`,
      };
    }
  }

  // Validate description
  const description = frontmatter.description;
  if (typeof description !== "string") {
    return {
      valid: false,
      message: `Description must be a string, got ${typeName(description)}`,
    };
  }
  const trimmedDesc = description.trim();
  if (trimmedDesc) {
    if (trimmedDesc.includes("<") || trimmedDesc.includes(">")) {
      return {
        valid: false,
        message: "Description cannot contain angle brackets (< or >)",
      };
    }
    if (trimmedDesc.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${trimmedDesc.length} characters). Maximum is 1024 characters.`,
      };
    }
  }

  // Validate compatibility (optional)
  if ("compatibility" in frontmatter) {
    const compatibility = frontmatter.compatibility;
    if (compatibility !== null && compatibility !== undefined) {
      if (typeof compatibility !== "string") {
        return {
          valid: false,
          message: `Compatibility must be a string, got ${typeName(compatibility)}`,
        };
      }
      if (compatibility.length > 500) {
        return {
          valid: false,
          message: `Compatibility is too long (${compatibility.length} characters). Maximum is 500 characters.`,
        };
      }
    }
  }

  return { valid: true, message: "Skill is valid!" };
}

// CLI entry point: when run directly with `bun run quick_validate.ts`
if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: bun run quick_validate.ts <skill_directory>");
    process.exit(1);
  }
  const result = validateSkill(path);
  console.log(result.message);
  process.exit(result.valid ? 0 : 1);
}
