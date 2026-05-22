#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/opencode"

echo "==> opencode-toolbox installer"
echo "    Repo: $REPO_DIR"
echo "    Target: $CONFIG_DIR"
echo ""

symlink_dir() {
  local name="$1"
  local src="$REPO_DIR/$name"
  local dst="$CONFIG_DIR/$name"

  if [ -L "$dst" ]; then
    echo "[skip] $dst already symlinked"
    return
  fi

  if [ -e "$dst" ]; then
    echo "[WARN] $dst exists and is not a symlink. Backing up to $dst.bak"
    mv "$dst" "$dst.bak"
  fi

  ln -s "$src" "$dst"
  echo "[ok]   $dst -> $src"
}

symlink_dir "skills"
symlink_dir "agents"
symlink_dir "commands"
symlink_dir "docs"

echo ""
echo "==> Done. Skills, agents, commands, docs symlinked to ~/.config/opencode/"
echo ""
echo "==> NEXT: Merge the agent definitions into your opencode.jsonc."
echo "    See opencode.jsonc.example for the implementer and reviewer blocks."
echo "    Copy the \"agent\" block entries into ~/.config/opencode/opencode.jsonc"
echo "    (merge with existing agents if any)."
echo ""
echo "    An agent can do this for you — just ask:"
echo "    'read opencode.jsonc.example and merge the agent block into my opencode.jsonc'"
