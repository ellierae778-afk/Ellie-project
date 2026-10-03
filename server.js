import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as googleTools from './google.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = path.join(__dirname, 'persona.md');
const MAX_TOOL_ITERATIONS = 8;

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

// Reads one Ollama streamed response, forwarding content chunks to the
// client as they arrive, and returns the full text plus any tool calls.
async function streamOllamaResponse(ollamaRes, res) {
  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let toolCalls = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.message?.content) {
        content += chunk.message.content;
        res.write(JSON.stringify({ message: { content: chunk.message.content } }) + '\n');
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls = chunk.message.tool_calls;
      }
    }
  }

  return { content, toolCalls };
}

// Stream a chat completion from Ollama, running any Google tool calls the
// model requests in between, and streaming the final answer back live.
app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body;

  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Request must include "model" and "messages".' });
  }

  const systemPrompt = loadSystemPrompt();
  let currentMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const tools = googleTools.isConnected() ? googleTools.TOOLS : undefined;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: currentMessages, stream: true, tools }),
      });

      if (!ollamaRes.ok || !ollamaRes.body) {
        const text = await ollamaRes.text().catch(() => '');
        throw new Error(`Ollama responded with ${ollamaRes.status}: ${text}`);
      }

      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
      }

      const { content, toolCalls } = await streamOllamaResponse(ollamaRes, res);

      if (!toolCalls.length) {
        res.end();
        return;
      }

      currentMessages = [...currentMessages, { role: 'assistant', content, tool_calls: toolCalls }];
      for (const call of toolCalls) {
        let result;
        try {
          const args =
            typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments || {};
          result = await googleTools.executeTool(call.function.name, args);
        } catch (toolErr) {
          result = { error: toolErr.message };
        }
        currentMessages.push({ role: 'tool', name: call.function.name, content: JSON.stringify(result) });
      }
    }

    res.write(
      JSON.stringify({
        message: { content: "\n\n(That took more tool calls than I'm willing to sit through. Try rephrasing.)" },
      }) + '\n'
    );
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

// Google OAuth connect flow
app.get('/api/google/status', (req, res) => {
  res.json({ configured: googleTools.isConfigured(), connected: googleTools.isConnected() });
});

app.get('/auth/google', (req, res) => {
  try {
    res.redirect(googleTools.getAuthUrl());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    await googleTools.handleOAuthCallback(req.query.code);
    res.send('<p>Google connected. You can close this tab and go back to Ellie.</p>');
  } catch (err) {
    res.status(500).send(`<p>Google auth failed: ${err.message}</p>`);
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
