# Water on Lykyn

Lykyn has no tank sensor. The stock firmware has none either (see `PINMAP.md`), so the firmware cannot read the tank. What it can see is humidity, and humidity should rise while the mister runs.

## What the firmware does

`include/water_inference.h` counts the seconds the mister is really on.

1. After 10 minutes of mist, humidity should have gained at least 2 percentage points. A gain, or humidity at 90% or more, counts as a pass.
2. Two windows in a row without a gain make the state `suspect`. Windows where an exchange fan ran for more than half of the mist time prove nothing and are dropped. So is any window with no humidity reading.
3. While `suspect` the mister is held off, because a dry ultrasonic disc is damaged by running. It is allowed a 90 second probe every 30 minutes. If humidity gains 1 point during a probe, the state clears.
4. The **Water Refilled** button probes at once, for after adding water.
5. `suspect` is saved, so a power cycle does not send the mister back to dry running.

All the numbers are placeholders until they are measured on a real unit. See "Calibration" below.

## Where it shows up

- `Active Alerts` contains `water_low` while suspect. The local API (`/api/status`) reports it under `health.errors`, because that field is fed from `Active Alerts`.
- `Water State` text sensor: `ok`, `suspect` or `unknown` (no verdict since boot). It is hidden on the page.
- Cloud telemetry carries `water_state`, `water_source: "inferred"` and `water_low`, and the `water.inferred` capability. `unknown` sends no `water_low`, so the site neither opens nor clears an alert. A change to or from `suspect` is pushed at once (at most one push per 2 minutes).
- The site words it honestly: humidity is not rising while the mister runs, so the tank may be empty or the mister blocked. It never says the tank is empty.

## Calibration (before trusting it)

Measure on a real chamber with water, then with an empty tank:

- How many points of RH does 10 minutes of mist add with the usual fan schedule? The 2 point gain must sit well below that.
- How much does RH wobble over a window with the mister off? The gain must sit well above that.
- Does the 120 s on, 30 s rest rule and the mist level setting give 10 minutes of real mist in a sensible time? At 50% mist level a window takes about 20 minutes of wall time.

If a chamber is in a very leaky tent, the mister may never raise humidity and this will report a false suspect. That chamber would need a lower gain or no inference.

Host tests: `python3 scripts/test_water_inference.py`.
