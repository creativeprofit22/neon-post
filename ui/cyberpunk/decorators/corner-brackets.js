/**
 * corner-brackets.js
 * Vanilla ES module — cyberpunk corner bracket decorator.
 *
 * Wraps any element with absolute-positioned bracket divs that mimic
 * the CornerBrackets React component, including optional voltage glow.
 */

/**
 * @typedef {"tl-br" | "tr-bl" | "all"} CornerSet
 * @typedef {"low" | "medium" | "high"} Voltage
 */

/**
 * Returns an array of style descriptor objects, one per bracket corner.
 *
 * @param {CornerSet} corners
 * @param {number}    size        — arm length in px
 * @param {string}    borderStyle — CSS border shorthand value
 * @returns {Object[]}
 */
function getBrackets(corners, size, borderStyle) {
  const tl = {
    top: "0",
    left: "0",
    borderTop: borderStyle,
    borderLeft: borderStyle,
  };
  const tr = {
    top: "0",
    right: "0",
    borderTop: borderStyle,
    borderRight: borderStyle,
  };
  const bl = {
    bottom: "0",
    left: "0",
    borderBottom: borderStyle,
    borderLeft: borderStyle,
  };
  const br = {
    bottom: "0",
    right: "0",
    borderBottom: borderStyle,
    borderRight: borderStyle,
  };

  if (corners === "tl-br") return [tl, br];
  if (corners === "tr-bl") return [tr, bl];
  return [tl, tr, bl, br];
}

/**
 * Returns a CSS filter string for the requested voltage level, or null when
 * no glow should be applied.
 *
 * @param {Voltage|undefined} voltage
 * @param {string}            color
 * @returns {string|null}
 */
function voltageGlow(voltage, color) {
  if (!voltage || voltage === "low") return null;
  if (voltage === "medium") return `drop-shadow(0 0 4px ${color})`;
  return `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 16px ${color})`;
}

/**
 * Attaches cyberpunk corner brackets to an element.
 *
 * @param {HTMLElement} el        — target element
 * @param {Object}      [options]
 * @param {number}      [options.size=12]                  — bracket arm length in px
 * @param {string}      [options.color="var(--cyan-0)"]    — bracket color
 * @param {CornerSet}   [options.corners="tl-br"]          — which corners to decorate
 * @param {Voltage}     [options.voltage]                  — glow intensity
 * @returns {() => void} cleanup — removes brackets and restores original position
 */
export function cornerBrackets(el, options = {}) {
  const {
    size = 12,
    color = "var(--cyan-0)",
    corners = "tl-br",
    voltage,
  } = options;

  // --- 1. Position context -------------------------------------------------
  const originalPosition = el.style.position;
  const computedPosition = getComputedStyle(el).position;
  const positionChanged =
    computedPosition !== "absolute" &&
    computedPosition !== "fixed" &&
    computedPosition !== "sticky";

  if (positionChanged) {
    el.style.position = "relative";
  }

  // --- 2. Build bracket styles ---------------------------------------------
  const borderStyle = `2px solid ${color}`;
  const bracketDescriptors = getBrackets(corners, size, borderStyle);
  const glowFilter = voltageGlow(voltage, color);

  // --- 3. Create and append bracket divs -----------------------------------
  const bracketEls = bracketDescriptors.map((descriptor) => {
    const div = document.createElement("div");

    div.setAttribute("data-bracket", "");
    div.setAttribute("aria-hidden", "true");

    // Base layout styles
    div.style.position = "absolute";
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;
    div.style.pointerEvents = "none";
    div.style.transition = "filter 200ms";

    // Positional border styles from descriptor
    for (const [prop, value] of Object.entries(descriptor)) {
      // camelCase properties map directly to el.style
      div.style[prop] = value;
    }

    // Voltage glow
    if (glowFilter) {
      div.style.filter = glowFilter;
    }

    el.appendChild(div);
    return div;
  });

  // --- 4. Cleanup ----------------------------------------------------------
  return function cleanup() {
    for (const div of bracketEls) {
      if (div.parentNode === el) {
        el.removeChild(div);
      }
    }

    if (positionChanged) {
      // Restore exactly what was there before (may be empty string)
      el.style.position = originalPosition;
    }
  };
}
