/**
 * signal-beacon.js
 * Vanilla ES module port of SignalBeacon.tsx
 *
 * An SVG-based notification beacon with animated signal arcs, an LED center
 * dot, a count badge, and a click spark effect.
 *
 * Assumes the following CSS keyframes are defined globally:
 *   signal-broadcast, led-flicker, corner-spark
 */

// ---------------------------------------------------------------------------
// Static configuration
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

/** Maps variant name → CSS custom-property colour token. */
const VARIANT_COLORS = {
  default: "var(--cyan-0)",
  info: "var(--blue-0)",
  warning: "var(--amber-0)",
  urgent: "var(--magenta-0)",
};

/**
 * Per-size layout constants.
 * container: outer div size (px)
 * dotRadius:  LED centre circle radius
 * arcCount:   how many of the three arcs to show
 * stroke:     arc stroke-width
 * badge:      badge diameter (px)
 * badgeFont:  badge font-size (px)
 */
const SIZE_CONFIG = {
  sm: { container: 24, dotRadius: 2.5, arcCount: 2, stroke: 1.5, badge: 14, badgeFont: 9 },
  md: { container: 32, dotRadius: 3,   arcCount: 2, stroke: 2,   badge: 16, badgeFont: 10 },
  lg: { container: 40, dotRadius: 3.5, arcCount: 3, stroke: 2,   badge: 18, badgeFont: 11 },
};

/**
 * The three possible signal arc paths, ordered innermost → outermost.
 * Drawn on a 24×24 viewBox. The SVG is rotated −45 ° at the container level
 * so the arcs fan out toward the top-right.
 */
const ARC_PATHS = [
  "M 12 6 A 6 6 0 0 1 18 12",
  "M 12 3 A 9 9 0 0 1 21 12",
  "M 12 0 A 12 12 0 0 1 24 12",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an SVG element in the SVG namespace.
 *
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/**
 * Applies a plain object of CSS properties to a DOM element's inline style.
 *
 * @param {HTMLElement|SVGElement} el
 * @param {Record<string, string>} styles
 */
function applyStyles(el, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    el.style[prop] = value;
  }
}

// ---------------------------------------------------------------------------
// Core render helpers — build SVG sub-tree and badge from current options
// ---------------------------------------------------------------------------

/**
 * Builds and returns the <svg> element that contains the halo, LED dot, and
 * arc paths, wired up to the resolved option set.
 *
 * @param {object} opts  — resolved (fully-defaulted) options
 * @returns {SVGSVGElement}
 */
function buildSVG(opts) {
  const { active, variant, size } = opts;
  const cfg = SIZE_CONFIG[size];
  const color = VARIANT_COLORS[variant];
  const animDuration = variant === "urgent" ? "1s" : "2s";

  const svg = svgEl("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
  });

  applyStyles(svg, {
    width: "100%",
    height: "100%",
    transform: "rotate(-45deg)",
    overflow: "visible",
  });

  // --- Glow halo (only when active) ----------------------------------------
  if (active) {
    const halo = svgEl("circle", {
      cx: "12",
      cy: "12",
      r: String(cfg.dotRadius + 4),
      fill: color,
      opacity: "0.15",
    });
    applyStyles(halo, {
      animation: `signal-broadcast ${animDuration} ease-in-out infinite`,
    });
    svg.appendChild(halo);
  }

  // --- Centre LED dot -------------------------------------------------------
  const dot = svgEl("circle", {
    cx: "12",
    cy: "12",
    r: String(cfg.dotRadius),
    fill: color,
  });

  if (active) {
    applyStyles(dot, {
      filter: `drop-shadow(0 0 3px ${color})`,
      animation: `led-flicker ${animDuration} ease-in-out infinite`,
    });
  }

  svg.appendChild(dot);

  // --- Signal arc paths -----------------------------------------------------
  ARC_PATHS.slice(0, cfg.arcCount).forEach((d, i) => {
    const path = svgEl("path", {
      d,
      fill: "none",
      stroke: color,
      "stroke-width": String(cfg.stroke),
      "stroke-linecap": "round",
    });

    if (active) {
      applyStyles(path, {
        animation: `signal-broadcast ${animDuration} ease-in-out infinite`,
        animationDelay: `${i * 150}ms`,
      });
    } else {
      path.setAttribute("opacity", "0.2");
    }

    svg.appendChild(path);
  });

  return svg;
}

/**
 * Builds and returns the count badge <span>, or null when the badge should
 * not be shown.
 *
 * @param {object} opts  — resolved options
 * @returns {HTMLSpanElement|null}
 */
function buildBadge(opts) {
  const { showCount, count, variant, size } = opts;

  if (!showCount || count <= 0) return null;

  const cfg = SIZE_CONFIG[size];
  const color = VARIANT_COLORS[variant];

  const badge = document.createElement("span");
  badge.setAttribute("aria-label", `${count} notifications`);
  badge.textContent = count > 99 ? "99+" : String(count);

  applyStyles(badge, {
    position: "absolute",
    top: "0",
    right: "0",
    transform: "translate(30%, -30%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: `${cfg.badge}px`,
    height: `${cfg.badge}px`,
    padding: "0 3px",
    borderRadius: "0",
    background: color,
    color: "var(--bg-0, #000)",
    fontSize: `${cfg.badgeFont}px`,
    fontWeight: "700",
    fontFamily: "monospace",
    lineHeight: "1",
    pointerEvents: "none",
    boxSizing: "border-box",
  });

  return badge;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Creates a self-contained signal beacon widget.
 *
 * @param {object}            [options={}]
 * @param {number}            [options.count=0]          — notification count
 * @param {"default"|"info"|"warning"|"urgent"} [options.variant="default"]
 * @param {"sm"|"md"|"lg"}   [options.size="md"]
 * @param {boolean}           [options.showCount=true]   — render count badge
 * @param {boolean|undefined} [options.active]           — override; defaults to count > 0
 * @param {Function|undefined}[options.onClick]          — click / Enter / Space handler
 * @param {string|undefined}  [options.label]            — accessible aria-label
 *
 * @returns {{ el: HTMLDivElement, update: (newOptions: object) => void, cleanup: () => void }}
 */
export function signalBeacon(options = {}) {
  // -------------------------------------------------------------------------
  // 1. Resolve initial options
  // -------------------------------------------------------------------------
  let currentOpts = resolveOpts(options);

  // -------------------------------------------------------------------------
  // 2. Build container div
  // -------------------------------------------------------------------------
  const container = document.createElement("div");
  container.setAttribute("data-signal-beacon", "");

  applyContainerStyles(container, currentOpts);

  // -------------------------------------------------------------------------
  // 3. Initial render of internals
  // -------------------------------------------------------------------------
  renderInternals(container, currentOpts);

  // -------------------------------------------------------------------------
  // 4. Hover effect (scale on the container itself)
  // -------------------------------------------------------------------------
  function onMouseEnter() {
    container.style.transform = "scale(1.1)";
  }
  function onMouseLeave() {
    container.style.transform = "scale(1)";
  }
  container.addEventListener("mouseenter", onMouseEnter);
  container.addEventListener("mouseleave", onMouseLeave);

  // -------------------------------------------------------------------------
  // 5. Click / keyboard interaction
  // -------------------------------------------------------------------------
  let sparkTimeout = null;

  function triggerClick() {
    if (currentOpts.onClick) currentOpts.onClick();
    showSpark();
  }

  function showSpark() {
    // Remove any in-flight spark first so re-clicks re-trigger the animation.
    const existingSpark = container.querySelector("[data-spark]");
    if (existingSpark) existingSpark.remove();

    const spark = document.createElement("span");
    spark.setAttribute("data-spark", "");
    spark.setAttribute("aria-hidden", "true");

    applyStyles(spark, {
      position: "absolute",
      inset: "0",
      borderRadius: "inherit",
      pointerEvents: "none",
      animation: "corner-spark 600ms ease-out forwards",
    });

    container.appendChild(spark);

    if (sparkTimeout !== null) clearTimeout(sparkTimeout);
    sparkTimeout = setTimeout(() => {
      sparkTimeout = null;
      if (spark.parentNode === container) container.removeChild(spark);
    }, 600);
  }

  function onClick() {
    triggerClick();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerClick();
    }
  }

  // Wire interactive attributes + listeners whenever onClick exists.
  function wireInteractivity() {
    if (currentOpts.onClick) {
      container.setAttribute("role", "button");
      container.setAttribute("tabindex", "0");
      container.style.cursor = "pointer";
      container.addEventListener("click", onClick);
      container.addEventListener("keydown", onKeyDown);
    } else {
      container.removeAttribute("role");
      container.removeAttribute("tabindex");
      container.style.cursor = "default";
      container.removeEventListener("click", onClick);
      container.removeEventListener("keydown", onKeyDown);
    }
  }

  wireInteractivity();

  // -------------------------------------------------------------------------
  // 6. Public API
  // -------------------------------------------------------------------------

  /**
   * Merges new options into the current set and re-renders internal children.
   * Container structural styles (size) are also refreshed.
   *
   * @param {object} newOptions
   */
  function update(newOptions) {
    const hadOnClick = !!currentOpts.onClick;
    currentOpts = resolveOpts({ ...currentOpts, ...newOptions });

    // Refresh container styles (size may have changed).
    applyContainerStyles(container, currentOpts);

    // Refresh interactivity wiring if onClick presence changed.
    if (hadOnClick !== !!currentOpts.onClick) {
      wireInteractivity();
    }

    // Re-render SVG + badge (clear previous, rebuild).
    renderInternals(container, currentOpts);
  }

  /** Removes all event listeners attached by this instance. */
  function cleanup() {
    container.removeEventListener("mouseenter", onMouseEnter);
    container.removeEventListener("mouseleave", onMouseLeave);
    container.removeEventListener("click", onClick);
    container.removeEventListener("keydown", onKeyDown);

    if (sparkTimeout !== null) {
      clearTimeout(sparkTimeout);
      sparkTimeout = null;
    }
  }

  return { el: container, update, cleanup };
}

// ---------------------------------------------------------------------------
// Internal helpers used by the factory
// ---------------------------------------------------------------------------

/**
 * Fills in all defaults for an options object.
 *
 * @param {object} opts  — raw / partial options
 * @returns {object}     — fully-defaulted options
 */
function resolveOpts(opts) {
  const count   = typeof opts.count   === "number" ? opts.count   : 0;
  const variant = VARIANT_COLORS[opts.variant] ? opts.variant     : "default";
  const size    = SIZE_CONFIG[opts.size]        ? opts.size        : "md";

  return {
    count,
    variant,
    size,
    showCount: opts.showCount !== undefined ? Boolean(opts.showCount) : true,
    active:    opts.active    !== undefined ? Boolean(opts.active)    : count > 0,
    onClick:   typeof opts.onClick === "function" ? opts.onClick      : undefined,
    label:     typeof opts.label   === "string"   ? opts.label        : undefined,
  };
}

/**
 * Applies / refreshes the container div's inline styles based on resolved
 * options.  Called on creation and on every update() call.
 *
 * @param {HTMLDivElement} el
 * @param {object}         opts  — resolved options
 */
function applyContainerStyles(el, opts) {
  const cfg = SIZE_CONFIG[opts.size];

  applyStyles(el, {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${cfg.container}px`,
    height: `${cfg.container}px`,
    flexShrink: "0",
    transition: "transform 150ms ease",
    transform: "scale(1)", // reset on update
  });

  if (opts.label) {
    el.setAttribute("aria-label", opts.label);
  } else {
    el.removeAttribute("aria-label");
  }
}

/**
 * Clears all SVG / badge children from the container and rebuilds them from
 * the current options.  The spark overlay (if present) is preserved because
 * it has its own independent lifecycle.
 *
 * @param {HTMLDivElement} el
 * @param {object}         opts  — resolved options
 */
function renderInternals(el, opts) {
  // Remove only SVG and badge children; leave any active spark overlay alone.
  const toRemove = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName ? child.tagName.toLowerCase() : "";
      if (tag === "svg" || child.hasAttribute("data-badge")) {
        toRemove.push(child);
      }
    }
  }
  for (const child of toRemove) el.removeChild(child);

  // Rebuild SVG and insert before any existing spark overlay.
  const spark = el.querySelector("[data-spark]");
  const svg = buildSVG(opts);

  if (spark) {
    el.insertBefore(svg, spark);
  } else {
    el.appendChild(svg);
  }

  // Rebuild badge.
  const badge = buildBadge(opts);
  if (badge) {
    badge.setAttribute("data-badge", "");
    if (spark) {
      el.insertBefore(badge, spark);
    } else {
      el.appendChild(badge);
    }
  }
}
