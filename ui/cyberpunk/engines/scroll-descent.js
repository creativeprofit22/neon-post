/* ══════════════════════════════════════════════════════════════════════════
   Scroll Descent Engine — Module-level singleton

   Tracks normalized scroll depth (0.0-1.0) from the #main-content scroll
   container. CSS custom properties and a data attribute on <html>.
   A CustomEvent fires on tier transitions.
   ══════════════════════════════════════════════════════════════════════════ */

let depth = 0;
let tier = "surface";
let listeners = new Set();
let container = null;
let pollId = null;
let started = false;

function computeTier(d) {
  if (d < 0.25) return "surface";
  if (d < 0.5) return "mid";
  if (d < 0.75) return "deep";
  return "abyss";
}

function applyCSS() {
  const root = document.documentElement;
  root.style.setProperty("--scroll-depth", String(depth));
  root.style.setProperty("--scroll-hue-shift", String(depth * 75));
  root.setAttribute("data-scroll-depth", tier);
}

function onScroll() {
  if (!container) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  const maxScroll = scrollHeight - clientHeight;
  depth = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;

  const newTier = computeTier(depth);
  if (newTier !== tier) {
    const prevTier = tier;
    tier = newTier;
    document.dispatchEvent(
      new CustomEvent("scroll-descent", {
        detail: { depth, tier, prevTier },
      })
    );
  }

  applyCSS();
  for (const fn of listeners) fn(depth, tier);
}

function bind(el) {
  container = el;
  container.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function pollForContainer() {
  const el = document.getElementById("main-content");
  if (el) {
    pollId = null;
    bind(el);
    return;
  }
  pollId = requestAnimationFrame(pollForContainer);
}

export function startEngine() {
  if (started) return;
  started = true;

  const el = document.getElementById("main-content");
  if (el) {
    bind(el);
  } else {
    pollId = requestAnimationFrame(pollForContainer);
  }
}

export function stopEngine() {
  if (!started) return;
  started = false;

  if (pollId !== null) {
    cancelAnimationFrame(pollId);
    pollId = null;
  }
  if (container) {
    container.removeEventListener("scroll", onScroll);
    container = null;
  }

  const root = document.documentElement;
  root.style.removeProperty("--scroll-depth");
  root.style.removeProperty("--scroll-hue-shift");
  root.removeAttribute("data-scroll-depth");
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getDepth() {
  return depth;
}

export function getTier() {
  return tier;
}
