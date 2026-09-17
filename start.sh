#!/usr/bin/env bash
# Starts Ollama (if it isn't already running) and the Ellie chat UI,
# then opens it in your browser. Stop everything with Ctrl+C.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-3000}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

STARTED_OLLAMA=0
OLLAMA_PID=""
SERVER_PID=""

cleanup() {
  echo ""
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ "$STARTED_OLLAMA" = "1" ] && [ -n "$OLLAMA_PID" ]; then
    echo "Stopping Ollama (started by this script)…"
    kill "$OLLAMA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Make sure Ollama is running
if ! curl -s -o /dev/null "$OLLAMA_HOST/api/tags"; then
  if ! command -v ollama >/dev/null 2>&1; then
    echo "Ollama CLI not found in PATH. Open the Ollama app, or install it from https://ollama.com" >&2
    exit 1
  fi

  echo "Starting Ollama…"
  ollama serve >/tmp/ollama.log 2>&1 &
  OLLAMA_PID=$!
  STARTED_OLLAMA=1

  for _ in $(seq 1 30); do
    curl -s -o /dev/null "$OLLAMA_HOST/api/tags" && break
    sleep 1
  done
fi

if ! curl -s -o /dev/null "$OLLAMA_HOST/api/tags"; then
  echo "Ollama did not come up in time — check /tmp/ollama.log" >&2
  exit 1
fi
echo "Ollama is running at $OLLAMA_HOST"

# 2. Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi

# 3. Start the chat UI
PORT="$PORT" npm start &
SERVER_PID=$!

for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT" && break
  sleep 1
done

echo "Opening http://localhost:$PORT"
open "http://localhost:$PORT"

wait "$SERVER_PID"
