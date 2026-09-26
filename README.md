# Ellie

A minimal chat UI for talking to a local [Ollama](https://ollama.com) model.

## Prerequisites

- [Ollama](https://ollama.com) installed and running locally (`ollama serve`, or just open the app).
- Node.js 18+ — if you don't have it yet, run `./install.sh` (macOS) to
  install Node/npm via Homebrew and then the project's dependencies.
- At least one model pulled — local or cloud (see below).

### Using a cloud model

Ollama can run models on Ollama's cloud infrastructure while still being
accessed through your local Ollama the same way as any local model — no code
changes needed here.

```bash
ollama signin                       # authenticate with your ollama.com account
ollama pull gpt-oss:120b-cloud      # or another *-cloud model
```

Once pulled, the model shows up in this app's model dropdown (marked with a
☁ icon) and works exactly like a local model — just bigger and hosted
remotely, so nothing downloads to your machine.

### Using a local model instead

```bash
ollama pull llama3
```

## Setup

### First-time install (macOS)

```bash
./install.sh
```

Installs Node.js/npm via Homebrew if they're missing, then runs
`npm install` for this project. Only needs to be run once.

### One command to run (macOS)

```bash
./start.sh
```

This starts Ollama if it isn't already running, installs dependencies on
first run, starts the chat server, and opens http://localhost:3000 in your
browser. Press `Ctrl+C` to stop everything.

### Manual

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

## Personality

`persona.md` is sent to the model as a system prompt on every message, so
Ellie's tone stays consistent no matter which model you're talking to. Edit
that file to change how she talks — no restart needed, it's re-read on every
request. Delete it (or leave it empty) to talk to the model with no
personality layer at all.

## Voice (ElevenLabs)

Ellie can speak her responses out loud using [ElevenLabs](https://elevenlabs.io)
text-to-speech. Copy `.env.example` to `.env` and fill in:

```
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_VOICE_ID=your-voice-id
```

`.env` is gitignored — it never gets committed. With both values set, every
assistant reply is automatically sent to `/api/tts` and played in the
browser once the text finishes streaming in. Leave them unset and the app
just runs as a text-only chat.

## How it works

- `server.js` — a small Express server that serves the frontend and proxies
  `/api/models` and `/api/chat` to Ollama's REST API (streaming responses
  back to the browser as they're generated), plus `/api/tts` to ElevenLabs
  for voice playback.
- `public/` — a plain HTML/CSS/JS chat interface (no build step required).

This is intentionally minimal so it's easy to extend — swap the frontend for
a framework, add conversation history/persistence, system prompts, etc.
