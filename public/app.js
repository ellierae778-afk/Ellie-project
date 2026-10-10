const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const statusLine = document.getElementById('status-line');
const googleStatus = document.getElementById('google-status');
const voiceToggleInput = document.getElementById('voice-toggle-input');
const voiceStatusEl = document.getElementById('voice-status');

const orb = document.getElementById('orb');
const orbCanvas = document.getElementById('orb-canvas');
const orbWaves = document.getElementById('orb-waves');
const orbLabel = document.getElementById('orb-label');
const quickGrid = document.getElementById('quick-grid');
const liveTranscriptEl = document.getElementById('live-transcript');
const clockEl = document.getElementById('clock');
const greetingEl = document.getElementById('greeting');
const weatherBody = document.getElementById('weather-body');
const locationEditBtn = document.getElementById('location-edit');
const scheduleList = document.getElementById('schedule-list');
const scheduleRefreshBtn = document.getElementById('schedule-refresh');
const emailsList = document.getElementById('emails-list');
const emailsRefreshBtn = document.getElementById('emails-refresh');

const history = [];

function setEmpty(el, text) {
  el.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'widget-empty';
  span.textContent = text;
  el.appendChild(span);
}

// --- Orb: a canvas-drawn, Siri/HUD-style animated blob + rotating ring,
// layered under the CSS state classes (which handle the instant glow/dim
// cues) for a continuous, state-reactive animation.

const orbCtx = orbCanvas.getContext('2d');
const ORB_SIZE = 220;
let orbAnimState = 'off';

function setupOrbCanvas() {
  const dpr = window.devicePixelRatio || 1;
  orbCanvas.width = ORB_SIZE * dpr;
  orbCanvas.height = ORB_SIZE * dpr;
  orbCtx.scale(dpr, dpr);
}
setupOrbCanvas();

// Each state: layered blob colors (drives the flowing core), rotation/
// wobble speed, and how much the blob size swells.
const ORB_PALETTES = {
  off: { colors: ['#6a2f78', '#3a1744'], speed: 0.12, amp: 0.1 },
  listening: { colors: ['#ff2d9e', '#b23bff', '#7a5cff'], speed: 0.55, amp: 0.4 },
  thinking: { colors: ['#7a5cff', '#ff2d9e', '#4fd2ff'], speed: 1.7, amp: 0.3 },
  speaking: { colors: ['#ff2d9e', '#ff7ad1', '#ffb84f'], speed: 1.15, amp: 0.8 },
};

function drawOrb(time) {
  const palette = ORB_PALETTES[orbAnimState] || ORB_PALETTES.off;
  const t = (time * 0.001 * palette.speed) || 0;
  const cx = ORB_SIZE / 2;
  const cy = ORB_SIZE / 2;
  const baseRadius = ORB_SIZE * 0.17;

  orbCtx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);

  // Flowing, overlapping blobs blended additively — the Siri-style core.
  orbCtx.globalCompositeOperation = 'lighter';
  const blobCount = palette.colors.length;
  for (let i = 0; i < blobCount; i++) {
    const phase = (i / blobCount) * Math.PI * 2;
    const wobble = Math.sin(t * 1.3 + phase) * 0.5 + Math.cos(t * 0.8 + phase * 2) * 0.5;
    const radius = baseRadius * (1 + palette.amp * 0.5 * wobble + palette.amp * 0.5);
    const ox = Math.cos(t * 0.6 + phase) * baseRadius * 0.3;
    const oy = Math.sin(t * 0.7 + phase * 1.4) * baseRadius * 0.3;

    const gradient = orbCtx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, radius);
    gradient.addColorStop(0, `${palette.colors[i]}cc`);
    gradient.addColorStop(1, `${palette.colors[i]}00`);

    orbCtx.fillStyle = gradient;
    orbCtx.beginPath();
    orbCtx.arc(cx + ox, cy + oy, Math.max(radius, 0), 0, Math.PI * 2);
    orbCtx.fill();
  }

  // Rotating segmented HUD ring around the blob — the Jarvis touch.
  orbCtx.globalCompositeOperation = 'source-over';
  const ringRadius = baseRadius * 1.9;
  const segments = 32;
  const rotation = t * 0.5;
  orbCtx.lineWidth = 1.2;
  for (let i = 0; i < segments; i++) {
    const a0 = rotation + (i / segments) * Math.PI * 2;
    const len = ((1 / segments) * Math.PI * 2) * 0.5;
    const alpha = Math.max(0, 0.18 + 0.16 * Math.sin(i * 0.7 + t * 2));
    orbCtx.strokeStyle = `rgba(255, 130, 210, ${alpha})`;
    orbCtx.beginPath();
    orbCtx.arc(cx, cy, ringRadius, a0, a0 + len);
    orbCtx.stroke();
  }

  requestAnimationFrame(drawOrb);
}
requestAnimationFrame(drawOrb);

function setOrbState(state, label) {
  orb.className = `orb state-${state}`;
  orbAnimState = state;
  if (state === 'listening' || state === 'speaking') {
    orbWaves.classList.add('active');
    orbWaves.classList.toggle('fast', state === 'speaking');
  } else {
    orbWaves.classList.remove('active', 'fast');
  }
  if (label !== undefined) orbLabel.textContent = label;
}

function setLiveTranscript(text) {
  liveTranscriptEl.textContent = text;
  liveTranscriptEl.classList.toggle('active', Boolean(text));
}

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
// callers can safely do things like resume the mic only after Nova is
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
  setOrbState('thinking', 'Thinking…');

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
      setOrbState('speaking', 'Speaking…');
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
    setOrbState(
      voiceToggleInput.checked ? 'listening' : 'off',
      voiceToggleInput.checked ? `Listening for "${WAKE_WORD}"` : 'Say "hey nova" to start'
    );
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
  r.interimResults = true;
  r.lang = 'en-US';

  r.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        handleTranscript(result[0].transcript.trim());
      } else {
        interim += result[0].transcript;
      }
    }
    if (voiceState === 'listening' || voiceState === 'awaiting_command') {
      setLiveTranscript(interim);
    }
  };

  r.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setVoiceStatus('🔇 Mic permission denied');
      setOrbState('off', 'Mic permission denied');
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
    setLiveTranscript('');
    runVoiceCommand(transcript);
    return;
  }

  if (voiceState !== 'listening') return;

  const lower = transcript.toLowerCase();
  const wakeIndex = lower.indexOf(WAKE_WORD);
  if (wakeIndex === -1) {
    setLiveTranscript('');
    return;
  }

  const afterWake = transcript.slice(wakeIndex + WAKE_WORD.length).trim();
  if (afterWake) {
    voiceState = 'processing';
    setLiveTranscript('');
    runVoiceCommand(afterWake);
  } else {
    voiceState = 'awaiting_command';
    setLiveTranscript('');
    setVoiceStatus('👂 Go ahead…');
    setOrbState('listening', '👂 Go ahead…');
  }
}

async function runVoiceCommand(text) {
  setVoiceStatus('💭 Working on it…');
  setOrbState('thinking', '💭 Working on it…');
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
    setOrbState('listening', `Listening for "${WAKE_WORD}"`);
    try {
      recognition.start();
    } catch (err) {
      console.error('Could not start voice recognition:', err);
    }
  } else {
    voiceState = 'off';
    setVoiceStatus('🔇 Voice off');
    setLiveTranscript('');
    setOrbState('off', 'Say "hey nova" to start');
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

// --- Dashboard widgets: clock, greeting, weather, schedule, emails ---
// These call lightweight server endpoints that read Calendar/Gmail/Weather
// directly — independent of the chat/tool-calling loop — so they stay
// populated with real data without needing to ask Nova anything.

function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateGreeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  greetingEl.textContent = `${part} · Always here for you`;
}

const WEATHER_LOCATION_KEY = 'nova-weather-location';

function getSavedLocation() {
  try {
    return localStorage.getItem(WEATHER_LOCATION_KEY) || '';
  } catch {
    return '';
  }
}

function saveLocation(loc) {
  try {
    localStorage.setItem(WEATHER_LOCATION_KEY, loc);
  } catch {
    // Private browsing or storage disabled — fine, just won't persist.
  }
}

function extractWeatherFields(conditions) {
  if (!conditions) return {};
  const temp = conditions.temperature?.degrees;
  const unit = conditions.temperature?.unit || 'CELSIUS';
  const description =
    conditions.weatherCondition?.description?.text || conditions.weatherCondition?.type || null;
  return { temp, unit, description };
}

function renderWeather(data) {
  const { temp, unit, description } = extractWeatherFields(data.conditions);
  weatherBody.innerHTML = '';
  if (typeof temp === 'number') {
    const tempSpan = document.createElement('span');
    tempSpan.className = 'temp';
    const symbol = String(unit).toUpperCase().startsWith('F') ? '°F' : '°C';
    tempSpan.textContent = `${Math.round(temp)}${symbol}`;
    weatherBody.appendChild(tempSpan);
  }
  if (description) {
    const condSpan = document.createElement('span');
    condSpan.className = 'condition';
    condSpan.textContent = description;
    weatherBody.appendChild(condSpan);
  }
  if (!weatherBody.children.length) {
    setEmpty(weatherBody, data.location || 'Weather data received');
  }
}

async function loadWeather() {
  const location = getSavedLocation();
  locationEditBtn.textContent = location || 'Set location';
  if (!location) {
    setEmpty(weatherBody, 'Add a location to see the weather');
    return;
  }
  setEmpty(weatherBody, 'Checking the sky…');
  try {
    const res = await fetch(`/api/dashboard/weather?location=${encodeURIComponent(location)}`);
    const data = await res.json();
    if (!data.configured) {
      setEmpty(weatherBody, 'Weather not configured yet');
      return;
    }
    if (data.error) throw new Error(data.error);
    renderWeather(data);
  } catch {
    setEmpty(weatherBody, "Couldn't load weather");
  }
}

locationEditBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'location-input';
  input.placeholder = 'City, State';
  input.value = getSavedLocation();
  locationEditBtn.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    saveLocation(input.value.trim());
    input.replaceWith(locationEditBtn);
    loadWeather();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  });
  input.addEventListener('blur', commit);
});

function formatEventTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function loadSchedule() {
  setEmpty(scheduleList, 'Loading…');
  try {
    const res = await fetch('/api/dashboard/schedule');
    const data = await res.json();
    if (!data.connected) {
      setEmpty(scheduleList, "Connect Google to see today's events");
      return;
    }
    if (data.error) throw new Error(data.error);
    if (!data.events?.length) {
      setEmpty(scheduleList, 'Nothing on the calendar today');
      return;
    }
    scheduleList.innerHTML = '';
    for (const ev of data.events) {
      const li = document.createElement('li');
      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = formatEventTime(ev.start);
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = ev.summary || '(untitled)';
      li.append(timeSpan, titleSpan);
      scheduleList.appendChild(li);
    }
  } catch {
    setEmpty(scheduleList, "Couldn't load schedule");
  }
}

async function loadEmails() {
  setEmpty(emailsList, 'Loading…');
  try {
    const res = await fetch('/api/dashboard/emails');
    const data = await res.json();
    if (!data.connected) {
      setEmpty(emailsList, 'Connect Google to see your inbox');
      return;
    }
    if (data.error) throw new Error(data.error);
    if (!data.messages?.length) {
      setEmpty(emailsList, 'Nothing flagged as important');
      return;
    }
    emailsList.innerHTML = '';
    for (const msg of data.messages) {
      const li = document.createElement('li');
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = msg.subject || '(no subject)';
      const fromSpan = document.createElement('span');
      fromSpan.className = 'from';
      fromSpan.textContent = (msg.from || 'Unknown').split('<')[0].trim();
      li.append(titleSpan, fromSpan);
      emailsList.appendChild(li);
    }
  } catch {
    setEmpty(emailsList, "Couldn't load emails");
  }
}

function wireRefresh(button, loader) {
  button.addEventListener('click', () => {
    button.classList.add('spinning');
    loader().finally(() => button.classList.remove('spinning'));
  });
}
wireRefresh(scheduleRefreshBtn, loadSchedule);
wireRefresh(emailsRefreshBtn, loadEmails);

// --- Connected APIs tiles ---
// A dedicated spot per integration, so each new API we wire up later just
// needs a tile added here rather than being lumped into one status badge.

quickGrid.querySelectorAll('.quick-tile[data-kind="google"]').forEach((tile) => {
  tile.addEventListener('click', () => {
    if (!tile.classList.contains('ready')) {
      window.open('/auth/google', '_blank', 'noopener');
    }
  });
});

async function loadIntegrationsStatus() {
  try {
    const res = await fetch('/api/integrations/status');
    const data = await res.json();

    const googleReady = Boolean(data.google?.connected);
    quickGrid.querySelectorAll('[data-kind="google"]').forEach((tile) => {
      tile.classList.toggle('ready', googleReady);
      tile.title = googleReady
        ? 'Connected'
        : data.google?.configured
          ? 'Click to connect your Google account'
          : 'Not set up yet — see README for setup steps';
    });

    const weatherTile = quickGrid.querySelector('[data-service="weather"]');
    weatherTile.classList.toggle('ready', Boolean(data.weather?.configured));
    weatherTile.title = data.weather?.configured
      ? 'Connected'
      : 'Not set up yet — add GOOGLE_MAPS_API_KEY to .env';

    const voiceTile = quickGrid.querySelector('[data-service="voice"]');
    voiceTile.classList.toggle('ready', Boolean(data.voice?.configured));
    voiceTile.title = data.voice?.configured
      ? 'Connected'
      : 'Not set up yet — add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to .env';
  } catch {
    // Leave tiles in their default (not-ready) state.
  }
}

updateClock();
setInterval(updateClock, 15000);
updateGreeting();
setOrbState('off', 'Say "hey nova" to start');

loadModels();
loadGoogleStatus();
loadWeather();
loadSchedule();
loadEmails();
loadIntegrationsStatus();

window.addEventListener('focus', () => {
  loadGoogleStatus();
  loadSchedule();
  loadEmails();
  loadIntegrationsStatus();
});
