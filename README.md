# lykyn-firmware

Native Shroom Labs firmware for the Lykyn mushroom chamber (ESP32-C3, 4 MB). Built with ESPHome.
Status: running on a real Lykyn. The on-device dashboard is the default page at `/`. The stock ESPHome entity table is at `/esp`.

What it does:

- Reads the SHT3x (I2C 0x44) for temperature and humidity.
- Runs a local climate loop with no cloud: humidity hysteresis, fresh air exchange cycles, over-humidity and
  over-temperature fan boost, sensor-lost failsafe.
- Drives both PWM fans, the ultrasonic mister (on/off with a time-proportional Mist Level), the 16 pixel
  WS2812B grow ring (RGB and white mix, photoperiod) and the status pixel.
- Default profile is Black Oyster, SMART, 15 to 21 C, 85 to 92 percent RH. Stages: Fruiting, Pinning, Colonization, Custom.
- Local HTTP/JSON API (ESPHome web server REST), same entity names the OpenShrooly hub already polls.
- OTA over Wi-Fi, Wi-Fi setup by captive portal (`Lykyn-Setup`) or Improv over USB.
- Same 4 MB partition layout as the stock firmware, so the stock image and this one can swap.

Pins and how they were found are in `docs/PINMAP.md`.

## Builds

| File | Use |
| --- | --- |
| `lykyn-public.yaml` | No secrets inside. Safe to host for the web installer. No web or OTA password. |
| `lykyn-provision.yaml` | No Wi-Fi inside, web UI and OTA passwords from `secrets.yaml`. |
| `lykyn-home.yaml` | Same plus your Wi-Fi from `secrets.yaml`. |

```
python3 -m venv .venv && .venv/bin/pip install esphome
cp secrets.example.yaml secrets.yaml   # edit it, never commit it
.venv/bin/esphome compile lykyn-provision.yaml
```

`secrets.yaml` and every compiled image from the private builds are git ignored. Compiled images embed the
passwords from `secrets.yaml`.

## Local discovery and status

The chamber advertises `_shroomlabs._tcp` on port 80 so in-network tools can find it.
`GET /api/status` is a shared, read-only JSON document (schema version 1). It is open on the
LAN even on the passworded builds, and it does not include secrets, Wi-Fi credentials, or a MAC
address. The same contract is used on Shrooly. See `docs/local-api.md`.

```
avahi-browse -r _shroomlabs._tcp
curl -sS http://lykyn.local/api/status
curl -sS http://lykyn.local/api/status/schema
```

Host tests for the JSON builder:

```
python3 scripts/test_shroom_labs_local_api.py
```

## LAN API

The ESPHome entity REST API can still read and write individual knobs. Basic auth on the private builds. Examples:

```
curl -u shroom:PASSWORD http://lykyn.local/text_sensor/Status%20JSON
curl -u shroom:PASSWORD http://lykyn.local/sensor/Current%20Humidity
curl -u shroom:PASSWORD -X POST "http://lykyn.local/number/Target%20Humidity/set?value=90"
curl -u shroom:PASSWORD -X POST "http://lykyn.local/select/Stage/set?option=Pinning"
curl -u shroom:PASSWORD -X POST "http://lykyn.local/select/Control%20Mode/set?option=MANUAL"
curl -u shroom:PASSWORD -X POST http://lykyn.local/switch/Humidifier/turn_on
```

ESPHome 2026.10 identifies entities by their display name, not the YAML id. The dashboard maps those
names back to the same ids the OpenShrooly hub already knows: `current_temperature`, `current_humidity`,
`target_humidity`, `temperature_target`, `humidifier_status`, `air_exchange_status`, `light_status`,
`active_alerts`, `ip_address`, `wifi_ssid`.

## On-device dashboard

After Wi-Fi is up, open `http://<chamber-ip>/`. That page is the same Shroom Labs dashboard the
Shrooly uses: gauges, grouped controls, and a Shroom Labs cloud link that is on by default. The stock ESPHome entity table
is at `/esp` (also `/entities`).

To rebuild the dashboard into the firmware:

```
scripts/build-webapp.sh
.venv/bin/esphome compile lykyn-home.yaml
```

## Shroom Labs link

Two paths, the same as a Shrooly:

- The local hub can still poll the LAN REST API and sync to shroomlabs.io.
- The chamber itself also opens an outbound link. Cloud is on by default: on boot it enrolls at
  `api.shroomlabs.io` and shows a 6-character claim code and a QR for
  `https://shroomlabs.io/claim.html?code=...`. After you claim it on the site, the chamber fetches a
  client certificate and talks to `api.shroomlabs.io`. You can still turn Connect to Shroom Labs
  off in Settings. A cloud failure does not change the local climate loop.

Coach profiles reach the unit by writing the numbers and selects above, or through the inbox once
the chamber is linked.

## Safety clamps

- Mister never runs more than 120 s of demand in a row, then rests 30 s.
- Mister off at or above the high end of the humidity band, and always off at 95 percent RH.
- No valid sensor reading for 60 s: mister off, fans at 33 percent.
- Fans never run below 33 percent duty.
- Temperature min and max are alerts only. The Lykyn has no heater or cooler.

## Not done

- Colour order of the ring is assumed GRB until the LED Test button says otherwise.
- GPIO0 and GPIO6 purpose unknown. Held HIGH like stock.
