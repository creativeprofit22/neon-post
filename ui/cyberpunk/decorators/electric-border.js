/**
 * electric-border.js
 * Vanilla ES module — cyberpunk electric border decorator.
 *
 * Draws an animated, jittery electric energy border on a canvas using
 * 2D value noise displacement. Mirrors the React ElectricBorder component.
 */

// ---------------------------------------------------------------------------
// Noise functions
// ---------------------------------------------------------------------------

/**
 * Seeded pseudo-random scalar in [-1, 1) derived from a single integer.
 *
 * @param {number} x
 * @returns {number}
 */
function random(x) {
  return (Math.sin(x * 12.9898) * 43758.5453) % 1;
}

/**
 * 2D value noise with smooth (Hermite) interpolation.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function noise2D(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const a = random(i + j * 57);
  const b = random(i + 1 + j * 57);
  const c = random(i + (j + 1) * 57);
  const d = random(i + 1 + (j + 1) * 57);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    a * (1 - ux) * (1 - uy) +
    b * ux * (1 - uy) +
    c * (1 - ux) * uy +
    d * ux * uy
  );
}

/**
 * Fractional Brownian Motion — sums multiple octaves of noise2D.
 *
 * @param {number} x              — perimeter position [0, 1]
 * @param {number} octaves
 * @param {number} lacunarity     — frequency multiplier per octave
 * @param {number} gain           — amplitude multiplier per octave
 * @param {number} baseAmplitude
 * @param {number} baseFrequency
 * @param {number} time
 * @param {number} seed
 * @param {number} baseFlatness   — extra damping on the first octave
 * @returns {number}
 */
function octavedNoise(x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) {
  let y = 0;
  let amplitude = baseAmplitude;
  let frequency = baseFrequency;

  for (let i = 0; i < octaves; i++) {
    let octaveAmplitude = amplitude;
    if (i === 0) octaveAmplitude *= baseFlatness;
    y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return y;
}

// ---------------------------------------------------------------------------
// Rounded-rect perimeter sampling
// ---------------------------------------------------------------------------

/**
 * Returns a point on the arc of a rounded corner.
 *
 * @param {number} cx         — arc centre x
 * @param {number} cy         — arc centre y
 * @param {number} r          — corner radius
 * @param {number} startAngle — arc start in radians
 * @param {number} arcLen     — total arc sweep in radians
 * @param {number} progress   — [0, 1] along the arc
 * @returns {{x: number, y: number}}
 */
function getCornerPoint(cx, cy, r, startAngle, arcLen, progress) {
  const angle = startAngle + progress * arcLen;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * Maps t ∈ [0, 1) to a point on the perimeter of a rounded rectangle.
 *
 * The perimeter is divided into 8 segments (4 straight edges + 4 quarter-arc
 * corners) weighted by their actual arc-length so that t advances uniformly
 * with respect to distance.
 *
 * @param {number} t         — normalised perimeter position [0, 1)
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @param {number} radius    — corner radius (clamped to half the shorter side)
 * @returns {{x: number, y: number}}
 */
function getRoundedRectPoint(t, left, top, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const PI = Math.PI;
  const HALF_PI = PI / 2;

  // Arc length of one quarter-circle corner
  const arcLen = HALF_PI * r;

  // Straight segment lengths
  const topLen    = width  - 2 * r;
  const rightLen  = height - 2 * r;
  const bottomLen = width  - 2 * r;
  const leftLen   = height - 2 * r;

  const totalLen = topLen + arcLen + rightLen + arcLen + bottomLen + arcLen + leftLen + arcLen;

  // Normalise t so it wraps cleanly
  const d = ((t % 1) + 1) % 1 * totalLen;

  // Walk each segment in order: top-straight → TR corner → right-straight →
  // BR corner → bottom-straight → BL corner → left-straight → TL corner
  let cursor = 0;

  // 1. Top straight (left+r, top) → (right-r, top)
  if (d < cursor + topLen) {
    const p = (d - cursor) / topLen;
    return { x: left + r + p * topLen, y: top };
  }
  cursor += topLen;

  // 2. Top-right corner — centre (right-r, top+r), from -PI/2 to 0
  if (d < cursor + arcLen) {
    const p = (d - cursor) / arcLen;
    return getCornerPoint(left + width - r, top + r, r, -HALF_PI, HALF_PI, p);
  }
  cursor += arcLen;

  // 3. Right straight (right, top+r) → (right, bottom-r)
  if (d < cursor + rightLen) {
    const p = (d - cursor) / rightLen;
    return { x: left + width, y: top + r + p * rightLen };
  }
  cursor += rightLen;

  // 4. Bottom-right corner — centre (right-r, bottom-r), from 0 to PI/2
  if (d < cursor + arcLen) {
    const p = (d - cursor) / arcLen;
    return getCornerPoint(left + width - r, top + height - r, r, 0, HALF_PI, p);
  }
  cursor += arcLen;

  // 5. Bottom straight (right-r, bottom) → (left+r, bottom)
  if (d < cursor + bottomLen) {
    const p = (d - cursor) / bottomLen;
    return { x: left + width - r - p * bottomLen, y: top + height };
  }
  cursor += bottomLen;

  // 6. Bottom-left corner — centre (left+r, bottom-r), from PI/2 to PI
  if (d < cursor + arcLen) {
    const p = (d - cursor) / arcLen;
    return getCornerPoint(left + r, top + height - r, r, HALF_PI, HALF_PI, p);
  }
  cursor += arcLen;

  // 7. Left straight (left, bottom-r) → (left, top+r)
  if (d < cursor + leftLen) {
    const p = (d - cursor) / leftLen;
    return { x: left, y: top + height - r - p * leftLen };
  }
  cursor += leftLen;

  // 8. Top-left corner — centre (left+r, top+r), from PI to 3*PI/2
  const p = (d - cursor) / arcLen;
  return getCornerPoint(left + r, top + r, r, PI, HALF_PI, p);
}

// ---------------------------------------------------------------------------
// Inline style helpers
// ---------------------------------------------------------------------------

/**
 * Applies a plain object of camelCase style properties to an element.
 *
 * @param {HTMLElement} el
 * @param {Object}      styles
 */
function applyStyles(el, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    el.style[prop] = value;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attaches an animated electric border to an element.
 *
 * The function injects a canvas (for the noise-displaced stroke) and several
 * glow layers as siblings to the element's existing children. All DOM and
 * style changes are reversed by the returned cleanup function.
 *
 * @param {HTMLElement} el        — target element
 * @param {Object}      [options]
 * @param {string}      [options.color="#00e5ff"]   — base stroke / glow color
 * @param {number}      [options.speed=1]            — animation speed multiplier
 * @param {number}      [options.chaos=0.12]         — noise displacement amplitude
 * @param {number}      [options.borderRadius=0]     — corner radius in px
 * @returns {() => void} cleanup
 */
export function electricBorder(el, options = {}) {
  const {
    color         = "#00e5ff",
    speed         = 1,
    chaos         = 0.12,
    borderRadius  = 0,
  } = options;

  // -------------------------------------------------------------------------
  // 1. Prepare the host element
  // -------------------------------------------------------------------------
  const originalPosition  = el.style.position;
  const originalOverflow  = el.style.overflow;
  const originalIsolation = el.style.isolation;
  const originalColorProp = el.style.getPropertyValue("--electric-border-color");

  const computedPos = getComputedStyle(el).position;
  const needsPosition =
    computedPos !== "absolute" &&
    computedPos !== "fixed" &&
    computedPos !== "sticky" &&
    computedPos !== "relative";

  if (needsPosition) el.style.position = "relative";
  el.style.overflow  = "visible";
  el.style.isolation = "isolate";
  el.style.setProperty("--electric-border-color", color);

  // -------------------------------------------------------------------------
  // 2. Wrap existing children in eb-content
  // -------------------------------------------------------------------------
  const existingChildren = Array.from(el.childNodes);

  const content = document.createElement("div");
  content.className = "eb-content";
  applyStyles(content, {
    position: "relative",
    zIndex:   "1",
  });

  for (const child of existingChildren) {
    content.appendChild(child);
  }
  el.appendChild(content);

  // -------------------------------------------------------------------------
  // 3. Create canvas container + canvas
  // -------------------------------------------------------------------------
  const canvasContainer = document.createElement("div");
  canvasContainer.className = "eb-canvas-container";
  applyStyles(canvasContainer, {
    position:      "absolute",
    top:           "50%",
    left:          "50%",
    transform:     "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex:        "2",
    overflow:      "visible",
  });

  const canvas = document.createElement("canvas");
  canvas.className = "eb-canvas";
  applyStyles(canvas, {
    display: "block",
  });
  canvasContainer.appendChild(canvas);
  el.appendChild(canvasContainer);

  // -------------------------------------------------------------------------
  // 4. Create glow layers
  // -------------------------------------------------------------------------
  const layers = document.createElement("div");
  layers.className = "eb-layers";
  applyStyles(layers, {
    position:      "absolute",
    inset:         "0",
    pointerEvents: "none",
    zIndex:        "0",
    borderRadius:  borderRadius ? `${borderRadius}px` : "0",
  });

  // Glow 1 — subtle, lower opacity
  const glow1 = document.createElement("div");
  glow1.className = "eb-glow-1";
  applyStyles(glow1, {
    position:     "absolute",
    inset:        "0",
    border:       `2px solid oklch(from ${color} l c h / 0.6)`,
    borderRadius: borderRadius ? `${borderRadius}px` : "0",
    filter:       "blur(1px)",
    boxSizing:    "border-box",
  });

  // Glow 2 — full color, wider blur
  const glow2 = document.createElement("div");
  glow2.className = "eb-glow-2";
  applyStyles(glow2, {
    position:     "absolute",
    inset:        "0",
    border:       `2px solid ${color}`,
    borderRadius: borderRadius ? `${borderRadius}px` : "0",
    filter:       "blur(4px)",
    boxSizing:    "border-box",
  });

  // Background glow — soft radial halo behind the element
  const bgGlow = document.createElement("div");
  bgGlow.className = "eb-background-glow";
  applyStyles(bgGlow, {
    position:   "absolute",
    inset:      "0",
    zIndex:     "-1",
    transform:  "scale(1.1)",
    filter:     "blur(32px)",
    opacity:    "0.3",
    background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
    borderRadius: borderRadius ? `${borderRadius}px` : "0",
  });

  layers.appendChild(glow1);
  layers.appendChild(glow2);
  layers.appendChild(bgGlow);
  el.appendChild(layers);

  // -------------------------------------------------------------------------
  // 5. Draw constants
  // -------------------------------------------------------------------------
  const OCTAVES      = 10;
  const LACUNARITY   = 1.6;
  const GAIN         = 0.7;
  const FREQUENCY    = 10;
  const BASE_FLATNESS = 0;
  const DISPLACEMENT = 60;
  const BORDER_OFFSET = 60;
  const SAMPLE_COUNT = 200;
  const SEED         = Math.random() * 100;

  // Device pixel ratio — cap at 2 to avoid excessive memory use on hi-DPI
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // -------------------------------------------------------------------------
  // 6. Canvas sizing
  // -------------------------------------------------------------------------
  let containerW = 0;
  let containerH = 0;

  function resizeCanvas() {
    const rect = el.getBoundingClientRect();
    containerW = rect.width;
    containerH = rect.height;

    const cssW = containerW + BORDER_OFFSET * 2;
    const cssH = containerH + BORDER_OFFSET * 2;

    canvas.style.width  = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width  = Math.round(cssW  * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  // -------------------------------------------------------------------------
  // 7. Animation loop
  // -------------------------------------------------------------------------
  const ctx = canvas.getContext("2d");
  let rafId = null;
  let startTime = null;

  function draw(timestamp) {
    if (startTime === null) startTime = timestamp;
    const time = ((timestamp - startTime) / 1000) * speed;

    const cssW = containerW + BORDER_OFFSET * 2;
    const cssH = containerH + BORDER_OFFSET * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // The rounded rect sits inset by BORDER_OFFSET inside the canvas
    const rectLeft   = BORDER_OFFSET;
    const rectTop    = BORDER_OFFSET;
    const rectWidth  = containerW;
    const rectHeight = containerH;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.beginPath();

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;

      // Base point on the rounded-rect perimeter
      const base = getRoundedRectPoint(t, rectLeft, rectTop, rectWidth, rectHeight, borderRadius);

      // Normal direction — approximate by finite difference
      const tNext = (i + 1) / SAMPLE_COUNT;
      const next  = getRoundedRectPoint(tNext, rectLeft, rectTop, rectWidth, rectHeight, borderRadius);
      const dx = next.x - base.x;
      const dy = next.y - base.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Outward normal (perpendicular, pointing away from the path interior)
      const nx = -dy / len;
      const ny =  dx / len;

      // Noise displacement
      const disp = octavedNoise(
        t,
        OCTAVES,
        LACUNARITY,
        GAIN,
        chaos,        // baseAmplitude driven by chaos option
        FREQUENCY,
        time,
        SEED,
        BASE_FLATNESS,
      ) * DISPLACEMENT;

      const px = base.x + nx * disp;
      const py = base.y + ny * disp;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.closePath();

    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.stroke();

    ctx.restore();

    rafId = requestAnimationFrame(draw);
  }

  // -------------------------------------------------------------------------
  // 8. ResizeObserver
  // -------------------------------------------------------------------------
  const observer = new ResizeObserver(() => {
    resizeCanvas();
  });
  observer.observe(el);

  // Initial size + kick off animation
  resizeCanvas();
  rafId = requestAnimationFrame(draw);

  // -------------------------------------------------------------------------
  // 9. Cleanup
  // -------------------------------------------------------------------------
  return function cleanup() {
    // Stop animation
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Disconnect resize observer
    observer.disconnect();

    // Remove injected elements
    if (canvasContainer.parentNode === el) el.removeChild(canvasContainer);
    if (layers.parentNode         === el) el.removeChild(layers);

    // Unwrap eb-content — move children back directly onto el
    const wrappedChildren = Array.from(content.childNodes);
    for (const child of wrappedChildren) {
      el.appendChild(child);
    }
    if (content.parentNode === el) el.removeChild(content);

    // Restore host element styles
    el.style.position  = originalPosition;
    el.style.overflow  = originalOverflow;
    el.style.isolation = originalIsolation;
    if (originalColorProp) {
      el.style.setProperty("--electric-border-color", originalColorProp);
    } else {
      el.style.removeProperty("--electric-border-color");
    }
  };
}
