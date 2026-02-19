/* ══════════════════════════════════════════════════════════════════════════
   Engines — Barrel export
   Re-exports all engine modules for convenient import.
   ══════════════════════════════════════════════════════════════════════════ */

export {
  startHeartbeat,
  stopHeartbeat,
  subscribe as subscribeHeartbeat,
  setBPM,
  setIrregular,
  getPhase,
  getBeatCount,
  getBPM,
} from "./heartbeat.js";

export {
  startEngine as startSystemHealth,
  stopEngine as stopSystemHealth,
  subscribe as subscribeSystemHealth,
  setHealth,
  adjustHealth,
  getHealth,
  getTier as getHealthTier,
} from "./system-health.js";

export {
  startEngine as startScrollDescent,
  stopEngine as stopScrollDescent,
  subscribe as subscribeScrollDescent,
  getDepth as getScrollDepth,
  getTier as getScrollTier,
} from "./scroll-descent.js";

export {
  startEnvironment,
  stopEnvironment,
  subscribe as subscribeEnvironment,
  getEnvironment,
} from "./environment.js";

export {
  getVisitCount,
  getLastVisit,
  getBootMode,
  hasBootedThisSession,
  markVisit,
  markSessionBooted,
} from "./memory.js";

export {
  play as playSound,
  setMuted as setSoundMuted,
  getMuted as getSoundMuted,
  setVolume as setSoundVolume,
  getVolume as getSoundVolume,
  subscribe as subscribeSound,
} from "./sound.js";
