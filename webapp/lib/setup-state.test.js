const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isApMode,
  hasActiveGrow,
  deviceSurfaceState,
  firstRunSteps,
  applyPresetWrites,
  presetSummary,
  connectionLabel,
  DEVICE_VERSION,
  GROW_PRESETS,
} = require("./setup-state.js");

test("AP mode is first-run Wi-Fi", () => {
  assert.equal(isApMode("Access Point", "Lykyn-Setup"), true);
  assert.equal(isApMode("Station", "Kitchen"), false);
  assert.equal(
    deviceSurfaceState({ wifiMode: "Access Point", ssid: "Lykyn-Setup", phase: "Idle", totalDays: 0, reachable: true }),
    "first-run-wifi"
  );
});

test("idle chamber is an empty grow, not a live recipe", () => {
  assert.equal(hasActiveGrow("Idle", 10), false);
  assert.equal(hasActiveGrow("Fruiting", 10), true);
  assert.equal(hasActiveGrow("Colonization", 0), true);
  assert.equal(
    deviceSurfaceState({ wifiMode: "Station", ssid: "Home", phase: "Idle", totalDays: 0, reachable: true }),
    "empty-grow"
  );
});

test("unreachable wins over setup", () => {
  assert.equal(
    deviceSurfaceState({ wifiMode: "Access Point", reachable: false }),
    "unreachable"
  );
  assert.equal(firstRunSteps("unreachable").action, "retry");
});

test("fruiting preset writes Lykyn stage and setpoint numbers", () => {
  const oyster = GROW_PRESETS.find((p) => p.id === "oyster-fruit");
  const writes = applyPresetWrites(oyster);
  assert.deepEqual(
    writes.map((w) => w.id),
    [
      "stage",
      "target_humidity",
      "temperature_target",
      "light_sunrise_hour",
      "light_hours",
      "light_white",
      "light_red",
      "light_green",
      "light_blue",
      "mist_level",
    ]
  );
  assert.equal(writes[0].value, "Fruiting");
  assert.equal(writes.find((w) => w.id === "target_humidity").value, 88.5);
});

test("every preset says exactly what it will change", () => {
  for (const preset of GROW_PRESETS) {
    const summary = presetSummary(preset);
    assert.match(summary, new RegExp(`Humidity ${preset.setpoints.humidity}%`));
    assert.match(summary, new RegExp(`temperature ${preset.setpoints.temperature}`));
  }
  assert.equal(presetSummary(GROW_PRESETS.find((p) => p.id === "colonizing")), "Humidity 90%, temperature 24°C, lights off.");
  assert.equal(
    presetSummary(GROW_PRESETS.find((p) => p.id === "oyster-fruit")),
    "Humidity 88.5%, temperature 18°C, lights on 12 hours from 8 AM."
  );
  assert.equal(firstRunSteps("empty-grow").action, "profile");
});

test("presets stay inside the chamber's allowed ranges", () => {
  for (const preset of GROW_PRESETS) {
    const sp = preset.setpoints;
    assert.ok(sp.humidity >= 30 && sp.humidity <= 95);
    assert.ok(sp.temperature >= 5 && sp.temperature <= 35);
    assert.ok(sp.sunrise >= 0 && sp.sunrise <= 23);
    assert.ok(sp.lightHours >= 0 && sp.lightHours <= 24);
    assert.ok(sp.white >= 0 && sp.white <= 100);
    assert.ok(sp.mist >= 10 && sp.mist <= 100);
  }
});

test("a home network whose name starts with Lykyn-Setup is still setup only in AP mode", () => {
  assert.equal(isApMode("Station", "Lykyn-Setup-guest"), false);
  assert.equal(isApMode("Station", "Lykyn-Setup"), false);
  assert.equal(isApMode("", "Lykyn-Setup"), true);
  assert.equal(connectionLabel("Station"), "Home Wi-Fi");
  assert.equal(connectionLabel("Access Point"), "Setup network");
});

test("shown version matches the firmware version", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const yaml = fs.readFileSync(path.join(__dirname, "..", "..", "lykyn-core.yaml"), "utf8");
  const match = yaml.match(/device_version:\s*"([^"]+)"/);
  assert.ok(match, "device_version not found in lykyn-core.yaml");
  assert.equal(DEVICE_VERSION, match[1]);
});

test("writes become the same entity ids the dashboard already listens to", () => {
  const { entityPatchFromWrites } = require("./setup-state.js");
  const patch = entityPatchFromWrites(applyPresetWrites(GROW_PRESETS.find((p) => p.id === "colonizing")));
  assert.equal(patch["select-stage"].state, "Colonization");
  assert.equal(patch["select-grow_phase"].state, "Colonization");
  assert.equal(patch["number-target_humidity"].value, 90);
  assert.equal(patch["number-light_hours"].value, 0);
  assert.equal(patch["number-lights__duration__hours_"].value, 0);
  assert.equal(patch["number-light_white"].value, 0);
  assert.equal(patch["number-white_led_intensity"].value, 0);
});

test("fruiting presets write duration and a complete mix", () => {
  const oyster = applyPresetWrites(GROW_PRESETS.find((p) => p.id === "oyster-fruit"));
  assert.equal(oyster.find((w) => w.id === "light_hours").value, 12);
  assert.equal(oyster.find((w) => w.id === "light_white").value, 23);
  assert.equal(oyster.find((w) => w.id === "light_blue").value, 80);
  assert.equal(oyster.find((w) => w.id === "mist_level").value, 75);
});
