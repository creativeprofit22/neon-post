/**
 * status-dot.js
 * Vanilla ES module port of StatusDot.tsx
 * Creates a small LED-like circular indicator with optional heartbeat-synced glow.
 */

import { subscribe } from "../engines/heartbeat.js";

const COLOR_VARS = {
  cyan:    "var(--cyan-0)",
  magenta: "var(--magenta-0)",
  violet:  "var(--violet-0)",
  green:   "var(--green-0)",
  red:     "var(--red-0)",
  amber:   "var(--amber-0)",
};

const SIZES = {
  sm: "8px",
  md: "12px",
};

const reducedMotionMql =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
  return reducedMotionMql ? reducedMotionMql.matches : false;
}

/**
 * Creates and returns a new LED-like status dot `<span>` element.
 *
 * @param {object} [options={}]
 * @param {"cyan"|"magenta"|"violet"|"green"|"red"|"amber"} [options.color="green"]
 * @param {boolean} [options.pulse=true] - Enable led-flicker animation and heartbeat glow.
 * @param {"sm"|"md"} [options.size="sm"] - "sm" = 8px, "md" = 12px.
 * @param {string} [options.label] - Screen-reader-only accessible label. Omit for aria-hidden.
 * @returns {{ el: HTMLSpanElement, cleanup: Function }}
 */
export function statusDot(options = {}) {
  const {
    color = "green",
    pulse = true,
    size = "sm",
    label,
  } = options;

  const glowColor = COLOR_VARS[color] ?? COLOR_VARS.green;
  const dimension = SIZES[size] ?? SIZES.sm;

  // --- Build the element ---

  const el = document.createElement("span");

  el.style.display = "inline-block";
  el.style.width = dimension;
  el.style.height = dimension;
  el.style.borderRadius = "9999px";
  el.style.backgroundColor = glowColor;
  el.style.flexShrink = "0";

  // Animation: warmup always plays; flicker only when pulse=true.
  el.style.animation = pulse
    ? "led-warmup 0.5s ease-out, led-flicker 4s ease-in-out 0.5s infinite"
    : "led-warmup 0.5s ease-out forwards";

  // --- Accessibility ---

  if (label) {
    const srLabel = document.createElement("span");
    srLabel.textContent = label;
    // sr-only styles — visually hidden but readable by assistive tech.
    srLabel.style.position = "absolute";
    srLabel.style.width = "1px";
    srLabel.style.height = "1px";
    srLabel.style.overflow = "hidden";
    srLabel.style.clip = "rect(0 0 0 0)";
    el.appendChild(srLabel);
  } else {
    el.setAttribute("aria-hidden", "true");
  }

  // --- Heartbeat-synced glow ---

  let unsubscribe = null;

  if (pulse && !prefersReducedMotion()) {
    const BASE = 0.4;
    const AMPLITUDE = 0.6;

    unsubscribe = subscribe((phase) => {
      const opacity = BASE + (1 - phase) * AMPLITUDE;
      el.style.boxShadow = `0 0 8px oklch(from ${glowColor} l c h / ${opacity.toFixed(2)})`;
    });
  }

  // --- cleanup ---

  function cleanup() {
    if (unsubscribe !== null) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return { el, cleanup };
}
