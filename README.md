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

### Hands-free mode ("hey nova")

Flip the toggle in the header to go hands-free. While it's on, Ellie listens
continuously in the browser for the wake word **"hey nova"** — everything
you say right after it is sent as your message. While it's off, nothing is
listening and nothing is spoken automatically, no matter how a message was
sent.

The instant the wake word is heard, Ellie plays a short filler line ("one
moment," "let me check," etc.) while the real response is generated — those
are **pre-recorded once** via ElevenLabs (on first server start, or run
`npm run generate-acks` to do it manually) and saved to
`public/audio/acks/`, so saying the wake word never costs an API call by
itself. Only the actual response text goes through `/api/tts` each time.

Wake-word listening uses the browser's built-in Speech Recognition API, so
it needs Chrome, Edge, or Safari (Firefox doesn't support it) and will ask
for microphone permission the first time you turn it on.

## Google tools (Calendar, Gmail, Drive, Sheets)

Ellie can use your Google account as tools: check/create calendar events,
search and send Gmail, search/read Drive files, and read/write Google
Sheets. This only works with models that support tool calling (e.g.
`gpt-oss:*-cloud`, `llama3.1`, `qwen2.5`) — if the model doesn't support
tools, it'll just answer from its own knowledge instead.

**1. Set up a Google Cloud OAuth client** (one-time, in [Google Cloud
Console](https://console.cloud.google.com/)):

- Create or pick a project, then enable these APIs: **Google Calendar API**,
  **Gmail API**, **Google Drive API**, **Google Sheets API**.
- Under "OAuth consent screen," add yourself as a test user (the app can
  stay in "Testing" mode — no Google review needed for personal use).
- Under "Credentials," create an **OAuth client ID** (type: Web application).
  Add this exact Authorized redirect URI:
  `http://localhost:3000/auth/google/callback`

**2. Add the credentials to `.env`:**

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

**3. Connect your account:** start the app, then click **Connect Google** in
the header (or visit http://localhost:3000/auth/google). Google will warn
that the app is unverified since it's just yours — click through "Advanced
→ Go to Ellie (unsafe)" to proceed. Tokens are saved to `google-token.json`
(gitignored, never committed).

Once connected, just ask Ellie things like "what's on my calendar tomorrow"
or "email John the meeting notes" — she'll call the right tool
automatically.

## Weather

Ellie can check real current weather via Google's Weather API (part of
Google Maps Platform). Unlike Calendar/Gmail/Drive/Sheets, this one uses a
plain API key, not the OAuth flow, and there's no "connect" step — it's
live as soon as the key is in `.env`.

**1. In [Google Cloud Console](https://console.cloud.google.com/)**, on the
same project as your other credentials:

- Enable **Geocoding API** and **Weather API** (location names need to be
  resolved to coordinates first, which is what Geocoding API does).
- Go to **APIs & Services → Credentials → Create Credentials → API key.**
  This is a different kind of credential than the OAuth client you made
  earlier — just a plain key, no consent screen involved.
- Optionally click into the new key and restrict it to just those two APIs.

**2. Add it to `.env`:**

```
GOOGLE_MAPS_API_KEY=your-api-key
```

Restart the app and ask something like "what's the weather in Salida,
Colorado today" — she'll geocode the place name and pull live conditions.

## How it works

- `server.js` — a small Express server that serves the frontend; proxies
  `/api/models` and `/api/chat` to Ollama (streaming responses back to the
  browser, running any tool calls from any connected provider in between);
  proxies `/api/tts` to ElevenLabs for voice playback; and handles the
  `/auth/google*` OAuth flow.
- `google.js` — Google tool definitions and the code that executes them
  against the Calendar, Gmail, Drive, and Sheets APIs.
- `weather.js` — the weather tool (Google Maps Platform Geocoding + Weather
  APIs, API-key authenticated).
- `public/` — a plain HTML/CSS/JS chat interface (no build step required).

This is intentionally minimal so it's easy to extend — swap the frontend for
a framework, add conversation history/persistence, system prompts, etc.
