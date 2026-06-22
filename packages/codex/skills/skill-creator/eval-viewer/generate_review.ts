/**
 * Generate and serve a review page for eval results.
 *
 * Reads the workspace directory, discovers runs (directories with outputs/),
 * embeds all output data into a self-contained HTML page, and serves it via
 * a tiny HTTP server. Feedback auto-saves to feedback.json in the workspace.
 *
 * Usage:
 *     bun run generate_review.ts <workspace-path> [--port PORT] [--skill-name NAME]
 *     bun run generate_review.ts <workspace-path> --previous-workspace /path/to/old/workspace
 */

import { exec, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, relative, resolve } from "node:path";

const METADATA_FILES = new Set(["transcript.md", "user_notes.md", "metrics.json"]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".sh",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".sql",
  ".r",
  ".toml",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

const MIME_OVERRIDES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface OutputFile {
  name: string;
  type: "text" | "image" | "pdf" | "xlsx" | "binary" | "error";
  content?: string;
  mime?: string;
  data_uri?: string;
  data_b64?: string;
}

export interface Run {
  id: string;
  prompt: string;
  eval_id: number | null;
  outputs: OutputFile[];
  grading: Record<string, unknown> | null;
}

export interface PreviousRun {
  feedback: string;
  outputs: OutputFile[];
}

export interface EmbeddedData {
  skill_name: string;
  runs: Run[];
  previous_feedback: Record<string, string>;
  previous_outputs: Record<string, OutputFile[]>;
  benchmark?: Record<string, unknown>;
}

export function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  if (MIME_OVERRIDES[ext]) return MIME_OVERRIDES[ext];
  // Hand-rolled MIME map (Node.js has no built-in mime DB like Python's mimetypes)
  // Override entries (svg, xlsx, docx, pptx) handled above by MIME_OVERRIDES
  const mimeMap: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".csv": "text/csv",
    ".py": "text/x-python",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".tsx": "text/typescript-jsx",
    ".jsx": "text/jsx",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".xml": "application/xml",
    ".html": "text/html",
    ".css": "text/css",
    ".sh": "text/x-shellscript",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".java": "text/x-java",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
    ".sql": "text/x-sql",
    ".r": "text/x-r",
    ".toml": "application/toml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function findRunsRecursive(root: string, current: string, runs: Run[]): void {
  const stat = statSync(current, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return;

  const outputsDir = join(current, "outputs");
  if (existsSync(outputsDir) && statSync(outputsDir).isDirectory()) {
    const run = buildRun(root, current);
    if (run) runs.push(run);
    return;
  }

  const skip = new Set(["node_modules", ".git", "__pycache__", "skill", "inputs"]);
  const entries = readdirSync(current).sort();
  for (const child of entries) {
    const childPath = join(current, child);
    try {
      if (statSync(childPath).isDirectory() && !skip.has(child)) {
        findRunsRecursive(root, childPath, runs);
      }
    } catch {
      // skip inaccessible
    }
  }
}

export function findRuns(workspace: string): Run[] {
  const runs: Run[] = [];
  findRunsRecursive(workspace, workspace, runs);
  runs.sort((a, b) => {
    const aEval = a.eval_id ?? Infinity;
    const bEval = b.eval_id ?? Infinity;
    if (aEval !== bEval) return aEval - bEval;
    return a.id.localeCompare(b.id);
  });
  return runs;
}

export function buildRun(root: string, runDir: string): Run | null {
  let prompt = "";
  let evalId: number | null = null;

  // Try eval_metadata.json
  for (const candidate of [join(runDir, "eval_metadata.json"), join(runDir, "..", "eval_metadata.json")]) {
    if (existsSync(candidate)) {
      try {
        const metadata = JSON.parse(readFileSync(candidate, "utf-8"));
        prompt = metadata.prompt || "";
        evalId = metadata.eval_id ?? null;
      } catch {
        // ignore parse errors
      }
      if (prompt) break;
    }
  }

  // Fall back to transcript.md
  if (!prompt) {
    for (const candidate of [join(runDir, "transcript.md"), join(runDir, "outputs", "transcript.md")]) {
      if (existsSync(candidate)) {
        try {
          const text = readFileSync(candidate, "utf-8");
          const match = text.match(/## Eval Prompt\n\n([\s\S]*?)(?=\n##|$)/);
          if (match) {
            prompt = match[1].trim();
          }
        } catch {
          // ignore read errors
        }
        if (prompt) break;
      }
    }
  }

  if (!prompt) prompt = "(No prompt found)";

  const relPath = relative(root, runDir);
  const runId = relPath.replace(/\//g, "-").replace(/\\/g, "-");

  // Collect output files
  const outputsDir = join(runDir, "outputs");
  const outputFiles: OutputFile[] = [];
  if (existsSync(outputsDir) && statSync(outputsDir).isDirectory()) {
    const files = readdirSync(outputsDir).sort();
    for (const f of files) {
      const fPath = join(outputsDir, f);
      if (statSync(fPath).isFile() && !METADATA_FILES.has(f)) {
        outputFiles.push(embedFile(fPath));
      }
    }
  }

  // Load grading if present
  let grading: Record<string, unknown> | null = null;
  for (const candidate of [join(runDir, "grading.json"), join(runDir, "..", "grading.json")]) {
    if (existsSync(candidate)) {
      try {
        grading = JSON.parse(readFileSync(candidate, "utf-8"));
      } catch {
        // ignore parse errors
      }
      if (grading) break;
    }
  }

  return {
    id: runId,
    prompt,
    eval_id: evalId,
    outputs: outputFiles,
    grading,
  };
}

export function embedFile(path: string): OutputFile {
  const ext = extname(path).toLowerCase();
  const mime = getMimeType(path);
  const name = basename(path);

  if (TEXT_EXTENSIONS.has(ext)) {
    try {
      const content = readFileSync(path, "utf-8");
      return { name, type: "text", content };
    } catch {
      // Python returns type: "text" with error message for text file read errors
      return { name, type: "text", content: "(Error reading file)" };
    }
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    try {
      const raw = readFileSync(path);
      const b64 = Buffer.from(raw).toString("base64");
      return { name, type: "image", mime, data_uri: `data:${mime};base64,${b64}` };
    } catch {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  if (ext === ".pdf") {
    try {
      const raw = readFileSync(path);
      const b64 = Buffer.from(raw).toString("base64");
      return { name, type: "pdf", data_uri: `data:${mime};base64,${b64}` };
    } catch {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  if (ext === ".xlsx") {
    try {
      const raw = readFileSync(path);
      const b64 = Buffer.from(raw).toString("base64");
      return { name, type: "xlsx", data_b64: b64 };
    } catch {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  // Binary / unknown
  try {
    const raw = readFileSync(path);
    const b64 = Buffer.from(raw).toString("base64");
    return { name, type: "binary", mime, data_uri: `data:${mime};base64,${b64}` };
  } catch {
    return { name, type: "error", content: "(Error reading file)" };
  }
}

export function loadPreviousIteration(workspace: string): Record<string, PreviousRun> {
  const result: Record<string, PreviousRun> = {};

  // Load feedback
  const feedbackMap: Record<string, string> = {};
  const feedbackPath = join(workspace, "feedback.json");
  if (existsSync(feedbackPath)) {
    try {
      const data = JSON.parse(readFileSync(feedbackPath, "utf-8"));
      const reviews = data.reviews || [];
      for (const r of reviews) {
        if (r.feedback?.trim()) {
          feedbackMap[r.run_id] = r.feedback;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Load runs (to get outputs)
  const prevRuns = findRuns(workspace);
  for (const run of prevRuns) {
    result[run.id] = {
      feedback: feedbackMap[run.id] || "",
      outputs: run.outputs || [],
    };
  }

  // Also add feedback for run_ids that had feedback but no matching run
  for (const [runId, fb] of Object.entries(feedbackMap)) {
    if (!result[runId]) {
      result[runId] = { feedback: fb, outputs: [] };
    }
  }

  return result;
}

export function generateHtml(
  runs: Run[],
  skillName: string,
  previous?: Record<string, PreviousRun>,
  benchmark?: Record<string, unknown>,
): string {
  const templatePath = join(import.meta.dir, "viewer.html");
  const template = readFileSync(templatePath, "utf-8");

  // Build previous_feedback and previous_outputs maps for the template
  const previousFeedback: Record<string, string> = {};
  const previousOutputs: Record<string, OutputFile[]> = {};
  if (previous) {
    for (const [runId, data] of Object.entries(previous)) {
      if (data.feedback) previousFeedback[runId] = data.feedback;
      if (data.outputs && data.outputs.length > 0) previousOutputs[runId] = data.outputs;
    }
  }

  const embedded: EmbeddedData = {
    skill_name: skillName,
    runs,
    previous_feedback: previousFeedback,
    previous_outputs: previousOutputs,
  };
  if (benchmark) embedded.benchmark = benchmark;

  // Use Python-style JSON serialization for byte-identical output.
  // Python's json.dumps uses (", ", ": ") as separators; JSON.stringify uses (",", ":").
  const dataJson = pythonJsonDumps(embedded);
  return template.replace("/*__EMBEDDED_DATA__*/", `const EMBEDDED_DATA = ${dataJson};`);
}

/**
 * JSON serializer that matches Python's json.dumps default output:
 *   - "key": "value"  (space after colon)
 *   - {"a": 1, "b": 2}  (space after comma separator)
 *   - null, true, false (lowercase)
 * This ensures byte-identical HTML output with the Python reference implementation.
 */
function pythonJsonDumps(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") {
    if (Number.isFinite(obj)) return String(obj);
    return "null"; // NaN, Infinity → null like Python
  }
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    const items = obj.map((item) => pythonJsonDumps(item));
    return `[${items.join(", ")}]`;
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>);
    const pairs = keys.map((k) => `${JSON.stringify(k)}: ${pythonJsonDumps((obj as Record<string, unknown>)[k])}`);
    return `{${pairs.join(", ")}}`;
  }
  return "null";
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export function killPort(port: number): void {
  try {
    const result = execSync(`lsof -ti :${port}`, { encoding: "utf-8", timeout: 5000 });
    const pids = result.trim().split("\n").filter(Boolean);
    for (const pidStr of pids) {
      try {
        process.kill(parseInt(pidStr.trim(), 10), "SIGTERM");
      } catch {
        // process already gone
      }
    }
    if (result.trim()) {
      // Wait a moment for ports to release (matching Python's time.sleep(0.5))
      execSync("sleep 0.5");
    }
  } catch (e: unknown) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("Note: lsof not found, cannot check if port is in use");
    }
    // timeout or other errors → just continue
  }
}

export interface ServerContext {
  workspace: string;
  skillName: string;
  feedbackPath: string;
  previous: Record<string, PreviousRun>;
  benchmarkPath: string | null;
}

function createHandler(ctx: ServerContext): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      // Regenerate HTML on each request
      const currentRuns = findRuns(ctx.workspace);
      let benchmark: Record<string, unknown> | undefined;
      if (ctx.benchmarkPath && existsSync(ctx.benchmarkPath)) {
        try {
          benchmark = JSON.parse(readFileSync(ctx.benchmarkPath, "utf-8"));
        } catch {
          // ignore
        }
      }
      const html = generateHtml(currentRuns, ctx.skillName, ctx.previous, benchmark);
      const content = Buffer.from(html, "utf-8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(content.length),
      });
      res.end(content);
    } else if (req.method === "GET" && req.url === "/api/feedback") {
      let data: Buffer;
      if (existsSync(ctx.feedbackPath)) {
        data = readFileSync(ctx.feedbackPath);
      } else {
        data = Buffer.from("{}");
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": String(data.length),
      });
      res.end(data);
    } else if (req.method === "POST" && req.url === "/api/feedback") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        let resp: Buffer;
        try {
          const data = JSON.parse(body);
          if (!data || typeof data !== "object" || !("reviews" in data)) {
            throw new Error("Expected JSON object with 'reviews' key");
          }
          writeFileSync(ctx.feedbackPath, `${JSON.stringify(data, null, 2)}\n`);
          resp = Buffer.from('{"ok":true}');
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": String(resp.length),
          });
        } catch (e) {
          resp = Buffer.from(JSON.stringify({ error: String((e as Error).message) }));
          res.writeHead(500, {
            "Content-Type": "application/json",
            "Content-Length": String(resp.length),
          });
        }
        res.end(resp);
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  };
}

export function startServer(options: {
  workspace: string;
  port: number;
  skillName: string;
  feedbackPath: string;
  previous?: Record<string, PreviousRun>;
  benchmarkPath?: string | null;
  onListening?: (url: string, actualPort: number) => void;
}): ReturnType<typeof createServer> {
  const ctx: ServerContext = {
    workspace: options.workspace,
    skillName: options.skillName,
    feedbackPath: options.feedbackPath,
    previous: options.previous || {},
    benchmarkPath: options.benchmarkPath || null,
  };

  const handler = createHandler(ctx);
  const server = createServer(handler);

  server.listen(options.port, "127.0.0.1");

  server.on("listening", () => {
    const addr = server.address();
    const actualPort = addr && typeof addr === "object" ? addr.port : options.port;
    const url = `http://localhost:${actualPort}`;
    if (options.onListening) options.onListening(url, actualPort);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // Port still in use after kill attempt — try ephemeral
      server.listen(0, "127.0.0.1");
    } else {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// CLI entry point: when run directly with `bun run generate_review.ts`
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  let workspace: string | undefined;
  let port = 3117;
  let skillName: string | undefined;
  let previousWorkspace: string | undefined;
  let benchmarkPath: string | undefined;
  let staticOutput: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      port = parseInt(args[++i], 10);
    } else if (arg === "--skill-name" || arg === "-n") {
      skillName = args[++i];
    } else if (arg === "--previous-workspace") {
      previousWorkspace = args[++i];
    } else if (arg === "--benchmark") {
      benchmarkPath = args[++i];
    } else if (arg === "--static" || arg === "-s") {
      staticOutput = args[++i];
    } else if (!arg.startsWith("-")) {
      workspace = arg;
    }
  }

  if (!workspace) {
    console.error("Usage: bun run generate_review.ts <workspace-path> [options]");
    console.error("Options:");
    console.error("  --port, -p <port>              Server port (default: 3117)");
    console.error("  --skill-name, -n <name>        Skill name for header");
    console.error("  --previous-workspace <path>    Previous iteration's workspace");
    console.error("  --benchmark <path>             Path to benchmark.json");
    console.error("  --static, -s <path>            Write standalone HTML to file");
    process.exit(1);
  }

  const resolvedWorkspace = resolve(workspace);

  if (!existsSync(resolvedWorkspace) || !statSync(resolvedWorkspace).isDirectory()) {
    console.error(`Error: ${resolvedWorkspace} is not a directory`);
    process.exit(1);
  }

  const runs = findRuns(resolvedWorkspace);
  if (runs.length === 0) {
    console.error(`No runs found in ${resolvedWorkspace}`);
    process.exit(1);
  }

  const finalSkillName = skillName || basename(resolvedWorkspace).replace("-workspace", "");
  const feedbackPath = join(resolvedWorkspace, "feedback.json");

  let previous: Record<string, PreviousRun> = {};
  if (previousWorkspace) {
    previous = loadPreviousIteration(resolve(previousWorkspace));
  }

  const resolvedBenchmarkPath = benchmarkPath ? resolve(benchmarkPath) : null;
  let benchmark: Record<string, unknown> | undefined;
  if (resolvedBenchmarkPath && existsSync(resolvedBenchmarkPath)) {
    try {
      benchmark = JSON.parse(readFileSync(resolvedBenchmarkPath, "utf-8"));
    } catch {
      // ignore parse errors
    }
  }

  // Static output mode
  if (staticOutput) {
    const outPath = resolve(staticOutput);
    const parent = outPath.substring(0, outPath.lastIndexOf("/") > 0 ? outPath.lastIndexOf("/") : outPath.length);
    if (parent) mkdirSync(parent, { recursive: true });
    const html = generateHtml(runs, finalSkillName, previous, benchmark);
    writeFileSync(outPath, html);
    console.log(`\n  Static viewer written to: ${outPath}\n`);
    process.exit(0);
  }

  // Kill any existing process on the target port
  killPort(port);

  const server = startServer({
    workspace: resolvedWorkspace,
    port,
    skillName: finalSkillName,
    feedbackPath,
    previous,
    benchmarkPath: resolvedBenchmarkPath,
    onListening: (url, _actualPort) => {
      console.log(`\n  Eval Viewer`);
      console.log(`  ─────────────────────────────────`);
      console.log(`  URL:       ${url}`);
      console.log(`  Workspace: ${resolvedWorkspace}`);
      console.log(`  Feedback:  ${feedbackPath}`);
      if (previousWorkspace) {
        console.log(`  Previous:  ${previousWorkspace} (${Object.keys(previous).length} runs)`);
      }
      if (resolvedBenchmarkPath) {
        console.log(`  Benchmark: ${resolvedBenchmarkPath}`);
      }
      console.log(`\n  Press Ctrl+C to stop.\n`);

      // Auto-open browser
      exec(`open "${url}"`, (err) => {
        if (err) {
          // silently ignore if open command fails
        }
      });
    },
  });

  process.on("SIGINT", () => {
    console.log("\nStopped.");
    server.close();
    process.exit(0);
  });
}
