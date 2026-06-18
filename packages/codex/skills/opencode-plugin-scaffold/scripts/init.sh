#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# init.sh — OpenCode Plugin Scaffold Initializer
#
# Usage:
#   init.sh              Interactive mode (create or fix)
#   init.sh --fix <dir>  Detect + complete an existing project
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; }
success() { echo -e "${GREEN}[done]${NC} $1"; }

# ─── file templates ────────────────────────────────────────

gen_package_json() {
  local name="$1" publish="${2:-no}"
  local main_block="" files_block="" build_script=""

  if [ "$publish" = "yes" ]; then
    main_block='"main": "dist/index.js",'
    files_block='"files": ["dist"],'
    build_script='"build": "bun build src/index.ts --outdir dist --target node",'
  fi

  cat <<EOF
{
  "name": "${name}",
  "version": "0.0.1",
  "type": "module",
  ${main_block}
  ${files_block}
  "scripts": {
    ${build_script}
    "dev": "bun run --watch src/index.ts"
  },
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "typescript": "latest"
  }
}
EOF
}

gen_tsconfig_json() {
  cat <<'EOF'
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "preserve",
    "moduleResolution": "bundler",
    "declaration": true
  },
  "include": ["src"]
}
EOF
}

gen_index_ts_empty() {
  cat <<'EOF'
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  return {}
}
EOF
}

gen_index_ts_with_tool() {
  cat <<'EOF'
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      greet: tool({
        description: "Greet someone by name",
        args: {
          name: tool.schema.string().describe("Name to greet"),
        },
        async execute(args) {
          return `Hello, ${args.name}!`
        },
      }),
    },
  }
}
EOF
}

gen_opencode_package_json() {
  cat <<'EOF'
{
  "dependencies": {}
}
EOF
}

# ─── detection helpers ─────────────────────────────────────

check_plugin_export() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  if grep -qE 'export\s+(const|function|async\s+function)\s+\w+\s*[:=]\s*Plugin' "$file" 2>/dev/null; then
    return 0
  fi
  if grep -qE 'export\s+\{[^}]*Plugin[^}]*\}' "$file" 2>/dev/null; then
    return 0
  fi
  return 1
}

has_dep() {
  local pkg_file="$1" dep_name="$2"
  if [ ! -f "$pkg_file" ]; then
    return 1
  fi
  node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
const deps = {...d.dependencies, ...d.devDependencies};
process.exit('$dep_name' in deps ? 0 : 1);
" 2>/dev/null
}

add_dep() {
  local pkg_file="$1" dep_name="$2" dep_ver="${3:-latest}"
  node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
d.dependencies = d.dependencies || {};
d.dependencies['$dep_name'] = '$dep_ver';
fs.writeFileSync('$pkg_file', JSON.stringify(d, null, 2) + '\n');
console.log(JSON.stringify(d, null, 2));
" 2>/dev/null
}

# ─── create new project ─────────────────────────────────────

create_project() {
  local mode="$1" name="$2" target="$3" publish="${4:-no}"

  if [ -e "$target" ]; then
    warn "Target '$target' already exists."
    read -rp "  Overwrite? [y/N] " yn
    if [ "${yn:-n}" != "y" ] && [ "${yn:-n}" != "Y" ]; then
      info "Aborted."
      exit 0
    fi
  fi

  case "$mode" in
    npm)
      mkdir -p "$target/src"
      gen_package_json "$name" "$publish" > "$target/package.json"
      gen_tsconfig_json > "$target/tsconfig.json"
      gen_index_ts_with_tool > "$target/src/index.ts"
      success "Created npm plugin scaffold at $target"
      info "Run: cd $target && bun install && bun run src/index.ts # verify it loads"
      ;;
    local)
      mkdir -p "$target"
      gen_index_ts_empty > "$target/$(echo "$name" | tr ' -' '_').ts"
      gen_tsconfig_json > "$target/tsconfig.json"
      gen_opencode_package_json > "$target/.opencode/package.json"
      info "Created .opencode/package.json for external dependencies"
      success "Created local plugin scaffold at $target"
      info "Run: bun run $target/<entry>.ts # verify it loads"
      ;;
  esac
}

# ─── fix existing project ──────────────────────────────────

fix_project() {
  local target="$1"
  local changed=0

  if [ ! -d "$target" ]; then
    error "Directory '$target' does not exist."
    exit 1
  fi

  info "Detecting missing pieces in $target ..."

  # 1. package.json
  if [ -f "$target/package.json" ]; then
    info "  package.json: found"
    if ! has_dep "$target/package.json" "@opencode-ai/plugin"; then
      warn "  Missing @opencode-ai/plugin dependency. Adding ..."
      add_dep "$target/package.json" "@opencode-ai/plugin" "latest"
      success "  Added @opencode-ai/plugin to dependencies"
      changed=1
    fi
  else
    warn "  package.json: missing. Generating ..."
    local name
    name=$(basename "$(cd "$target" && pwd)")
    gen_package_json "$name" "no" > "$target/package.json"
    success "  Created package.json"
    changed=1
  fi

  # 2. tsconfig.json
  if [ -f "$target/tsconfig.json" ]; then
    info "  tsconfig.json: found"
  else
    warn "  tsconfig.json: missing. Generating ..."
    gen_tsconfig_json > "$target/tsconfig.json"
    success "  Created tsconfig.json"
    changed=1
  fi

  # 3. src/index.ts (check common entry points)
  local entry=""
  for candidate in "$target/src/index.ts" "$target/index.ts"; do
    if [ -f "$candidate" ]; then
      entry="$candidate"
      break
    fi
  done

  if [ -z "$entry" ]; then
    warn "  Entry file (src/index.ts): missing. Generating empty skeleton ..."
    mkdir -p "$target/src"
    gen_index_ts_empty > "$target/src/index.ts"
    success "  Created src/index.ts (empty skeleton)"
    changed=1
  else
    info "  Entry file: found ($entry)"

    # 4. Check Plugin export
    if ! check_plugin_export "$entry"; then
      error "  Entry file does NOT export a Plugin function."
      error "  OpenCode will load this plugin silently without effect."
      error "  Add 'export const YourPlugin: Plugin = async (ctx) => { ... }' to the entry file."
      error "  Aborting — refusing to proceed with invalid plugin."
      exit 1
    fi
    success "  Plugin export: verified"
  fi

  # 5. dist/ hint for npm mode
  if [ -f "$target/package.json" ] && [ ! -d "$target/dist" ]; then
    warn "  dist/: missing. If publishing to npm, add 'bun build' script to package.json."
  fi

  if [ "$changed" -eq 0 ]; then
    success "No changes needed — project already conforms to opencode plugin conventions."
  else
    success "Fix complete. Run: cd $target && bun install && bun run src/index.ts # verify it loads"
  fi
}

# ─── interactive mode ──────────────────────────────────────

interactive() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}   OpenCode Plugin Scaffold Init${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # 1. mode
  echo -e "${YELLOW}Step 1:${NC} Deployment mode?"
  echo "  [1] npm  — publishable package  (independent directory)"
  echo "  [2] local — .opencode/plugins/  (auto-discovered, zero config)"
  read -rp "  Choice [1]: " mode_choice
  mode_choice="${mode_choice:-1}"

  case "$mode_choice" in
    1|npm)   mode="npm" ;;
    2|local) mode="local" ;;
    *)      error "Invalid choice."; exit 1 ;;
  esac

  # 2. name
  echo ""
  echo -e "${YELLOW}Step 2:${NC} Plugin name?"
  local default_name
  default_name="my-opencode-plugin"
  if [ "$mode" = "npm" ]; then
    echo "  (npm convention: prefix with 'opencode-')"
    read -rp "  Name [opencode-my-plugin]: " name_input
    name="${name_input:-opencode-my-plugin}"
  else
    read -rp "  Name [my-plugin]: " name_input
    name="${name_input:-my-plugin}"
  fi

  # 3. target path
  echo ""
  echo -e "${YELLOW}Step 3:${NC} Target path?"
  local default_path
  if [ "$mode" = "npm" ]; then
    default_path="$(pwd)/${name}"
    read -rp "  Path [${default_path}]: " path_input
  else
    default_path="$(pwd)/.opencode/plugins"
    echo "  (local plugins go to .opencode/plugins/ or ~/.config/opencode/plugins/)"
    read -rp "  Path [${default_path}]: " path_input
  fi
  target="${path_input:-$default_path}"

  # 4. publish (npm only)
  local publish="no"
  if [ "$mode" = "npm" ]; then
    echo ""
    echo -e "${YELLOW}Step 4:${NC} Publish to npm?"
    echo "  If yes: adds dist/ build pipeline via 'bun build'."
    echo "  If no:  simpler setup, no build step needed."
    read -rp "  Publish? [y/N]: " pub_choice
    case "${pub_choice:-n}" in
      y|Y|yes) publish="yes" ;;
      *)       publish="no" ;;
    esac
  fi

  # Offer fix mode
  echo ""
  echo -e "${YELLOW}Optional:${NC} Is this an EXISTING project you want to fix?"
  echo "  If yes, I'll detect missing pieces and only add what's needed."
  read -rp "  Existing project? [y/N]: " fix_choice

  case "${fix_choice:-n}" in
    y|Y|yes)
      local fix_target="${target}"
      if [ -d "$fix_target" ]; then
        fix_project "$fix_target"
      else
        warn "$fix_target does not exist yet. Creating new scaffold instead."
        create_project "$mode" "$name" "$target" "$publish"
      fi
      ;;
    *)
      create_project "$mode" "$name" "$target" "$publish"
      ;;
  esac

  echo ""
  success "All done."
}

# ─── main ──────────────────────────────────────────────────

case "${1:-}" in
  --fix|-f)
    if [ -z "${2:-}" ]; then
      error "Usage: init.sh --fix <directory>"
      exit 1
    fi
    fix_project "$2"
    ;;
  --help|-h)
    echo "Usage:"
    echo "  init.sh               Interactive mode (create new or fix existing)"
    echo "  init.sh --fix <dir>   Detect missing pieces + complete an existing project"
    exit 0
    ;;
  *)
    interactive
    ;;
esac
