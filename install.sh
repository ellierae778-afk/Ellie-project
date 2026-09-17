#!/usr/bin/env bash
# One-time setup for macOS: installs Node.js/npm via Homebrew if they're
# missing, then installs this project's npm dependencies.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found — installing it first…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Installing Node.js (includes npm)…"
  brew install node
fi

echo "Node $(node --version), npm $(npm --version)"

echo "Installing project dependencies…"
npm install

echo "Done. Run ./start.sh to launch Ellie."
