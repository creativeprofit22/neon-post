/* ══════════════════════════════════════════════════════════════════════════
   System Health Engine — Module-level singleton

   A global rAF loop that drives visual degradation based on a 0-100 health
   value. CSS custom properties and data attributes are written to <html>.
   A CustomEvent fires on tier transitions.
   ══════════════════════════════════════════════════════════════════════════ */

const TIER_CSS = {
  healthy:  { scanlineOpacity: -1, glowMultiplier: -1 },
  warning:  { scanlineOpacity: 0.375, glowMultiplier: 0.7 },
  critical: { scanlineOpacity: 0.625, glowMultiplier: 0.4 },
  terminal: { scanlineOpacity: 1.0, glowMultiplier: 0.15 },
};

let health = 100;
let tier = "healthy";
let listeners = new Set();
let frameId = null;

function computeTier(h) {
  if (h >= 75) return "healthy";
  if (h >= 40) return "warning";
  if (h >= 15) return "critical";
  return "terminal";
}

function applyCSS() {
  const root = document.documentElement;
  root.style.setProperty("--system-health", String(health));
  root.setAttribute("data-health-tier", tier);

  const cfg = TIER_CSS[tier];
  if (cfg.scanlineOpacity < 0) {
    root.style.removeProperty("--deco-scanline-opacity");
    root.style.removeProperty("--deco-glow-multiplier");
  } else {
    root.style.setProperty("--deco-scanline-opacity", String(cfg.scanlineOpacity));
    root.style.setProperty("--deco-glow-multiplier", String(cfg.glowMultiplier));
  }
}

function tick() {
  applyCSS();
  for (const fn of listeners) fn(health, tier);
  frameId = requestAnimationFrame(tick);
}

export function startEngine() {
  if (frameId !== null) return;
  applyCSS();
  frameId = requestAnimationFrame(tick);
}

export function stopEngine() {
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

export function setHealth(value) {
  health = Math.max(0, Math.min(100, value));
  const newTier = computeTier(health);
  if (newTier !== tier) {
    const prevTier = tier;
    tier = newTier;
    document.dispatchEvent(
      new CustomEvent("system-health", {
        detail: { health, tier, prevTier },
      })
    );
  }
}

export function adjustHealth(delta) {
  setHealth(health + delta);
}

export function getHealth() {
  return health;
}

export function getTier() {
  return tier;
}
