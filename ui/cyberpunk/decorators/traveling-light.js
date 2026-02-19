/**
 * traveling-light.js
 * Vanilla ES module — cyberpunk conic-gradient rotating border decorator.
 *
 * Ports the TravelingLight React component to a plain imperative function.
 * Uses @property --border-angle for the conic-gradient sweep animation and
 * optionally syncs a box-shadow glow to the heartbeat engine phase.
 */

import { subscribe } from "../engines/heartbeat.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const STYLE_TAG_ID = "traveling-light-keyframes";

const VOLTAGE_DURATIONS = {
  low: "6s",
  medium: "3s",
  high: "1s",
};

// ─── Style injection (singleton) ─────────────────────────────────────────────

/**
 * Injects the @property declaration and @keyframes block into <head> exactly
 * once. Subsequent calls are no-ops.
 */
function injectSharedStyles() {
  if (document.getElementById(STYLE_TAG_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;

  // @property is required so the browser can interpolate --border-angle as an
  // <angle> type. Without it the conic-gradient can't be animated via CSS
  // because the browser treats custom properties as opaque strings.
  style.textContent = `
@property --border-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes border-rotate {
  to {
    --border-angle: 360deg;
  }
}
`.trim();

  document.head.appendChild(style);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Produces an oklch color string with the alpha channel inserted.
 * For any other color format the alpha is appended as a CSS color-mix fallback
 * via opacity trick — actually we keep it simple: wrap in oklch if possible,
 * otherwise build a CSS `color-mix` expression so we never silently drop alpha.
 *
 * Rules (matching TravelingLight.tsx):
 *   - If the value starts with "oklch(" and contains no "/" already, replace
 *     the closing ")" with " / {alpha})".
 *   - Otherwise return the color unchanged (caller handles opacity differently).
 *
 * @param {string} color
 * @param {number} alpha  0–1
 * @returns {string}
 */
function colorWithAlpha(color, alpha) {
  const trimmed = color.trim();
  if (trimmed.startsWith("oklch(") && !trimmed.includes("/")) {
    // e.g. "oklch(0.8 0.2 200)" → "oklch(0.8 0.2 200 / 0.45)"
    return trimmed.slice(0, -1) + ` / ${alpha.toFixed(4)})`;
  }
  return trimmed;
}

/**
 * Checks the OS-level reduced-motion preference.
 *
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attaches a rotating conic-gradient border to an element.
 *
 * @param {HTMLElement} el        — target element
 * @param {Object}      [options]
 * @param {"low"|"medium"|"high"} [options.voltage="medium"]
 *   Controls animation speed: low = 6 s, medium = 3 s, high = 1 s.
 * @param {string}  [options.color="var(--cyan-0)"]
 *   CSS color value for the traveling light and optional glow.
 * @param {boolean} [options.glow=false]
 *   When true a heartbeat-synced box-shadow is added.  Skipped automatically
 *   when the user has enabled prefers-reduced-motion.
 *
 * @returns {() => void} cleanup — restores the element to its original state
 *   and unsubscribes from the heartbeat engine.
 */
export function travelingLight(el, options = {}) {
  const {
    voltage = "medium",
    color = "var(--cyan-0)",
    glow = false,
  } = options;

  // --- 1. Inject shared @property + @keyframes (once per document) ----------
  injectSharedStyles();

  // --- 2. Derive animation parameters from voltage --------------------------
  const duration = VOLTAGE_DURATIONS[voltage] ?? VOLTAGE_DURATIONS.medium;

  // High voltage keeps the reveal gap tighter so the streak feels snappier.
  const revealStart = voltage === "high" ? "50%" : "70%";

  // --- 3. Snapshot original inline styles so cleanup can restore them -------
  const originalBorder = el.style.border;
  const originalBackground = el.style.background;
  const originalAnimation = el.style.animation;
  const originalTransition = el.style.transition;
  const originalBoxShadow = el.style.boxShadow;

  // --- 4. Apply border + background + animation ----------------------------
  //
  // The trick: the element has a 1px transparent border so the border-box clip
  // region exists.  The background is split into two layers:
  //   • padding-box layer  — the solid fill (uses CSS variables from the theme)
  //   • border-box layer   — the conic-gradient that rotates via --border-angle
  //
  // Because @property typed --border-angle as <angle>, the browser can tween it
  // smoothly, making the sweep appear to travel around the element's perimeter.

  el.style.border = "1px solid transparent";
  el.style.background = [
    `linear-gradient(135deg, var(--color-bg-raised), var(--color-bg-elevated), var(--color-bg-raised)) padding-box`,
    `conic-gradient(from var(--border-angle), transparent ${revealStart}, ${color} 90%, transparent 100%) border-box`,
  ].join(", ");
  el.style.animation = `border-rotate ${duration} linear infinite`;
  el.style.transition = "box-shadow 150ms ease";

  // --- 5. Set data attribute for external targeting / debugging -------------
  el.dataset.voltage = voltage;

  // --- 6. Optional heartbeat-synced glow -----------------------------------
  //
  // Phase runs 0 → 1 over each beat.  We want glow intensity to peak at beat
  // onset (phase ≈ 0) and fade toward the next beat (phase ≈ 1), so we use:
  //
  //   opacity = base + (1 - phase) * amplitude
  //
  // giving a bright flash at phase=0 (opacity = base + amplitude = 0.50) that
  // dims to base (0.15) by phase=1.

  const BASE_OPACITY = 0.15;
  const AMPLITUDE = 0.35;

  let unsubscribeHeartbeat = null;

  if (glow && !prefersReducedMotion()) {
    unsubscribeHeartbeat = subscribe((phase) => {
      const opacity = BASE_OPACITY + (1 - phase) * AMPLITUDE;
      const inner = colorWithAlpha(color, opacity);
      const outer = colorWithAlpha(color, opacity * 0.4);
      el.style.boxShadow = `0 0 12px ${inner}, 0 0 32px ${outer}`;
    });
  }

  // --- 7. Cleanup -----------------------------------------------------------
  return function cleanup() {
    // Unsubscribe from heartbeat before touching styles so the rAF callback
    // can't fire one last time after we've already reset boxShadow.
    if (unsubscribeHeartbeat) {
      unsubscribeHeartbeat();
      unsubscribeHeartbeat = null;
    }

    el.style.border = originalBorder;
    el.style.background = originalBackground;
    el.style.animation = originalAnimation;
    el.style.transition = originalTransition;
    el.style.boxShadow = originalBoxShadow;

    delete el.dataset.voltage;
  };
}
