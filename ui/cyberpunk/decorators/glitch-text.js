/**
 * glitch-text.js
 * Vanilla ES module port of GlitchText.tsx
 * Applies a text-shadow glitch effect via direct DOM manipulation.
 */

const variantShadows = {
  red: "3px 0 var(--red-0), -3px 0 var(--cyan-0)",
  cyan: "3px 0 var(--cyan-0), -3px 0 var(--red-0)",
  violet: "3px 0 var(--violet-0), -3px 0 var(--cyan-0)",
};

const continuousShadows = {
  red: "2px 0 oklch(from var(--red-0) l c h / 0.6), -2px 0 oklch(from var(--cyan-0) l c h / 0.6)",
  cyan: "2px 0 oklch(from var(--cyan-0) l c h / 0.6), -2px 0 oklch(from var(--red-0) l c h / 0.6)",
  violet: "2px 0 oklch(from var(--violet-0) l c h / 0.6), -2px 0 oklch(from var(--cyan-0) l c h / 0.6)",
};

/**
 * Applies a text-shadow glitch effect to a DOM element.
 *
 * @param {HTMLElement} el - The element to apply the glitch effect to.
 * @param {object} [options={}]
 * @param {number} [options.duration=300] - Glitch hold time in ms before the shadow fades out.
 * @param {"red"|"cyan"|"violet"} [options.variant="red"] - Color variant for the shadow.
 * @param {boolean} [options.skew=false] - If true, apply a skew-snap animation during glitch.
 * @param {boolean} [options.continuous=false] - If true, show a subtle persistent shadow on mouseenter.
 * @returns {{ trigger: Function, cleanup: Function }}
 */
export function glitchText(el, options = {}) {
  const {
    duration = 300,
    variant = "red",
    skew = false,
    continuous = false,
  } = options;

  // Capture original styles so cleanup can fully restore them.
  const originalTransition = el.style.transition;
  const originalTextShadow = el.style.textShadow;
  const originalAnimation = el.style.animation;

  let fadeTimeout = null;
  let animationTimeout = null;

  // --- Continuous hover listeners ---

  function onMouseEnter() {
    el.style.textShadow = continuousShadows[variant];
  }

  function onMouseLeave() {
    el.style.textShadow = originalTextShadow;
  }

  if (continuous) {
    el.addEventListener("mouseenter", onMouseEnter);
    el.addEventListener("mouseleave", onMouseLeave);
  }

  // --- trigger ---

  function trigger() {
    // Clear any in-flight fade from a previous trigger call.
    if (fadeTimeout !== null) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
    if (animationTimeout !== null) {
      clearTimeout(animationTimeout);
      animationTimeout = null;
    }

    // Phase 1: kill transition, snap shadow on, force reflow.
    el.style.transition = "none";
    el.style.textShadow = variantShadows[variant];

    if (skew) {
      el.style.animation = "skew-snap 0.2s ease-out";
    }

    // Force reflow so the browser registers the instant state change.
    void el.offsetHeight;

    // Phase 2: restore transition and fade shadow back out after duration.
    fadeTimeout = setTimeout(() => {
      fadeTimeout = null;
      el.style.transition = `text-shadow ${duration}ms linear`;
      el.style.textShadow = continuous ? continuousShadows[variant] : "none";

      if (skew) {
        // Clear the animation after it has had time to play.
        animationTimeout = setTimeout(() => {
          animationTimeout = null;
          el.style.animation = originalAnimation;
        }, 200);
      }
    }, duration);
  }

  // --- cleanup ---

  function cleanup() {
    if (fadeTimeout !== null) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
    if (animationTimeout !== null) {
      clearTimeout(animationTimeout);
      animationTimeout = null;
    }

    if (continuous) {
      el.removeEventListener("mouseenter", onMouseEnter);
      el.removeEventListener("mouseleave", onMouseLeave);
    }

    el.style.transition = originalTransition;
    el.style.textShadow = originalTextShadow;
    el.style.animation = originalAnimation;
  }

  return { trigger, cleanup };
}
