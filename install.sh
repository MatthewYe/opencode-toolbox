#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/opencode"

echo "==> opencode-toolbox installer"
echo "    Repo: $REPO_DIR"
echo "    Target: $CONFIG_DIR"
echo ""

symlink_item() {
  local rel_path="$1"
  local src="$REPO_DIR/$rel_path"
  local dst="$CONFIG_DIR/$rel_path"
  local dst_parent="$(dirname "$dst")"

  mkdir -p "$dst_parent"

  if [ -L "$dst" ]; then
    echo "[skip] $dst"
    return
  fi

  if [ -e "$dst" ]; then
    echo "[WARN] $dst exists, backing up to $dst.bak"
    mv "$dst" "$dst.bak"
  fi

  ln -s "$src" "$dst"
  echo "[ok]   $dst -> $src"
}

echo "--- skills ---"
for item in "$REPO_DIR"/skills/*; do
  symlink_item "skills/$(basename "$item")"
done

echo "--- agents ---"
for item in "$REPO_DIR"/agents/*; do
  symlink_item "agents/$(basename "$item")"
done

echo "--- commands ---"
for item in "$REPO_DIR"/commands/*; do
  symlink_item "commands/$(basename "$item")"
done

echo "--- docs ---"
for item in "$REPO_DIR"/docs/*; do
  symlink_item "docs/$(basename "$item")"
done

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
