import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSkill } from "../quick_validate";

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "qv-test-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe("validateSkill", () => {
  // --- Tracer bullet: valid skill ---
  it("returns valid for a valid skill", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill
compatibility: "1.0"
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Skill is valid!");
    } finally {
      cleanup(dir);
    }
  });

  // --- Missing required fields ---
  it("errors on missing name", () => {
    const dir = makeFixture({
      "SKILL.md": `---
description: has desc but no name
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Missing 'name' in frontmatter");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on missing description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: only-name
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Missing 'description' in frontmatter");
    } finally {
      cleanup(dir);
    }
  });

  // --- Unexpected keys ---
  it("errors on unexpected frontmatter keys", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill
foo: bar
unknown-key: baz
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe(
        "Unexpected key(s) in SKILL.md frontmatter: foo, unknown-key. " +
          "Allowed properties are: allowed-tools, compatibility, description, license, metadata, name",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Name validations ---
  it("errors on name with uppercase", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: Test-Name
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe(
        "Name 'Test-Name' should be kebab-case (lowercase letters, digits, and hyphens only)",
      );
    } finally {
      cleanup(dir);
    }
  });

  it("errors on name starting with hyphen", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: -bad-name
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Name '-bad-name' cannot start/end with hyphen or contain consecutive hyphens");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on name ending with hyphen", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: bad-name-
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Name 'bad-name-' cannot start/end with hyphen or contain consecutive hyphens");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on name with consecutive hyphens", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: bad--name
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Name 'bad--name' cannot start/end with hyphen or contain consecutive hyphens");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on name too long (>64 chars)", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: ${"a".repeat(65)}
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Name is too long (65 characters). Maximum is 64 characters.");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on name that is not a string", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: 123
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Name must be a string, got int");
    } finally {
      cleanup(dir);
    }
  });

  // --- Description validations ---
  it("errors on description with angle brackets", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: Has <angle> brackets
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Description cannot contain angle brackets (< or >)");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on description too long (>1024 chars)", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: ${"x".repeat(1025)}
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Description is too long (1025 characters). Maximum is 1024 characters.");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on description that is not a string", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: 42
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Description must be a string, got int");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on null description (description:)", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description:
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Description must be a string, got NoneType");
    } finally {
      cleanup(dir);
    }
  });

  // --- Compatibility validations ---
  it("errors on compatibility too long (>500 chars)", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill
compatibility: ${"x".repeat(501)}
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Compatibility is too long (501 characters). Maximum is 500 characters.");
    } finally {
      cleanup(dir);
    }
  });

  it("errors on compatibility that is not a string", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill
compatibility: 123
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Compatibility must be a string, got int");
    } finally {
      cleanup(dir);
    }
  });

  // --- Missing SKILL.md ---
  it("errors when SKILL.md is missing", () => {
    const dir = makeFixture({});
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("SKILL.md not found");
    } finally {
      cleanup(dir);
    }
  });

  // --- No frontmatter ---
  it("errors when no frontmatter present", () => {
    const dir = makeFixture({
      "SKILL.md": `# No frontmatter here
Some content.
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("No YAML frontmatter found");
    } finally {
      cleanup(dir);
    }
  });

  // --- Invalid frontmatter format ---
  it("errors when frontmatter has no closing ---", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: bad
description: bad
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Invalid frontmatter format");
    } finally {
      cleanup(dir);
    }
  });

  // --- Frontmatter not a dict ---
  it("errors when frontmatter is a YAML list", () => {
    const dir = makeFixture({
      "SKILL.md": `---
- item1
- item2
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Frontmatter must be a YAML dictionary");
    } finally {
      cleanup(dir);
    }
  });

  // --- Valid edge cases ---
  it("accepts block-style description with no continuation", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: empty-block-skill
description: |
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Skill is valid!");
    } finally {
      cleanup(dir);
    }
  });

  it("accepts name with digits", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill-123
description: Has digits in name
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Skill is valid!");
    } finally {
      cleanup(dir);
    }
  });

  it("accepts empty name (whitespace only)", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: "   "
description: A test skill
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      // empty/whitespace names skip kebab check (TS: if name:)
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Skill is valid!");
    } finally {
      cleanup(dir);
    }
  });

  it("accepts valid block-style description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: block-skill
description: |
  Multi
  line
  desc
---
# Content
`,
    });
    try {
      const result = validateSkill(dir);
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Skill is valid!");
    } finally {
      cleanup(dir);
    }
  });
});
