import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'audio', 'acks');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

// Short filler lines played the instant the wake word is heard, while the
// real response is still being generated. Pre-recorded once via ElevenLabs
// and reused forever, instead of hitting the API on every wake word.
const PHRASES = [
  'Hold on, let me look into that.',
  'Give me a second.',
  'One moment.',
  'Let me check.',
  'Okay, working on it.',
];

export async function ensureAckClips() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return false;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const expectedFiles = PHRASES.map((_, i) => `ack-${i + 1}.mp3`);
  const allExist = expectedFiles.every((f) => fs.existsSync(path.join(OUT_DIR, f)));
  if (allExist && fs.existsSync(MANIFEST_PATH)) {
    return true;
  }

  console.log('Generating wake-word acknowledgment clips via ElevenLabs (one-time)...');
  const files = [];
  for (let i = 0; i < PHRASES.length; i++) {
    const fileName = `ack-${i + 1}.mp3`;
    const filePath = path.join(OUT_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: PHRASES[i],
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`  failed to generate "${PHRASES[i]}": ${res.status} ${errText}`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      console.log(`  saved ${fileName}`);
    }
    files.push(fileName);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ files }, null, 2));
  console.log(`Done — ${files.length} acknowledgment clip(s) ready.`);
  return true;
}

// Allow `node scripts/generate-ack-clips.js` directly, in addition to being
// imported and called from server.js on startup.
if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await ensureAckClips();
  if (!ok) {
    console.log('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set in .env — skipping.');
  }
}
