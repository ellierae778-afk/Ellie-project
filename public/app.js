const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const statusLine = document.getElementById('status-line');
const googleStatus = document.getElementById('google-status');
const voiceToggleInput = document.getElementById('voice-toggle-input');
const voiceStatusEl = document.getElementById('voice-status');

const history = [];

async function loadGoogleStatus() {
  try {
    const res = await fetch('/api/google/status');
    const data = await res.json();
    if (!data.configured) {
      googleStatus.className = 'google-status unconfigured';
      return;
    }
    if (data.connected) {
      googleStatus.textContent = '🟢 Google connected';
      googleStatus.className = 'google-status connected';
    } else {
      googleStatus.textContent = '⚪ Connect Google';
      googleStatus.className = 'google-status disconnected';
    }
  } catch {
    googleStatus.className = 'google-status unconfigured';
  }
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function setStatus(text) {
  statusLine.textContent = text;
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  chatInput.disabled = busy;
}

// Resolves once playback actually finishes (not just once it starts), so
// callers can safely do things like resume the mic only after Ellie is
// done talking.
async function speak(text) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `TTS failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve);
      audio.addEventListener('error', reject);
      audio.play().catch(reject);
    });
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Voice playback failed:', err.message || err);
  }
}

// Plays a random pre-recorded filler clip the instant the wake word is
// heard, while the real response is still being generated. Fire-and-forget
// — doesn't block sending the actual command.
let ackManifest = null;
async function playAck() {
  try {
    if (!ackManifest) {
      const res = await fetch('/audio/acks/manifest.json');
      if (!res.ok) return;
      ackManifest = (await res.json()).files || [];
    }
    if (!ackManifest.length) return;
    const file = ackManifest[Math.floor(Math.random() * ackManifest.length)];
    new Audio(`/audio/acks/${file}`).play().catch(() => {});
  } catch {
    // No ack clips generated (ElevenLabs not configured) — fine, skip.
  }
}

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load models');

    modelSelect.innerHTML = '';
    if (!data.length) {
      modelSelect.innerHTML =
        '<option value="">No models found — pull a cloud model, e.g. `ollama pull gpt-oss:120b-cloud`</option>';
      return;
    }
    for (const m of data) {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name.includes('-cloud') ? `☁ ${m.name}` : m.name;
      modelSelect.appendChild(opt);
    }
    const cloudCount = data.filter((m) => m.name.includes('-cloud')).length;
    setStatus(
      `Connected to Ollama — ${data.length} model(s) available` +
        (cloudCount ? ` (${cloudCount} cloud).` : '.')
    );
  } catch (err) {
    modelSelect.innerHTML = '<option value="">Ollama unavailable</option>';
    setStatus(err.message);
  }
}

async function sendMessage(text) {
  const model = modelSelect.value;
  if (!model) {
    setStatus('Select a model first.');
    return;
  }

  history.push({ role: 'user', content: text });
  addMessage('user', text);

  const assistantEl = addMessage('assistant', '');
  let assistantText = '';

  setBusy(true);
  setStatus('Thinking…');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: history }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          assistantText += chunk.message.content;
          assistantEl.textContent = assistantText;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      }
    }

    history.push({ role: 'assistant', content: assistantText });
    setStatus('');
    if (assistantText.trim() && voiceToggleInput.checked) {
      await speak(assistantText);
    }
  } catch (err) {
    assistantEl.remove();
    addMessage('error', `Error: ${err.message}`);
    history.pop();
    setStatus('');
  } finally {
    setBusy(false);
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendMessage(text);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});

loadModels();
loadGoogleStatus();
window.addEventListener('focus', loadGoogleStatus);

// --- Wake-word voice mode ("hey nova") ---
//
// State machine: off -> listening -> (awaiting_command, if the wake word
// arrives alone) -> processing -> back to listening. While off, no mic
// access and no auto-speaking of responses, regardless of how a message
// was sent.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE_WORD = 'hey nova';

let recognition = null;
let voiceState = 'off'; // off | listening | awaiting_command | processing

function setVoiceStatus(text) {
  voiceStatusEl.textContent = text;
}

function createRecognition() {
  const r = new SpeechRecognitionImpl();
  r.continuous = true;
  r.interimResults = false;
  r.lang = 'en-US';

  r.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        handleTranscript(result[0].transcript.trim());
      }
    }
  };

  r.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setVoiceStatus('🔇 Mic permission denied');
      voiceState = 'off';
      voiceToggleInput.checked = false;
    }
    // Other errors (e.g. transient "no-speech") are recoverable — onend
    // below restarts listening automatically.
  };

  r.onend = () => {
    if (voiceState === 'listening' || voiceState === 'awaiting_command') {
      try {
        r.start();
      } catch {
        // Already running or briefly unavailable — next onend will retry.
      }
    }
  };

  return r;
}

function handleTranscript(transcript) {
  if (voiceState === 'awaiting_command') {
    if (!transcript) return;
    voiceState = 'processing';
    runVoiceCommand(transcript);
    return;
  }

  if (voiceState !== 'listening') return;

  const lower = transcript.toLowerCase();
  const wakeIndex = lower.indexOf(WAKE_WORD);
  if (wakeIndex === -1) return;

  const afterWake = transcript.slice(wakeIndex + WAKE_WORD.length).trim();
  if (afterWake) {
    voiceState = 'processing';
    runVoiceCommand(afterWake);
  } else {
    voiceState = 'awaiting_command';
    setVoiceStatus('👂 Go ahead…');
  }
}

async function runVoiceCommand(text) {
  setVoiceStatus('💭 Working on it…');
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }

  playAck();
  await sendMessage(text);

  if (voiceToggleInput.checked) {
    voiceState = 'listening';
    setVoiceStatus(`🎤 Listening for "${WAKE_WORD}"`);
    try {
      recognition.start();
    } catch {
      // ignore
    }
  } else {
    voiceState = 'off';
  }
}

voiceToggleInput.addEventListener('change', () => {
  if (voiceToggleInput.checked) {
    if (!SpeechRecognitionImpl) {
      setVoiceStatus('🔇 Voice not supported in this browser');
      voiceToggleInput.checked = false;
      return;
    }
    recognition = createRecognition();
    voiceState = 'listening';
    setVoiceStatus(`🎤 Listening for "${WAKE_WORD}"`);
    try {
      recognition.start();
    } catch (err) {
      console.error('Could not start voice recognition:', err);
    }
  } else {
    voiceState = 'off';
    setVoiceStatus('🔇 Voice off');
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognition = null;
    }
  }
});
