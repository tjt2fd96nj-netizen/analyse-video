// Commentaires vocaux : enregistrement au micro et lecture.
// Les enregistrements sont gardés dans IndexedDB (magasin "blobs").

import { blobs, newId } from './db.js';

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
export const MAX_SECONDS = 120;

export const voiceSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// Démarre l'enregistrement. Renvoie { stop(): Promise<{key, dur, type}|null>, cancel() }.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const t0 = Date.now();
  rec.start(250);
  const done = new Promise((resolve) => (rec.onstop = resolve));
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    startedAt: t0,
    async stop() {
      if (rec.state !== 'inactive') rec.stop();
      await done;
      release();
      const dur = (Date.now() - t0) / 1000;
      if (dur < 0.5 || !chunks.length) return null;
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
      const key = 'voice-' + newId();
      await blobs.put(key, blob);
      return { key, dur: Math.round(dur * 10) / 10, type: blob.type };
    },
    cancel() { if (rec.state !== 'inactive') rec.stop(); release(); },
  };
}

// Un seul lecteur audio partagé (nécessaire sur iPhone : il doit être
// "débloqué" une première fois pendant un appui de l'utilisateur).
const player = new Audio();
player.preload = 'auto';
let unlocked = false;
let currentUrl = null;
let queue = [];
let onDone = null;
let playingId = null;

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  // 0,05 s de silence
  player.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  player.play().then(() => player.pause()).catch(() => {});
}

// Lit les clips d'une annotation l'un après l'autre, puis appelle then().
export async function playVoices(id, clips, then) {
  stopVoice();
  playingId = id;
  queue = [...clips];
  onDone = then || null;
  next();
}

async function next() {
  const clip = queue.shift();
  if (!clip) {
    const cb = onDone; onDone = null; playingId = null;
    notify();
    cb?.();
    return;
  }
  const blob = await blobs.get(clip.key);
  if (!blob) return next();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  player.src = currentUrl;
  notify();
  try { await player.play(); } catch { queue = []; onDone = null; playingId = null; notify(); }
}
player.onended = () => next();

export function stopVoice() {
  queue = []; onDone = null; playingId = null;
  player.pause();
  notify();
}
export const playingVoiceId = () => playingId;

const listeners = new Set();
export const onVoiceChange = (fn) => listeners.add(fn);
function notify() { listeners.forEach((fn) => fn(playingId)); }

export async function removeVoices(clips = []) {
  for (const c of clips) await blobs.remove(c.key);
}

// Pour l'export : clips -> data URL, et l'inverse à l'import.
export async function voicesToData(clips = []) {
  const out = [];
  for (const c of clips) {
    const blob = await blobs.get(c.key);
    if (!blob) continue;
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    out.push({ dur: c.dur, type: c.type, data });
  }
  return out;
}
export async function voicesFromData(clips = []) {
  const out = [];
  for (const c of clips) {
    if (!c.data) continue;
    const blob = await (await fetch(c.data)).blob();
    const key = 'voice-' + newId();
    await blobs.put(key, blob);
    out.push({ key, dur: c.dur, type: c.type || blob.type });
  }
  return out;
}
