/* ══════════════════════════════════════════════════════════════════════════
   Environment Engine — Module-level singleton

   Tracks ambient signals (battery, network, time-of-day) and exposes them
   as reactive state + CSS custom properties on <html>.
   ══════════════════════════════════════════════════════════════════════════ */

let warmth = 0.2;
let batteryLevel = 1.0;
let batteryCharging = false;
let signalStrength = 1.0;
let autoVoltage = "high";
let timeOfDay = "day";

let listeners = new Set();
let running = false;
let timeInterval = null;
let battery = null;
let connection = null;

// ── Warmth curve ──

function computeWarmth(hour) {
  if (hour >= 22 || hour < 5) return 0.0 + (hour >= 22 ? (hour - 22) : (hour + 2)) * 0.02;
  if (hour >= 5 && hour < 8) {
    const t = (hour - 5) / 3;
    return 0.15 + 0.7 * Math.sin(t * Math.PI * 0.75);
  }
  if (hour >= 8 && hour < 12) {
    const t = (hour - 8) / 4;
    return 0.85 - t * 0.55;
  }
  if (hour >= 12 && hour < 15) return 0.2;
  if (hour >= 15 && hour < 17) return 0.3;
  if (hour >= 17 && hour < 20) {
    const t = (hour - 17) / 3;
    return 0.3 + 0.7 * Math.sin(t * Math.PI * 0.75);
  }
  const t = (hour - 20) / 2;
  return 0.4 - t * 0.4;
}

function computeTimeOfDay(hour) {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  return "dusk";
}

// ── Auto-voltage ──

function computeAutoVoltage() {
  const effectiveBattery = batteryCharging ? 1.0 : batteryLevel;
  const effectiveType = connection?.effectiveType;

  if (effectiveBattery < 0.1) return "low";
  if (effectiveBattery < 0.2 || effectiveType === "2g" || effectiveType === "slow-2g")
    return "low";
  if (effectiveBattery < 0.5 || effectiveType === "3g") return "medium";
  return "high";
}

// ── Signal strength ──

function computeSignalStrength(conn) {
  if (!conn) return 1.0;
  switch (conn.effectiveType) {
    case "slow-2g": return 0.15;
    case "2g": return 0.3;
    case "3g": return 0.6;
    case "4g": return 1.0;
    default: return 1.0;
  }
}

// ── CSS + notify ──

function getState() {
  return {
    warmth,
    batteryLevel,
    batteryCharging,
    signalStrength,
    autoVoltage,
    timeOfDay,
  };
}

function notify() {
  const el = document.documentElement;
  el.style.setProperty("--env-warmth", String(warmth));
  el.style.setProperty("--env-battery", String(batteryLevel));
  el.style.setProperty("--env-signal", String(signalStrength));
  el.setAttribute("data-env-voltage", autoVoltage);

  const state = getState();
  for (const fn of listeners) fn(state);
}

// ── Battery handler ──

function onBatteryChange() {
  if (!battery) return;
  batteryLevel = battery.level;
  batteryCharging = battery.charging;
  autoVoltage = computeAutoVoltage();
  notify();
}

// ── Network handler ──

function onNetworkChange() {
  signalStrength = computeSignalStrength(connection);
  autoVoltage = computeAutoVoltage();
  notify();
}

// ── Time handler ──

function updateTime() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  warmth = computeWarmth(hour);
  timeOfDay = computeTimeOfDay(hour);
  autoVoltage = computeAutoVoltage();
  notify();
}

// ── Public API ──

export async function startEnvironment() {
  if (running) return;
  running = true;

  // Battery API
  if (navigator.getBattery) {
    try {
      battery = await navigator.getBattery();
      onBatteryChange();
      battery.addEventListener("levelchange", onBatteryChange);
      battery.addEventListener("chargingchange", onBatteryChange);
    } catch {
      // Battery API denied
    }
  }

  // Network Information API
  connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null;
  if (connection) {
    onNetworkChange();
    connection.addEventListener("change", onNetworkChange);
  }

  // Time polling
  updateTime();
  timeInterval = setInterval(updateTime, 60000);
}

export function stopEnvironment() {
  if (!running) return;
  running = false;

  if (battery) {
    battery.removeEventListener("levelchange", onBatteryChange);
    battery.removeEventListener("chargingchange", onBatteryChange);
    battery = null;
  }

  if (connection) {
    connection.removeEventListener("change", onNetworkChange);
    connection = null;
  }

  if (timeInterval !== null) {
    clearInterval(timeInterval);
    timeInterval = null;
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getEnvironment() {
  return getState();
}
