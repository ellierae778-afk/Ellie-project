import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

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

  try {
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
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

app.listen(PORT, () => {
  console.log(`Ellie chat UI running at http://localhost:${PORT}`);
  console.log(`Proxying Ollama requests to ${OLLAMA_HOST}`);
});
