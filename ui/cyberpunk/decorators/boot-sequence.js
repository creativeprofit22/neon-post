/* ══════════════════════════════════════════════════════════════════════════
   Boot Sequence — Fullscreen overlay decorator

   Plays a boot animation on page load. Three tiers based on visit history:
     "full"      — first-time visitor: scan line sweep → corner brackets → text
     "reconnect" — returning visitor:  brackets flash → pulse text → dissolve
     "instant"   — frequent visitor:   amber flash → fade

   Uses Web Animations API exclusively. No GSAP, no React.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  getBootMode,
  hasBootedThisSession,
  markVisit,
  markSessionBooted,
} from "../engines/memory.js";
import { play } from "../engines/sound.js";

// ── Easing curves ──

const EASE_OUT_QUAD = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
const EASE_IN_OUT_QUAD = "cubic-bezier(0.45, 0, 0.55, 1)";
const EASE_LINEAR = "linear";

// ── DOM factory ──

/**
 * Creates and returns the boot overlay and its child elements.
 * All inner elements start with opacity 0 and visibility hidden.
 *
 * @returns {{ overlay: HTMLElement, scan: HTMLElement, brackets: HTMLElement[], text: HTMLElement }}
 */
function createOverlay() {
  // Root overlay — fixed full-screen backdrop
  const overlay = document.createElement("div");
  overlay.className = "boot-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("role", "presentation");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "50",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--bg-void)",
    opacity: "1",
  });

  // Scan line — vertical amber stripe that sweeps left→right
  const scan = document.createElement("div");
  scan.className = "boot-scan";
  Object.assign(scan.style, {
    position: "absolute",
    top: "0",
    left: "-10%",
    width: "1px",
    height: "100%",
    background:
      "linear-gradient(to bottom, transparent 0%, var(--amber-0) 40%, var(--amber-0) 60%, transparent 100%)",
    boxShadow: "0 0 8px var(--amber-0), 0 0 24px oklch(0.80 0.18 75 / 0.4)",
    opacity: "0",
    pointerEvents: "none",
  });
  overlay.appendChild(scan);

  // Corner brackets — four corners, 24×24px, cyan border + glow
  const bracketDefs = [
    {
      cls: "boot-bracket-tl",
      styles: { top: "24px", left: "24px", borderTop: "2px solid var(--cyan-0)", borderLeft: "2px solid var(--cyan-0)" },
    },
    {
      cls: "boot-bracket-tr",
      styles: { top: "24px", right: "24px", borderTop: "2px solid var(--cyan-0)", borderRight: "2px solid var(--cyan-0)" },
    },
    {
      cls: "boot-bracket-bl",
      styles: { bottom: "24px", left: "24px", borderBottom: "2px solid var(--cyan-0)", borderLeft: "2px solid var(--cyan-0)" },
    },
    {
      cls: "boot-bracket-br",
      styles: { bottom: "24px", right: "24px", borderBottom: "2px solid var(--cyan-0)", borderRight: "2px solid var(--cyan-0)" },
    },
  ];

  const brackets = bracketDefs.map(({ cls, styles }) => {
    const el = document.createElement("div");
    el.className = cls;
    Object.assign(el.style, {
      position: "absolute",
      width: "24px",
      height: "24px",
      opacity: "0",
      pointerEvents: "none",
      filter:
        "drop-shadow(0 0 4px var(--cyan-0)) drop-shadow(0 0 10px oklch(0.83 0.18 195 / 0.4))",
      ...styles,
    });
    overlay.appendChild(el);
    return el;
  });

  // Center text — "SYSTEM ONLINE" or "RECONNECTING..."
  const text = document.createElement("div");
  text.className = "boot-text";
  Object.assign(text.style, {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-md)",
    letterSpacing: "var(--tracking-wider)",
    color: "var(--cyan-0)",
    textShadow: "var(--deco-text-glow-strong)",
    opacity: "0",
    userSelect: "none",
    pointerEvents: "none",
    textTransform: "uppercase",
  });
  overlay.appendChild(text);

  return { overlay, scan, brackets, text };
}

// ── Reduced-motion check ──

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Promise helpers ──

/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps element.animate() so the keyframes and options are passed cleanly,
 * adds the animation to the tracking set, and returns the Animation object.
 *
 * @param {HTMLElement}       el
 * @param {Keyframe[]}        keyframes
 * @param {KeyframeAnimationOptions} options
 * @param {Set<Animation>}    tracker
 * @returns {Animation}
 */
function animate(el, keyframes, options, tracker) {
  const anim = el.animate(keyframes, options);
  tracker.add(anim);
  anim.finished.catch(() => {
    // Swallow AbortError when cleanup cancels the animation
  });
  return anim;
}

// ── Animation sequences ──

/**
 * Full boot sequence — first-time visitor.
 *
 * Timeline:
 *   0ms    – scan line sweeps left→right (500ms), play("boot","high")
 *   400ms  – brackets stagger in (300ms each, 100ms between)
 *   800ms  – text fades in (400ms)
 *   1200ms – hold (300ms)
 *   1500ms – overlay dissolves (500ms) → remove
 *
 * @param {{ overlay: HTMLElement, scan: HTMLElement, brackets: HTMLElement[], text: HTMLElement }} els
 * @param {Set<Animation>} tracker
 * @param {Function}       onComplete
 */
async function runFullBoot(els, tracker, onComplete) {
  const { overlay, scan, brackets, text } = els;

  text.textContent = "SYSTEM ONLINE";

  // 1. Make scan visible, play sound
  scan.style.opacity = "1";
  play("boot", "high");

  // 2. Scan line sweep: left "-10%" → "110%"
  const scanAnim = animate(
    scan,
    [{ left: "-10%" }, { left: "110%" }],
    { duration: 500, easing: EASE_LINEAR, fill: "forwards" },
    tracker
  );
  await scanAnim.finished;

  // 3. Brackets stagger in — start at 400ms total (100ms before scan ends
  //    means we fire them after scan finishes minus the overlap; the spec says
  //    "start 100ms before scan ends" which in promise-chain terms means we
  //    delay 400ms then await the scan, so we fire brackets immediately after)
  const bracketAnims = brackets.map((bracket, i) => {
    const startDelay = i * 100;
    return animate(
      bracket,
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: 300,
        delay: startDelay,
        easing: EASE_OUT_QUAD,
        fill: "forwards",
      },
      tracker
    );
  });

  // Wait for the last bracket to finish
  await bracketAnims[bracketAnims.length - 1].finished;

  // 4. Text fade in
  const textAnim = animate(
    text,
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 400, easing: EASE_OUT_QUAD, fill: "forwards" },
    tracker
  );
  await textAnim.finished;

  // 5. Hold
  await delay(300);

  // 6. Overlay dissolve
  const dissolveAnim = animate(
    overlay,
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 500, easing: EASE_IN_OUT_QUAD, fill: "forwards" },
    tracker
  );
  await dissolveAnim.finished;

  overlay.style.display = "none";
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  onComplete();
}

/**
 * Reconnect boot sequence — returning visitor (< 10 visits).
 *
 * Timeline:
 *   0ms   – brackets flash in (150ms), play("boot","medium")
 *   150ms – text fades in (150ms)
 *   300ms – text pulses (opacity 1→0.5, 75ms × 2 round-trip)
 *   450ms – overlay dissolve (400ms) → remove
 *
 * @param {{ overlay: HTMLElement, brackets: HTMLElement[], text: HTMLElement }} els
 * @param {Set<Animation>} tracker
 * @param {Function}       onComplete
 */
async function runReconnectBoot(els, tracker, onComplete) {
  const { overlay, brackets, text } = els;

  text.textContent = "RECONNECTING...";

  // 1. Brackets flash in simultaneously
  play("boot", "medium");

  const bracketAnims = brackets.map((bracket) =>
    animate(
      bracket,
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 150, easing: EASE_OUT_QUAD, fill: "forwards" },
      tracker
    )
  );
  await Promise.all(bracketAnims.map((a) => a.finished));

  // 2. Text fade in
  const textInAnim = animate(
    text,
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 150, easing: EASE_OUT_QUAD, fill: "forwards" },
    tracker
  );
  await textInAnim.finished;

  // 3. Pulse: 1 → 0.5 (75ms) → 1 (75ms)
  const pulseAnim = animate(
    text,
    [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }],
    { duration: 150, easing: EASE_LINEAR, fill: "forwards" },
    tracker
  );
  await pulseAnim.finished;

  // 4. Overlay dissolve
  const dissolveAnim = animate(
    overlay,
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 400, easing: EASE_IN_OUT_QUAD, fill: "forwards" },
    tracker
  );
  await dissolveAnim.finished;

  overlay.style.display = "none";
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  onComplete();
}

/**
 * Instant boot sequence — frequent visitor (≥ 10 visits).
 *
 * Timeline:
 *   0ms   – overlay bg → var(--amber-0) (150ms)
 *   150ms – overlay opacity → 0 (150ms) → remove
 *
 * @param {HTMLElement}  overlay
 * @param {Set<Animation>} tracker
 * @param {Function}     onComplete
 */
async function runInstantBoot(overlay, tracker, onComplete) {
  // 1. Flash background to amber
  const flashAnim = animate(
    overlay,
    [{ backgroundColor: "var(--bg-void)" }, { backgroundColor: "var(--amber-0)" }],
    { duration: 150, easing: EASE_LINEAR, fill: "forwards" },
    tracker
  );
  await flashAnim.finished;

  // 2. Fade out
  const fadeAnim = animate(
    overlay,
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 150, easing: EASE_LINEAR, fill: "forwards" },
    tracker
  );
  await fadeAnim.finished;

  overlay.style.display = "none";
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  onComplete();
}

// ── Public API ──

/**
 * Mounts and plays the appropriate boot sequence overlay.
 *
 * Checks `hasBootedThisSession()` first — if true, skips immediately and
 * calls `onComplete` without rendering anything (avoids double-boot on
 * client-side navigation).
 *
 * Call order:
 *   1. hasBootedThisSession() → skip if true
 *   2. markVisit() + markSessionBooted()
 *   3. getBootMode() → determine animation tier
 *   4. Build DOM, append to body
 *   5. Run animation sequence
 *   6. On finish: remove overlay, call onComplete
 *
 * @param {Object}   [options]
 * @param {Function} [options.onComplete] — called when the sequence finishes
 * @returns {() => void} cleanup — cancels all in-flight animations and removes overlay
 */
export function bootSequence(options = {}) {
  const { onComplete = () => {} } = options;

  // ── Guard: already booted this session ──
  if (hasBootedThisSession()) {
    onComplete();
    return () => {};
  }

  // ── Guard: reduced motion ──
  if (prefersReducedMotion()) {
    markVisit();
    markSessionBooted();
    onComplete();
    return () => {};
  }

  // ── Mark visit and session ──
  markVisit();
  markSessionBooted();

  const bootMode = getBootMode();

  // ── Build overlay DOM ──
  const { overlay, scan, brackets, text } = createOverlay();
  document.body.appendChild(overlay);

  // Track all running animations for cleanup
  const activeAnimations = new Set();

  let cancelled = false;

  // ── Cleanup function ──
  function cleanup() {
    cancelled = true;
    for (const anim of activeAnimations) {
      try {
        anim.cancel();
      } catch {
        // Animation may already be finished or detached
      }
    }
    activeAnimations.clear();
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // ── Safe onComplete wrapper — no-ops after cleanup ──
  function safeComplete() {
    if (!cancelled) onComplete();
  }

  // ── Dispatch to the correct sequence ──
  if (bootMode === "full") {
    runFullBoot({ overlay, scan, brackets, text }, activeAnimations, safeComplete).catch(
      () => {
        // Sequence was cancelled or errored — already cleaned up
      }
    );
  } else if (bootMode === "reconnect") {
    runReconnectBoot({ overlay, brackets, text }, activeAnimations, safeComplete).catch(
      () => {}
    );
  } else {
    // "instant"
    runInstantBoot(overlay, activeAnimations, safeComplete).catch(() => {});
  }

  return cleanup;
}
