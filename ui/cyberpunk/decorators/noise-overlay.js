/**
 * noise-overlay.js
 * Vanilla ES module port of NoiseOverlay.tsx
 * Renders a fixed fullscreen canvas of animated random grayscale pixel noise.
 * The 256x256 canvas is tiled via CSS (imageRendering: pixelated + 100vw/100vh)
 * to cover the entire viewport cheaply.
 */

/**
 * Mounts a fullscreen noise overlay canvas onto document.body and begins
 * animating random grayscale pixel noise via requestAnimationFrame.
 *
 * This decorator creates its own fixed-position canvas — it does NOT take
 * an element argument.
 *
 * @param {object} [options={}]
 * @param {number} [options.opacity=0.06]         - Canvas CSS opacity (0–1).
 * @param {number} [options.refreshInterval=3]    - Only redraw every N frames.
 * @param {number} [options.grain=20]             - Alpha channel value for pixels (0–255).
 * @returns {Function} cleanup — cancels the rAF loop, removes the canvas from
 *                               the DOM, and removes the media query listener.
 */
export function noiseOverlay(options = {}) {
  const {
    opacity = 0.06,
    refreshInterval = 3,
    grain = 20,
  } = options;

  // --- Canvas setup ---

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  canvas.setAttribute("aria-hidden", "true");

  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    zIndex: "50",
    pointerEvents: "none",
    opacity: String(opacity),
    imageRendering: "pixelated",
    width: "100vw",
    height: "100vh",
  });

  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // --- Prefers-reduced-motion ---

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function applyMotionPreference() {
    canvas.style.opacity = motionQuery.matches ? "0" : String(opacity);
  }

  applyMotionPreference();
  motionQuery.addEventListener("change", applyMotionPreference);

  // --- rAF noise loop ---

  let rafId = null;
  let frameCount = 0;

  function drawNoise() {
    frameCount++;

    if (frameCount % refreshInterval === 0) {
      const imageData = ctx.createImageData(256, 256);
      const data = imageData.data;
      const len = data.length;

      // Each pixel: grayscale (r=g=b=v), alpha=grain
      for (let i = 0; i < len; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i]     = v; // R
        data[i + 1] = v; // G
        data[i + 2] = v; // B
        data[i + 3] = grain; // A
      }

      ctx.putImageData(imageData, 0, 0);
    }

    rafId = requestAnimationFrame(drawNoise);
  }

  rafId = requestAnimationFrame(drawNoise);

  // --- Cleanup ---

  return function cleanup() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    motionQuery.removeEventListener("change", applyMotionPreference);

    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  };
}
