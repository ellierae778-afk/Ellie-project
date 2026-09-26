import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = path.join(__dirname, 'persona.md');

const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

function loadSystemPrompt() {
  try {
    return fs.readFileSync(PERSONA_PATH, 'utf-8').trim();
  } catch {
    return null;
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List locally available Ollama models
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }
    const data = await response.json();
    res.json(data.models || []);
  } catch (err) {
    res.status(502).json({
      error: `Could not reach Ollama at ${OLLAMA_HOST}. Is it running? (${err.message})`,
    });
  }
});

// Stream a chat completion from Ollama
app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body;

  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Request must include "model" and "messages".' });
  }

  const systemPrompt = loadSystemPrompt();
  const outgoingMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  try {
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: outgoingMessages, stream: true }),
    });

    if (!ollamaRes.ok || !ollamaRes.body) {
      const text = await ollamaRes.text().catch(() => '');
      throw new Error(`Ollama responded with ${ollamaRes.status}: ${text}`);
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');

    for await (const chunk of ollamaRes.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({
        error: `Could not reach Ollama at ${OLLAMA_HOST}. Is it running? (${err.message})`,
      });
    } else {
      res.end();
    }
  }
});

// Convert text to speech via ElevenLabs, streaming audio back to the client
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Request must include "text".' });
  }
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return res.status(500).json({
      error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.',
    });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!ttsRes.ok || !ttsRes.body) {
      const errText = await ttsRes.text().catch(() => '');
      throw new Error(`ElevenLabs responded with ${ttsRes.status}: ${errText}`);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    for await (const chunk of ttsRes.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: `ElevenLabs request failed: ${err.message}` });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Ellie chat UI running at http://localhost:${PORT}`);
  console.log(`Proxying Ollama requests to ${OLLAMA_HOST}`);
});
