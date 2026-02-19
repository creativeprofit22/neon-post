/* ══════════════════════════════════════════════════════════════════════════
   Heartbeat Engine — Module-level singleton

   A global rAF loop that drives a 0->1 phase cycle at a configurable BPM.
   CSS gets the phase via --heartbeat-phase on <html>.
   A CustomEvent fires on each beat crossing.
   ══════════════════════════════════════════════════════════════════════════ */

let phase = 0;
let bpm = 60;
let beatCount = 0;
let irregular = false;
let currentInterval = 60000 / bpm;
let listeners = new Set();
let frameId = null;
let lastBeatTime = 0;
let prefersReducedMotion = false;

// Check reduced-motion preference
if (typeof window !== "undefined") {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion = mql.matches;
  mql.addEventListener("change", (e) => {
    prefersReducedMotion = e.matches;
  });
}

function nextInterval() {
  const base = 60000 / bpm;
  if (!irregular) return base;
  const jitter = 1 + (Math.random() * 0.3 - 0.15);
  return base * jitter;
}

function tick(now) {
  const elapsed = now - lastBeatTime;
  phase = Math.min(elapsed / currentInterval, 1);

  if (elapsed >= currentInterval) {
    beatCount++;
    lastBeatTime = now;
    phase = 0;
    currentInterval = nextInterval();

    document.dispatchEvent(
      new CustomEvent("heartbeat", {
        detail: { beat: beatCount, bpm, phase: 0 },
      })
    );
  }

  if (!prefersReducedMotion) {
    document.documentElement.style.setProperty(
      "--heartbeat-phase",
      String(phase)
    );
  }

  for (const fn of listeners) fn(phase);

  frameId = requestAnimationFrame(tick);
}

export function startHeartbeat() {
  if (frameId !== null) return;
  lastBeatTime = performance.now();
  currentInterval = nextInterval();
  frameId = requestAnimationFrame(tick);
}

export function stopHeartbeat() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setBPM(newBpm) {
  bpm = Math.max(1, Math.min(300, newBpm));
  currentInterval = nextInterval();
}

export function setIrregular(enabled) {
  irregular = enabled;
  currentInterval = nextInterval();
}

export function getPhase() {
  return phase;
}

export function getBeatCount() {
  return beatCount;
}

export function getBPM() {
  return bpm;
}
