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
