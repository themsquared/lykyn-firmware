/**
 * Everything the Lykyn page needs to know about this chamber that another chamber does not.
 * The page never checks the device type: it asks this file. See lib/stage-standard.js.
 */

const { RECIPES, canonicalStage, recipeFromProfile } = require("./stage-standard")

/** Canonical stage to the name the Lykyn stage select uses. All four are native. */
const NATIVE_STAGE = { Colonization: "Colonization", Pinning: "Pinning", Fruiting: "Fruiting", Custom: "Custom" }

/** Canonical stages this chamber has, in the standard's order. */
const STAGES_AVAILABLE = ["Colonization", "Pinning", "Fruiting", "Custom"]

/** The firmware also loads a recipe when the stage select changes. The page writes the same knobs so a second pick of the current stage still applies, and so a linked profile can override the built-in numbers. */
const PRESETS_ON_DEVICE = true

/** White is a 0-100 percent channel added on top of the colors. */
const WHITE_UNIT = "%"

/** The fan never runs below 33 percent. */
const FAN_MIN_PERCENT = 33

function nativeStage(stage) {
  return NATIVE_STAGE[stage] || null
}

/** Writes that put this chamber in a stage and load that stage's recipe. Custom is phase-only. */
function stageWrites(stage, profileStages) {
  const native = nativeStage(stage)
  if (!native) return []
  const writes = [{ kind: "select", id: "stage", value: native }]
  if (stage === "Custom") return writes
  const r = recipeFromProfile(stage, profileStages) || RECIPES[stage]
  if (!r) return writes
  const fan = Math.max(r.fanSpeed, FAN_MIN_PERCENT)
  writes.push(
    { kind: "number", id: "temperature_target", value: r.temperature },
    { kind: "number", id: "target_humidity", value: r.humidity },
    { kind: "number", id: "light_sunrise_hour", value: r.sunrise },
    { kind: "number", id: "light_hours", value: r.lightHours },
    { kind: "number", id: "light_white", value: r.white },
    { kind: "number", id: "light_red", value: r.red },
    { kind: "number", id: "light_green", value: r.green },
    { kind: "number", id: "light_blue", value: r.blue },
    { kind: "number", id: "air_exchange_fan_speed", value: fan },
    { kind: "number", id: "air_exchange_every", value: r.airPeriodMin },
    { kind: "number", id: "air_exchange_run", value: r.airRunSec }
  )
  return writes
}

/** Canonical stage for what the chamber's stage select says now. */
function currentStage(nativeName) {
  return canonicalStage(nativeName)
}

/** White as the chamber counts it, for the Light card. */
function whiteDisplay(raw) {
  return Math.round(Number(raw) || 0)
}

module.exports = { STAGES_AVAILABLE, PRESETS_ON_DEVICE, WHITE_UNIT, FAN_MIN_PERCENT, nativeStage, stageWrites, currentStage, whiteDisplay }
