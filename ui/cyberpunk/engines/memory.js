/* ══════════════════════════════════════════════════════════════════════════
   Memory Engine — Module-level singleton

   Tracks visit count and timestamps in localStorage, determines boot mode
   based on familiarity. SessionStorage prevents re-booting on navigation.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY_VISIT_COUNT = "cyberpunk-visit-count";
const KEY_LAST_VISIT = "cyberpunk-last-visit";
const KEY_SESSION_BOOTED = "cyberpunk-session-booted";

let visitCount = 0;
let lastVisit = null;

// SSR-safe init
if (typeof window !== "undefined") {
  try {
    const storedCount = localStorage.getItem(KEY_VISIT_COUNT);
    if (storedCount !== null) visitCount = parseInt(storedCount, 10) || 0;

    const storedVisit = localStorage.getItem(KEY_LAST_VISIT);
    if (storedVisit !== null) {
      const parsed = new Date(storedVisit);
      if (!isNaN(parsed.getTime())) lastVisit = parsed;
    }
  } catch {
    // localStorage unavailable
  }
}

export function getVisitCount() {
  return visitCount;
}

export function getLastVisit() {
  return lastVisit;
}

export function getBootMode() {
  if (visitCount === 0) return "full";
  if (visitCount < 10) return "reconnect";
  return "instant";
}

export function hasBootedThisSession() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY_SESSION_BOOTED) === "true";
  } catch {
    return false;
  }
}

export function markVisit() {
  if (typeof window === "undefined") return;
  visitCount++;
  lastVisit = new Date();
  try {
    localStorage.setItem(KEY_VISIT_COUNT, String(visitCount));
    localStorage.setItem(KEY_LAST_VISIT, lastVisit.toISOString());
  } catch {
    // localStorage unavailable
  }
}

export function markSessionBooted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY_SESSION_BOOTED, "true");
  } catch {
    // sessionStorage unavailable
  }
}
