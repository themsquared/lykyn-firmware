const test = require("node:test")
const assert = require("node:assert/strict")
const adapter = require("./device-adapter")
const { RECIPES } = require("./stage-standard")

test("Lykyn has all four stages under their own names", () => {
  assert.deepEqual(adapter.STAGES_AVAILABLE, ["Colonization", "Pinning", "Fruiting", "Custom"])
  assert.equal(adapter.PRESETS_ON_DEVICE, true)
  for (const stage of adapter.STAGES_AVAILABLE) {
    assert.equal(adapter.nativeStage(stage), stage)
    assert.equal(adapter.stageWrites(stage)[0].id, "stage")
    assert.equal(adapter.stageWrites(stage)[0].value, stage)
  }
})

test("picking a stage writes the recipe knobs, and Custom does not", () => {
  const by = Object.fromEntries(adapter.stageWrites("Colonization").map((w) => [w.id, w.value]))
  assert.equal(by.stage, "Colonization")
  assert.equal(by.temperature_target, RECIPES.Colonization.temperature)
  assert.equal(by.target_humidity, RECIPES.Colonization.humidity)
  assert.equal(by.light_hours, 0)
  assert.equal(by.light_white, 0)
  assert.equal(by.light_green, 0)
  assert.equal(by.air_exchange_fan_speed, 33, "profile 20 clamps to the Lykyn fan minimum")
  assert.equal(by.air_exchange_every, 60)
  assert.equal("grow_day" in by, false)
  assert.deepEqual(adapter.stageWrites("Custom"), [{ kind: "select", id: "stage", value: "Custom" }])
})

test("a linked profile's stage knobs beat the built-in recipe", () => {
  const by = Object.fromEntries(
    adapter.stageWrites("Colonization", {
      colonization: { temperature_c: 21, humidity_percent: 93, fan_speed_percent: 40, air_exchange_period_min: 45, air_exchange_run_sec: 20, light_hours: 0, white_percent: 0, red_percent: 0, green_percent: 0, blue_percent: 0 },
    }).map((w) => [w.id, w.value])
  )
  assert.equal(by.temperature_target, 21)
  assert.equal(by.target_humidity, 93)
  assert.equal(by.air_exchange_fan_speed, 40)
  assert.equal(by.air_exchange_every, 45)
})

test("the fan floor and white unit are this chamber's own", () => {
  assert.equal(adapter.FAN_MIN_PERCENT, 33)
  assert.equal(adapter.WHITE_UNIT, "%")
  assert.equal(adapter.whiteDisplay("20.24"), 20.2)
  assert.equal(adapter.whiteDisplay(2.3), 2.3)
  assert.equal(adapter.whiteDisplay(100), 100)
})

test("the current stage is read back through the canonical name", () => {
  assert.equal(adapter.currentStage("Colonization"), "Colonization")
  assert.equal(adapter.currentStage("Idle"), null)
})
