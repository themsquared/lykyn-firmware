// Host test for the water fields in Lykyn cloud telemetry. Run: python3 scripts/test_water_inference.py
#include "cloud_format.h"

#include <cstdio>
#include <string>

using namespace esphome::shroom_labs;

static int fails = 0;
static void expect(bool ok, const char *name) {
  if (!ok) {
    std::fprintf(stderr, "FAIL %s\n", name);
    fails++;
  } else {
    std::printf("ok %s\n", name);
  }
}
static bool has(const std::string &s, const char *needle) { return s.find(needle) != std::string::npos; }

int main() {
  ChamberReading r;
  r.has_temperature = true;
  r.temperature = 21.5f;
  expect(!has(telemetry_body_json(r, 0, nullptr, nullptr), "water"), "no water fields without water tracking");

  r.water_state = "suspect";
  r.water_source = "inferred";
  std::string j = telemetry_body_json(r, 0, nullptr, nullptr);
  expect(has(j, "\"water_state\":\"suspect\""), "suspect sent");
  expect(has(j, "\"water_source\":\"inferred\""), "source inferred");
  expect(has(j, "\"water_low\":true"), "suspect is water_low true");
  expect(!has(j, "water_level"), "no level without a sensor");

  r.water_state = "ok";
  j = telemetry_body_json(r, 0, nullptr, nullptr);
  expect(has(j, "\"water_low\":false"), "ok is water_low false");

  r.water_state = "unknown";
  j = telemetry_body_json(r, 0, nullptr, nullptr);
  expect(has(j, "\"water_state\":\"unknown\"") && !has(j, "water_low"), "unknown sends no water_low");

  r.water_state = "suspect";
  r.water_source.clear();
  expect(has(telemetry_body_json(r, 0, nullptr, nullptr), "\"water_source\":\"inferred\""),
         "suspect is inferred even if the source is missing");

  if (fails) {
    std::fprintf(stderr, "%d failed\n", fails);
    return 1;
  }
  std::printf("water telemetry host tests passed\n");
  return 0;
}
