/**
 * filter-agent.ts
 * Filters dual-platform annotated .md files for a specific platform.
 *
 * Usage: bun run scripts/filter-agent.ts <input.md> <platform> <output.md>
 * Platforms: opencode | codex
 *
 * Markers:
 *   <!-- OP_ONLY --> ... <!-- /OP_ONLY -->  → included only in OpenCode output
 *   <!-- CDX_ONLY --> ... <!-- /CDX_ONLY --> → included only in Codex output
 */

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: filter-agent.ts <input.md> <opencode|codex> <output.md>");
  process.exit(1);
}

const [inputPath, platform, outputPath] = args;
const content = require("fs").readFileSync(inputPath, "utf8");
const fs = require("fs");

let result = content;

if (platform === "opencode") {
  // Remove all CDX_ONLY blocks
  result = result.replace(/<!--\s*CDX_ONLY\s*-->[\s\S]*?<!--\s*\/CDX_ONLY\s*-->/g, "");
  // Remove the OP_ONLY markers but keep the content
  result = result.replace(/<!--\s*OP_ONLY\s*-->\n?/g, "");
  result = result.replace(/\n?<!--\s*\/OP_ONLY\s*-->/g, "");
} else if (platform === "codex") {
  // Remove all OP_ONLY blocks
  result = result.replace(/<!--\s*OP_ONLY\s*-->[\s\S]*?<!--\s*\/OP_ONLY\s*-->/g, "");
  // Remove the CDX_ONLY markers but keep the content
  result = result.replace(/<!--\s*CDX_ONLY\s*-->\n?/g, "");
  result = result.replace(/\n?<!--\s*\/CDX_ONLY\s*-->/g, "");
} else {
  console.error("Platform must be 'opencode' or 'codex'");
  process.exit(1);
}

fs.mkdirSync(require("path").dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, result, "utf8");
console.log(`[filter-agent] Generated ${platform} version → ${outputPath}`);
