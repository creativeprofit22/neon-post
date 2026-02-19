/* ══════════════════════════════════════════════════════════════════════════
   Sound Engine — Module-level singleton

   Web Audio API tone synthesizer. Lazy-inits AudioContext on first user
   interaction. Plays short ADSR-enveloped tones with pitch sweeps and
   voltage scaling. Respects prefers-reduced-motion and autoplay policy.
   ══════════════════════════════════════════════════════════════════════════ */

let audioCtx = null;
let masterGain = null;
let hasUserInteracted = false;
let prefersReducedMotion = false;

let muted = false;
let volume = 0.15;
let stateListeners = new Set();

const STORAGE_KEY_MUTED = "cyberpunk-sound-muted";
const STORAGE_KEY_VOLUME = "cyberpunk-sound-volume";

// ── Tone definitions ──

const tones = {
  click:        { frequency: 660, duration: 0.06, type: "sine",     volume: 0.08, attack: 0.003 },
  hover:        { frequency: 440, duration: 0.04, type: "sine",     volume: 0.03, attack: 0.002 },
  success:      { frequency: 523, endFrequency: 784, duration: 0.15, type: "sine",     volume: 0.1,  attack: 0.005 },
  error:        { frequency: 220, endFrequency: 110, duration: 0.2,  type: "sawtooth", volume: 0.12, attack: 0.005 },
  warning:      { frequency: 880, duration: 0.12, type: "triangle", volume: 0.1,  attack: 0.005 },
  notification: { frequency: 587, endFrequency: 784, duration: 0.1,  type: "sine",     volume: 0.08, attack: 0.003 },
  boot:         { frequency: 110, endFrequency: 880, duration: 0.8,  type: "sawtooth", volume: 0.06, attack: 0.01 },
};

// ── Voltage scaling ──

const voltageMultiplier = { low: 0.4, medium: 1.0, high: 1.6 };

// ── SSR-safe init ──

if (typeof window !== "undefined") {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion = mql.matches;
  mql.addEventListener("change", (e) => {
    prefersReducedMotion = e.matches;
  });

  try {
    const storedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
    if (storedMuted !== null) muted = storedMuted === "true";
    const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (storedVolume !== null) volume = parseFloat(storedVolume);
  } catch {
    // localStorage unavailable
  }

  const unlock = () => {
    hasUserInteracted = true;
    ensureResumed();
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchend", unlock);
  };
  window.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchend", unlock);
}

// ── AudioContext management ──

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function ensureResumed() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume();
  }
}

// ── Playback ──

export function play(name, voltage = "medium") {
  if (prefersReducedMotion) return;
  if (!hasUserInteracted) return;
  if (muted) return;

  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  ensureResumed();

  const tone = tones[name];
  if (!tone) return;
  const now = ctx.currentTime;
  const release = tone.release ?? tone.attack * 2;
  const peakVolume = tone.volume * voltageMultiplier[voltage];

  const osc = ctx.createOscillator();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.frequency, now);
  if (tone.endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(tone.endFrequency, now + tone.duration);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peakVolume, now + tone.attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration + release);

  osc.connect(env);
  env.connect(masterGain);

  osc.start(now);
  osc.stop(now + tone.duration + release + 0.02);
}

// ── Controls ──

function notifyListeners() {
  for (const fn of stateListeners) fn();
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, String(value));
  } catch {
    // localStorage unavailable
  }
  notifyListeners();
}

export function getMuted() {
  return muted;
}

export function setVolume(value) {
  volume = Math.max(0, Math.min(1, value));
  if (masterGain) {
    masterGain.gain.value = volume;
  }
  try {
    localStorage.setItem(STORAGE_KEY_VOLUME, String(volume));
  } catch {
    // localStorage unavailable
  }
  notifyListeners();
}

export function getVolume() {
  return volume;
}

export function subscribe(fn) {
  stateListeners.add(fn);
  return () => {
    stateListeners.delete(fn);
  };
}
