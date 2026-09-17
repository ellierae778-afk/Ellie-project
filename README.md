# Ellie

A minimal chat UI for talking to a local [Ollama](https://ollama.com) model.

## Prerequisites

- [Ollama](https://ollama.com) installed and running locally (`ollama serve`, or just open the app).
- At least one model pulled, e.g.:

  ```bash
  ollama pull llama3
  ```

- Node.js 18+

## Setup

```bash
npm install
npm start
```

Then open http://localhost:3000.

The server proxies requests to Ollama at `http://localhost:11434` by default.
If your Ollama instance runs elsewhere, set `OLLAMA_HOST`:

```bash
OLLAMA_HOST=http://localhost:11434 npm start
```

## How it works

- `server.js` — a small Express server that serves the frontend and proxies
  `/api/models` and `/api/chat` to Ollama's REST API, streaming responses
  back to the browser as they're generated.
- `public/` — a plain HTML/CSS/JS chat interface (no build step required).

This is intentionally minimal so it's easy to extend — swap the frontend for
a framework, add conversation history/persistence, system prompts, etc.
