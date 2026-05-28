import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseSkillMd } from "../utils";

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-test-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe("parseSkillMd", () => {
  // --- Tracer bullet: valid frontmatter ---
  it("parses name from valid frontmatter", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill
---
# Content
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("test-skill");
    } finally {
      cleanup(dir);
    }
  });

  // --- Simple description ---
  it("parses description from valid frontmatter", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: test-skill
description: A test skill for validation
compatibility: "1.0"
---
# Test Skill
Some content here.
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("test-skill");
      expect(result.description).toBe("A test skill for validation");
    } finally {
      cleanup(dir);
    }
  });

  // --- Block-style description (|) ---
  it("parses block-style (|) description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: block-skill
description: |
  This is a block description
  with multiple lines
  that are indented.
compatibility: "2.0"
---
# Block Skill
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("block-skill");
      expect(result.description).toBe(
        "This is a block description with multiple lines that are indented.",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Other block styles ---
  it("parses block-style (>) description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: gt-skill
description: >
  This is a folded block
  with multiple lines
  that should be joined.
---
# GT Skill
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("gt-skill");
      expect(result.description).toBe(
        "This is a folded block with multiple lines that should be joined.",
      );
    } finally {
      cleanup(dir);
    }
  });

  it("parses block-style (|-) description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: bar-skill
description: |-
  Strip trailing newline
  version of literal block.
---
# Bar
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("bar-skill");
      expect(result.description).toBe(
        "Strip trailing newline version of literal block.",
      );
    } finally {
      cleanup(dir);
    }
  });

  it("parses block-style (>-) description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: gtbar-skill
description: >-
  Strip trailing newline
  version of folded block.
---
# GTBar
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("gtbar-skill");
      expect(result.description).toBe(
        "Strip trailing newline version of folded block.",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Missing fields ---
  it("returns empty string for missing fields", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: only-name
---
# Only Name
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("only-name");
      expect(result.description).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  // --- Empty description ---
  it("returns empty string for empty description value", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: empty-skill
description:
---
# Empty Skill
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("empty-skill");
      expect(result.description).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  // --- Malformed: no opening ---
  it("throws for missing opening frontmatter marker", () => {
    const dir = makeFixture({
      "SKILL.md": `name: bad
description: bad
---
# Bad
`,
    });
    try {
      expect(() => parseSkillMd(dir)).toThrow(
        "SKILL.md missing frontmatter (no opening ---)",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Malformed: no closing ---
  it("throws for missing closing frontmatter marker", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: bad
description: bad
`,
    });
    try {
      expect(() => parseSkillMd(dir)).toThrow(
        "SKILL.md missing frontmatter (no closing ---)",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Full content return ---
  it("returns full file content as fullContent", () => {
    const content = `---
name: full-test
description: Full content test
---
# Full Content Body
Some text here.
`;
    const dir = makeFixture({ "SKILL.md": content });
    try {
      const result = parseSkillMd(dir);
      expect(result.fullContent).toBe(content);
    } finally {
      cleanup(dir);
    }
  });

  // --- Tab-indented block ---
  it("handles tab-indented block description", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: tab-skill
description: |
\tTab indented line 1
\tTab indented line 2
---
# Tab
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("tab-skill");
      expect(result.description).toBe(
        "Tab indented line 1 Tab indented line 2",
      );
    } finally {
      cleanup(dir);
    }
  });

  // --- Empty block description ---
  it("handles block marker with no continuation lines", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: empty-block-skill
description: |
---
# Empty Block
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("empty-block-skill");
      expect(result.description).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  // --- Quote-stripping on name ---
  it("strips quotes from name value", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: "quoted-skill"
description: Some desc
---
# Content
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("quoted-skill");
    } finally {
      cleanup(dir);
    }
  });

  it("strips single quotes from name value", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: 'single-quoted'
description: Some desc
---
# Content
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("single-quoted");
    } finally {
      cleanup(dir);
    }
  });

  // --- Multi-quote stripping: /^["']|["']$/g only strips one per side;
  //     Python .strip('"').strip("'") strips ALL consecutive quotes.
  it("strips multiple consecutive quotes from name value", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: ""double-quoted""
description: Some desc
---
# Content
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("double-quoted");
    } finally {
      cleanup(dir);
    }
  });

  it("strips multiple consecutive single quotes from name value", () => {
    const dir = makeFixture({
      "SKILL.md": `---
name: ''single-quoted''
description: Some desc
---
# Content
`,
    });
    try {
      const result = parseSkillMd(dir);
      expect(result.name).toBe("single-quoted");
    } finally {
      cleanup(dir);
    }
  });
});
