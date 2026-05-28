import { describe, it, expect } from "bun:test";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { generateHtml } from "../generate_report";
import type { LoopData } from "../generate_report";

const FIXTURES_DIR = join(import.meta.dir, "..", "__fixtures__");
const SCRIPTS_DIR = join(import.meta.dir, "..");

function loadFixture(name: string): LoopData {
  const raw = readFileSync(join(FIXTURES_DIR, name), "utf-8");
  return JSON.parse(raw) as LoopData;
}

// --- Cycle 1: Tracer bullet — basic output structure ---

describe("generateHtml (basic structure)", () => {
  it("returns non-empty string with <table> element", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<table>");
    expect(html).toContain("</html>");
  });

  it("renders the number of history iterations as table rows", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    // 2 history entries → 2 rows inside <tbody>
    const tbodyMatch = html.match(/<tbody>(.*?)<\/tbody>/s);
    expect(tbodyMatch).not.toBeNull();
    const rows = tbodyMatch![1].match(/<tr/g);
    expect(rows?.length).toBe(2);
  });

  it("renders the query column headers for train queries", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    expect(html).toContain("trigger me");
    expect(html).toContain("ignore me");
  });

  it("renders summary section with original and best descriptions", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    expect(html).toContain("Original skill desc");
    expect(html).toContain("Best skill desc");
  });

  it("renders per-query pass/fail with correct CSS classes", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    // Iteration 1: first query passes (green check), second fails (red cross)
    expect(html).toContain('class="result pass"');
    expect(html).toContain('class="result fail"');
    expect(html).toContain("✓");
    expect(html).toContain("✗");
  });

  it("highlights best iteration row with best-row class", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data);
    expect(html).toContain('class="best-row"');
  });
});

// --- Cycle 2: Train+test split (holdout) ---

describe("generateHtml (holdout split)", () => {
  it("renders test column headers when test_results exist", () => {
    const data = loadFixture("report-holdout.json");
    const html = generateHtml(data);
    expect(html).toContain("test a");
    expect(html).toContain("test b");
    expect(html).toContain("test c");
    // Test columns have test-col class
    expect(html).toContain('class="test-col');
  });

  it("renders test results with td.test-result CSS class", () => {
    const data = loadFixture("report-holdout.json");
    const html = generateHtml(data);
    expect(html).toContain("test-result");
  });

  it("selects best iteration by test_passed score when test queries exist", () => {
    const data = loadFixture("report-holdout.json");
    const html = generateHtml(data);
    // Best test_passed is 2 (iteration 2 and 3 both have 2); max picks iteration 3
    // The best-row class should appear on iteration with highest test_passed
    expect(html).toContain('class="best-row"');
    // Count only one row has best-row
    const bestRowMatches = html.match(/class="best-row"/g);
    expect(bestRowMatches?.length).toBe(1);
  });

  it("shows (test) label in Best Score when test data exists", () => {
    const data = loadFixture("report-holdout.json");
    const html = generateHtml(data);
    expect(html).toContain("(test)");
  });
});

// --- Cycle 3: Options (autoRefresh, skillName) ---

describe("generateHtml (options)", () => {
  it("adds meta refresh tag when autoRefresh is true", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data, { autoRefresh: true });
    expect(html).toContain('<meta http-equiv="refresh" content="5">');
  });

  it("does not add meta refresh tag when autoRefresh is false", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data, { autoRefresh: false });
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("includes skill name in title when skillName is set", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data, { skillName: "My Skill" });
    expect(html).toContain("<title>My Skill \u2014 Skill Description Optimization</title>");
    expect(html).toContain("<h1>My Skill \u2014 Skill Description Optimization</h1>");
  });

  it("handles special HTML characters in skill name", () => {
    const data = loadFixture("report-simple.json");
    const html = generateHtml(data, { skillName: "My <Skill> & Co." });
    expect(html).toContain("My &lt;Skill&gt; &amp; Co.");
  });
});

// --- CLI integration tests (import.meta.main block) ---

describe("CLI (import.meta.main)", () => {
  const reportSimplePath = join(FIXTURES_DIR, "report-simple.json");

  it("reads input file from positional arg and produces HTML on stdout", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "generate_report.ts"), reportSimplePath],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<!DOCTYPE html>");
    expect(result.stdout).toContain("<table>");
    expect(result.stdout).toContain("</html>");
  });

  it("reads from stdin when '-' is passed as input arg", () => {
    const fixtureContent = readFileSync(reportSimplePath, "utf-8");
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "generate_report.ts"), "-"],
      { encoding: "utf-8", input: fixtureContent },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<!DOCTYPE html>");
    expect(result.stdout).toContain("<table>");
  });

  it("writes HTML to file when -o is provided and prints status to stderr", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "genreport-test-"));
    const outPath = join(tmpDir, "output.html");
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "generate_report.ts"), reportSimplePath, "-o", outPath],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(`Report written to ${outPath}`);
      // Verify output file contains valid HTML
      const html = readFileSync(outPath, "utf-8");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<table>");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prints usage to stderr and exits 1 when no input is provided", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "generate_report.ts")],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("includes skill name in HTML when --skill-name is set", () => {
    const result = spawnSync(
      "bun",
      ["run", join(SCRIPTS_DIR, "generate_report.ts"), reportSimplePath, "--skill-name", "My Skill"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("My Skill");
  });

  it("writes to file when --output long form is used", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "genreport-test-"));
    const outPath = join(tmpDir, "output.html");
    try {
      const result = spawnSync(
        "bun",
        ["run", join(SCRIPTS_DIR, "generate_report.ts"), reportSimplePath, "--output", outPath],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(`Report written to ${outPath}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
