#!/usr/bin/env bash
# One-time setup for macOS: installs Node.js/npm via Homebrew if they're
# missing, then installs this project's npm dependencies.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Make sure Homebrew's tools are on PATH even if this shell hasn't sourced
# ~/.zprofile yet (e.g. a fresh terminal after a previous run installed it).
for BREW_BIN in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$BREW_BIN" ]; then
    eval "$("$BREW_BIN" shellenv)"
    break
  fi
done

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found — installing it first…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  for BREW_BIN in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$BREW_BIN" ]; then
      eval "$("$BREW_BIN" shellenv)"
      break
    fi
  done
fi

# Persist Homebrew's PATH setup for future terminal sessions, so npm/node
# keep working outside this script too.
if command -v brew >/dev/null 2>&1 && ! grep -q "brew shellenv" "$HOME/.zprofile" 2>/dev/null; then
  echo "Adding Homebrew to ~/.zprofile…"
  echo "eval \"\$($(command -v brew) shellenv)\"" >>"$HOME/.zprofile"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Installing Node.js (includes npm)…"
  brew install node
fi

echo "Node $(node --version), npm $(npm --version)"

echo "Installing project dependencies…"
npm install

echo "Done. Run ./start.sh to launch Ellie."
