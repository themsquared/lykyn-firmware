/** First-run and empty-state helpers for the offline device UI. Pure, no DOM. */

const { aliasEntityMap } = require("./ids")

const GROW_PRESETS = [
  {
    id: "colonizing",
    label: "Colonization",
    phase: "Colonization",
    day: 1,
    total: 14,
    setpoints: { humidity: 90, temperature: 24, sunrise: 8, lightHours: 0, white: 0, red: 0, green: 0, blue: 0, mist: 75 },
  },
  {
    id: "oyster-fruit",
    label: "Black Oyster fruiting",
    phase: "Fruiting",
    day: 1,
    total: 10,
    setpoints: { humidity: 88.5, temperature: 18, sunrise: 8, lightHours: 12, white: 23, red: 0, green: 0, blue: 80, mist: 75 },
  },
  {
    id: "pinning",
    label: "Pinning",
    phase: "Pinning",
    day: 1,
    total: 5,
    setpoints: { humidity: 92, temperature: 17, sunrise: 8, lightHours: 12, white: 23, red: 0, green: 0, blue: 80, mist: 75 },
  },
]

function formatHour(hour) {
  const h = Number(hour) % 24
  const suffix = h < 12 ? "AM" : "PM"
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${suffix}`
}

/** Plain summary of exactly what a preset will change, shown before it is applied. */
function presetSummary(preset) {
  const sp = preset.setpoints
  if (!sp) return "Only the grow name and day count change."
  const lights =
    sp.lightHours > 0 ? `lights on ${sp.lightHours} hours from ${formatHour(sp.sunrise)}` : "lights off"
  return `Humidity ${sp.humidity}%, temperature ${sp.temperature}°C, ${lights}.`
}

/** Must match device_version in lykyn-core.yaml (a test checks this). */
const DEVICE_VERSION = "0.2.0"

function connectionLabel(wifiMode) {
  const mode = String(wifiMode || "")
  if (mode === "Station") return "Home Wi-Fi"
  if (mode === "Access Point") return "Setup network"
  return "Unknown"
}

function isApMode(wifiMode, ssid) {
  const mode = String(wifiMode || "")
  if (mode) return mode === "Access Point"
  const name = String(ssid || "")
  return name === "Lykyn-Setup" || name.startsWith("Lykyn-Setup")
}

function hasActiveGrow(phase, totalDays) {
  const name = String(phase || "").trim()
  if (!name || name === "Idle" || name === "Custom") {
    // Custom with no day count still counts as a running grow on this chamber
    // only when the stage itself is a named cycle. Empty/Idle is empty-grow.
    if (name === "Custom") return true
    return false
  }
  return true
}

function deviceSurfaceState({ wifiMode, ssid, phase, totalDays, reachable, lastError }) {
  if (reachable === false) return "unreachable"
  if (lastError && reachable !== true) return "unreachable"
  if (isApMode(wifiMode, ssid)) return "first-run-wifi"
  if (!hasActiveGrow(phase, totalDays)) return "empty-grow"
  return "ready"
}

function firstRunSteps(state) {
  if (state === "unreachable") {
    return {
      title: "Cannot reach the chamber",
      body: "Use the same Wi-Fi as the chamber, or join the Lykyn-Setup network and open this page at 192.168.4.1.",
      action: "retry",
      actionLabel: "Try again",
    }
  }
  if (state === "first-run-wifi") {
    return {
      title: "Connect this chamber to your Wi-Fi",
      body: "Open the device page to pick your home network. This dashboard will follow once it joins.",
      action: "wifi",
      actionLabel: "Open the device page",
      actionHref: "/esp",
    }
  }
  if (state === "empty-grow") {
    return {
      title: "No grow is running",
      body: "Pick a starting point. You can still change humidity, temperature, and lights by hand.",
      action: "profile",
    }
  }
  return null
}

function applyPresetWrites(preset) {
  const writes = [
    { kind: "select", id: "stage", value: preset.phase },
  ]
  if (preset.setpoints) {
    writes.push({ kind: "number", id: "target_humidity", value: preset.setpoints.humidity })
    writes.push({ kind: "number", id: "temperature_target", value: preset.setpoints.temperature })
    writes.push({ kind: "number", id: "light_sunrise_hour", value: preset.setpoints.sunrise })
    writes.push({ kind: "number", id: "light_hours", value: preset.setpoints.lightHours })
    if (preset.setpoints.white != null)
      writes.push({ kind: "number", id: "light_white", value: preset.setpoints.white })
    if (preset.setpoints.red != null)
      writes.push({ kind: "number", id: "light_red", value: preset.setpoints.red })
    if (preset.setpoints.green != null)
      writes.push({ kind: "number", id: "light_green", value: preset.setpoints.green })
    if (preset.setpoints.blue != null)
      writes.push({ kind: "number", id: "light_blue", value: preset.setpoints.blue })
    if (preset.setpoints.mist != null)
      writes.push({ kind: "number", id: "mist_level", value: preset.setpoints.mist })
  }
  return writes
}

function entityPatchFromWrites(writes) {
  const patch = {}
  for (const write of writes) {
    const key = `${write.kind}-${write.id}`
    const value =
      write.kind === "select"
        ? { state: String(write.value), value: String(write.value) }
        : { state: String(write.value), value: write.value }
    patch[key] = value
  }
  return aliasEntityMap(patch)
}

module.exports = {
  GROW_PRESETS,
  DEVICE_VERSION,
  formatHour,
  presetSummary,
  connectionLabel,
  isApMode,
  hasActiveGrow,
  deviceSurfaceState,
  firstRunSteps,
  applyPresetWrites,
  entityPatchFromWrites,
}
