/* ══════════════════════════════════════════════════════════════════════════
   Cyberpunk UI Overlay — Master Entry Point

   Importing this module activates the full cyberpunk theme. Engines start,
   boot sequence plays, and existing DOM elements are auto-decorated.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Engines ──
import {
  startHeartbeat,
  stopHeartbeat,
  startSystemHealth,
  stopSystemHealth,
  startScrollDescent,
  stopScrollDescent,
  startEnvironment,
  stopEnvironment,
} from "./engines/index.js";

// ── Decorators ──
import { bootSequence } from "./decorators/boot-sequence.js";
import { noiseOverlay } from "./decorators/noise-overlay.js";
import { cornerBrackets } from "./decorators/corner-brackets.js";
import { travelingLight } from "./decorators/traveling-light.js";
import { glitchText } from "./decorators/glitch-text.js";
import { electricBorder } from "./decorators/electric-border.js";
import { vanishInput } from "./decorators/vanish-input.js";

// ── Cleanup registry ──
const cleanups = [];

function register(fn) {
  if (fn) cleanups.push(fn);
}

// ── Splash detection ──
const isSplash = !!document.querySelector(".splash-container");

// ── Auto-decoration ──
function decorateUI() {
  // Noise overlay on all pages (subtle)
  register(noiseOverlay({ opacity: 0.04, grain: 15 }));

  // Splash gets noise + boot only — skip heavy decorators
  if (isSplash) return;

  // Headers → corner brackets with voltage "medium"
  document.querySelectorAll("header").forEach((el) => {
    register(cornerBrackets(el, { voltage: "medium" }));
  });

  // Active sidebar nav item → traveling light
  const activeNavItem = document.querySelector(".nav-item.active");
  if (activeNavItem) {
    register(travelingLight(activeNavItem, { voltage: "medium" }));
  }

  // Main content panels → corner brackets "tl-br"
  document.querySelectorAll(".section, .tab-content, .step").forEach((el) => {
    register(cornerBrackets(el, { corners: "tl-br" }));
  });

  // Page titles → glitch text (trigger on load, cyan variant)
  document.querySelectorAll("header h1").forEach((el) => {
    const { trigger, cleanup } = glitchText(el, { variant: "cyan" });
    register(cleanup);
    trigger();
  });

  // Badges → corner brackets with size 6, all corners
  document
    .querySelectorAll(
      ".version-badge, .model-badge, .fact-count, .log-count, .aspect-count"
    )
    .forEach((el) => {
      register(cornerBrackets(el, { size: 6, corners: "all" }));
    });

  // Input areas → traveling light voltage "low"
  document
    .querySelectorAll("#input-area, .editor-container")
    .forEach((el) => {
      register(travelingLight(el, { voltage: "low" }));
    });

  // Status indicators → corner brackets
  document
    .querySelectorAll(".status.info, .status.success, .status.error")
    .forEach((el) => {
      register(cornerBrackets(el, { size: 6, corners: "all" }));
    });

  // Chat send button → electric border (subtle)
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn) {
    register(electricBorder(sendBtn, { chaos: 0.06, speed: 0.5 }));

    // Swap paw ellipses → detailed cyber paw SVG
    const sendIcon = sendBtn.querySelector(".send-icon");
    if (sendIcon) {
      const originalSendHTML = sendIcon.outerHTML;
      const cyberPaw = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      cyberPaw.classList.add("send-icon", "cyber-paw");
      cyberPaw.setAttribute("viewBox", "0 0 24 24");
      cyberPaw.setAttribute("fill", "none");
      cyberPaw.innerHTML = `
        <g class="paw-group">
          <path class="paw-pad" d="M12 19.5c-3 0-6-2.2-6-5.5 0-2.8 2.5-4.5 6-4.5s6 1.7 6 4.5c0 3.3-3 5.5-6 5.5z" fill="currentColor"/>
          <ellipse class="paw-bean b1" cx="6.5" cy="7" rx="2.2" ry="2.8" fill="currentColor"/>
          <ellipse class="paw-bean b2" cx="10.2" cy="4.5" rx="1.8" ry="2.4" fill="currentColor"/>
          <ellipse class="paw-bean b3" cx="13.8" cy="4.5" rx="1.8" ry="2.4" fill="currentColor"/>
          <ellipse class="paw-bean b4" cx="17.5" cy="7" rx="2.2" ry="2.8" fill="currentColor"/>
        </g>`;
      sendIcon.replaceWith(cyberPaw);
      register(() => {
        const current = sendBtn.querySelector(".cyber-paw");
        if (current) {
          const tmp = document.createElement("div");
          tmp.innerHTML = originalSendHTML;
          current.replaceWith(tmp.firstElementChild);
        }
      });
    }
  }

  // Attach button → swap paperclip for data chip SVG
  const attachBtn = document.querySelector(".attach-btn");
  if (attachBtn) {
    const attachSvg = attachBtn.querySelector("svg");
    if (attachSvg) {
      const originalAttachHTML = attachSvg.outerHTML;
      const chipSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      chipSvg.setAttribute("viewBox", "0 0 24 24");
      chipSvg.setAttribute("fill", "none");
      chipSvg.setAttribute("stroke", "currentColor");
      chipSvg.setAttribute("stroke-width", "1.5");
      chipSvg.setAttribute("stroke-linecap", "round");
      chipSvg.setAttribute("stroke-linejoin", "round");
      chipSvg.innerHTML = `
        <rect x="6" y="6" width="12" height="12" rx="1"/>
        <line x1="9" y1="6" x2="9" y2="3"/><line x1="12" y1="6" x2="12" y2="3"/><line x1="15" y1="6" x2="15" y2="3"/>
        <line x1="9" y1="18" x2="9" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="15" y1="18" x2="15" y2="21"/>
        <line x1="6" y1="9" x2="3" y2="9"/><line x1="6" y1="12" x2="3" y2="12"/><line x1="6" y1="15" x2="3" y2="15"/>
        <line x1="18" y1="9" x2="21" y2="9"/><line x1="18" y1="12" x2="21" y2="12"/><line x1="18" y1="15" x2="21" y2="15"/>
        <path d="M9 10h2v4h2v-2" stroke-width="0.8" opacity="0.5"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" opacity="0.3"/>`;
      attachSvg.replaceWith(chipSvg);
      attachBtn.classList.add("has-chip");
      register(() => {
        const current = attachBtn.querySelector("svg");
        if (current) {
          const tmp = document.createElement("div");
          tmp.innerHTML = originalAttachHTML;
          current.replaceWith(tmp.firstElementChild);
        }
        attachBtn.classList.remove("has-chip");
      });
    }
  }

  // Input area → vanish effect on send
  const inputAreaEl = document.getElementById("input-area");
  if (inputAreaEl) {
    const { trigger, cleanup } = vanishInput(inputAreaEl);
    register(cleanup);
    window.__cyberVanish = { trigger };
  }

  // MutationObserver for dynamic chat content
  const messages = document.getElementById("messages");
  if (messages) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const targets = node.matches?.(".status-action")
            ? [node]
            : Array.from(node.querySelectorAll?.(".status-action") ?? []);
          for (const target of targets) {
            const { trigger, cleanup } = glitchText(target, {
              variant: "cyan",
            });
            register(cleanup);
            trigger();
          }
        }
      }
    });
    observer.observe(messages, { childList: true, subtree: true });
    register(() => observer.disconnect());
  }
}

// ── Boot ──
document.addEventListener("DOMContentLoaded", () => {
  // Start all engines
  startHeartbeat();
  startSystemHealth();
  startScrollDescent();
  startEnvironment();

  // Boot sequence → decorate UI on complete
  register(
    bootSequence({
      onComplete: decorateUI,
    })
  );
});

// ── Teardown ──
export function destroyCyberpunk() {
  stopHeartbeat();
  stopSystemHealth();
  stopScrollDescent();
  stopEnvironment();
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
}
