const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const statusLine = document.getElementById('status-line');
const googleStatus = document.getElementById('google-status');

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
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    await audio.play();
  } catch (err) {
    console.error('Voice playback failed:', err.message);
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
    if (assistantText.trim()) {
      speak(assistantText);
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
