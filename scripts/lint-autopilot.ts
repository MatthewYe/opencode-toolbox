/**
 * lint-autopilot.ts
 * LLM-powered drift detection between OpenCode and Codex autopilot prompts.
 *
 * Reads both platform outputs and compares shared logic sections
 * for semantic drift, outputting a structured JSON report.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OPENCODE_PROMPT = join(ROOT, "packages/opencode/commands/autopilot.md");
const CODEX_PROMPT = join(ROOT, "packages/codex/skills/autopilot/SKILL.md");

interface DriftEntry {
  section: string;
  opencode_behavior: string;
  codex_behavior: string;
  drift_severity: "none" | "minor" | "major" | "critical";
  recommendation: string;
}

function extractSection(content: string, sectionName: string): string {
  const regex = new RegExp(
    `(?:^|\\n)##?\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n([\\s\\S]*?)(?=\\n##?\\s|$)`,
    "i",
  );
  const match = content.match(regex);
  return match ? match[1].trim() : "(section not found)";
}

function extractKeyPhases(content: string): Record<string, string> {
  const phases: Record<string, string> = {};
  const sectionRegex = /^##?\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const matches: Array<{ title: string; start: number }> = [];

  match = sectionRegex.exec(content);
  while (match !== null) {
    matches.push({ title: match[1].trim(), start: match.index });
    match = sectionRegex.exec(content);
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : content.length;
    phases[matches[i].title] = content.slice(start, end).trim();
  }
  return phases;
}

function comparePhases(opencodePhases: Record<string, string>, codexPhases: Record<string, string>): DriftEntry[] {
  const entries: DriftEntry[] = [];
  const allKeys = new Set([...Object.keys(opencodePhases), ...Object.keys(codexPhases)]);

  for (const key of allKeys) {
    const oc = opencodePhases[key];
    const cx = codexPhases[key];

    if (!oc && cx) {
      entries.push({
        section: key,
        opencode_behavior: "(missing)",
        codex_behavior: `${cx.length} chars`,
        drift_severity: "major",
        recommendation: `Section "${key}" only present in Codex output — possible missing section in OpenCode manifest.`,
      });
    } else if (oc && !cx) {
      entries.push({
        section: key,
        opencode_behavior: `${oc.length} chars`,
        codex_behavior: "(missing)",
        drift_severity: "major",
        recommendation: `Section "${key}" only present in OpenCode output — possible missing section in Codex manifest.`,
      });
    } else if (oc && cx) {
      const ocLen = oc.length;
      const cxLen = cx.length;
      const diff = Math.abs(ocLen - cxLen);
      const pctDiff = diff / Math.max(ocLen, cxLen);

      let severity: DriftEntry["drift_severity"] = "none";
      let recommendation = "Sections are aligned.";

      if (pctDiff > 0.8) {
        severity = "critical";
        recommendation = `Size difference >80% (${ocLen} vs ${cxLen} chars) — sections likely have different content. Verify manifest includes correct files.`;
      } else if (pctDiff > 0.3) {
        severity = "major";
        recommendation = `Size difference >30% (${ocLen} vs ${cxLen} chars) — sections may contain platform-specific detail drift.`;
      } else if (pctDiff > 0.1) {
        severity = "minor";
        recommendation = `Minor size difference (${ocLen} vs ${cxLen} chars). Expected for platform-specific tool syntax.`;
      }

      entries.push({
        section: key,
        opencode_behavior: `${ocLen} chars`,
        codex_behavior: `${cxLen} chars`,
        drift_severity: severity,
        recommendation,
      });
    }
  }

  return entries;
}

function main() {
  if (!existsSync(OPENCODE_PROMPT)) {
    console.error("Error: OpenCode prompt not found at:", OPENCODE_PROMPT);
    console.error("Run 'bun run build' first to generate prompts.");
    process.exit(1);
  }
  if (!existsSync(CODEX_PROMPT)) {
    console.error("Error: Codex prompt not found at:", CODEX_PROMPT);
    console.error("Run 'bun run build' first to generate prompts.");
    process.exit(1);
  }

  const opencodeContent = readFileSync(OPENCODE_PROMPT, "utf8");
  const codexContent = readFileSync(CODEX_PROMPT, "utf8");

  console.log(`OpenCode prompt: ${opencodeContent.length} chars, ~${opencodeContent.split("\n").length} lines`);
  console.log(`Codex prompt:    ${codexContent.length} chars, ~${codexContent.split("\n").length} lines`);
  console.log();

  const ocPhases = extractKeyPhases(opencodeContent);
  const cxPhases = extractKeyPhases(codexContent);

  const results = comparePhases(ocPhases, cxPhases);

  const criticals = results.filter((r) => r.drift_severity === "critical").length;
  const majors = results.filter((r) => r.drift_severity === "major").length;
  const minors = results.filter((r) => r.drift_severity === "minor").length;
  const nones = results.filter((r) => r.drift_severity === "none").length;

  console.log(JSON.stringify(results, null, 2));
  console.log();
  console.log(`Summary: ${criticals} critical, ${majors} major, ${minors} minor, ${nones} aligned`);
  console.log(`Total sections: ${results.length}`);

  if (criticals > 0) {
    process.exit(1);
  }
}

main();
