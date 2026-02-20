/**
 * vanish-input.js
 * Creates a dissolve + particle effect when the user sends a message.
 * Ghost characters appear at the textarea's last text positions, fade out
 * right-to-left, and emit small cyan particles flowing left.
 */

/**
 * @param {HTMLElement} inputArea - The #input-area container element.
 * @returns {{ trigger: (text: string) => void, cleanup: () => void }}
 */
export function vanishInput(inputArea) {
  const textarea = inputArea.querySelector("#message-input");
  if (!textarea) return { trigger() {}, cleanup() {} };

  const wrapper = textarea.closest(".textarea-wrapper") || textarea.parentElement;

  // Ensure wrapper is positioned for absolute children
  const wrapperPos = getComputedStyle(wrapper).position;
  if (wrapperPos === "static") wrapper.style.position = "relative";

  // Ghost container overlay
  const container = document.createElement("div");
  container.className = "char-ghost-container";
  wrapper.appendChild(container);

  // Hidden measurement span (matches textarea styling)
  const measurer = document.createElement("span");
  Object.assign(measurer.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre",
    font: "inherit",
    fontSize: "14px",
    letterSpacing: "normal",
    padding: "0",
    border: "0",
  });
  wrapper.appendChild(measurer);

  let cleanupTimeout = null;

  function trigger(text) {
    if (!text) return;

    // Clear any previous ghosts
    container.innerHTML = "";
    if (cleanupTimeout !== null) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }

    // Read textarea geometry
    const style = getComputedStyle(textarea);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const lineHeight = parseFloat(style.lineHeight) || 20;

    // Copy font to measurer
    measurer.style.font = style.font;
    measurer.style.fontSize = style.fontSize;
    measurer.style.letterSpacing = style.letterSpacing;

    const chars = text.split("");
    const total = chars.length;
    const stagger = Math.min(30, 600 / total); // cap total animation at ~600ms

    chars.forEach((ch, i) => {
      // Measure x-position of this character
      measurer.textContent = text.slice(0, i);
      const x = paddingLeft + measurer.offsetWidth;
      const y = paddingTop + lineHeight * 0.5;

      // Ghost character
      const ghost = document.createElement("span");
      ghost.className = "char-vanish";
      ghost.textContent = ch;
      // Reverse stagger: last char fades first
      const delay = (total - 1 - i) * stagger;
      ghost.style.cssText = `left:${x}px;top:${y}px;--fade-delay:${delay}ms;`;
      container.appendChild(ghost);

      // 2-3 particles per character
      const particleCount = 2 + Math.round(Math.random());
      for (let p = 0; p < particleCount; p++) {
        const particle = document.createElement("span");
        particle.className = "vanish-particle";
        const flowX = -(30 + Math.random() * 50);
        const flowYStart = (Math.random() - 0.5) * 10;
        const flowYEnd = (Math.random() - 0.5) * 30;
        const size = 2 + Math.random() * 3;
        const pDelay = delay + Math.random() * 80;
        particle.style.cssText = `left:${x}px;top:${y}px;--flow-x:${flowX}px;--flow-y-start:${flowYStart}px;--flow-y-end:${flowYEnd}px;--particle-size:${size}px;--particle-delay:${pDelay}ms;`;
        container.appendChild(particle);
      }
    });

    // Clean up after longest animation finishes
    const maxDuration = total * stagger + 700 + 100;
    cleanupTimeout = setTimeout(() => {
      container.innerHTML = "";
      cleanupTimeout = null;
    }, maxDuration);
  }

  function cleanup() {
    if (cleanupTimeout !== null) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }
    container.remove();
    measurer.remove();
    if (wrapperPos === "static") wrapper.style.position = "";
  }

  return { trigger, cleanup };
}
