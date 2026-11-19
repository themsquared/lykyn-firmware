// Host test for the Lykyn tank inference. Run: python3 scripts/test_water_inference.py
#include "water_inference.h"

#include <cmath>
#include <cstdio>
#include <string_view>

using namespace esphome::lykyn;

static int fails = 0;
static void expect(bool ok, const char *name) {
  if (!ok) {
    std::fprintf(stderr, "FAIL %s\n", name);
    fails++;
  } else {
    std::printf("ok %s\n", name);
  }
}

// A tiny chamber. With water, mist adds `gain_per_s` percent RH each second it is on. Without water it adds
// nothing. Humidity always leaks down a little, and is clamped to 0..100.
struct Chamber {
  float rh{60};
  bool water{true};
  float gain_per_s{0.02f};
  float leak_per_s{0.0005f};
  bool mist_demand{true};  // the controller wants mist
};

// Run `seconds` of control loop. The mister is on whenever the controller wants it and the inference allows it.
static void run(WaterInference &w, Chamber &c, uint32_t seconds, bool fans_on = false) {
  for (uint32_t i = 0; i < seconds; i++) {
    const bool mist = c.mist_demand && w.allow_mist();
    if (mist && c.water)
      c.rh += c.gain_per_s;
    c.rh -= c.leak_per_s * (fans_on ? 6.0f : 1.0f);
    c.rh = std::fmax(0.0f, std::fmin(100.0f, c.rh));
    w.tick(true, c.rh, mist, fans_on);
  }
}

int main() {
  {
    WaterInference w;
    Chamber c;
    run(w, c, 3 * 3600);
    expect(!w.suspect() && w.verdict() == WaterVerdict::Ok, "a working mister is never suspect, and verifies ok");
  }
  {
    WaterInference w;
    expect(w.verdict() == WaterVerdict::Unknown && w.allow_mist(), "starts unknown and allows mist");
  }
  {
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 600);
    expect(!w.suspect(), "one dry window is not enough");
    run(w, c, 600);
    expect(w.suspect() && w.verdict() == WaterVerdict::Suspect, "two dry windows make it suspect");
    expect(!w.allow_mist(), "suspect holds the mister off");
  }
  {
    // Suspect, then a refill. The next probe sees humidity rise and clears it.
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 1200);
    expect(w.suspect(), "suspect before refill");
    c.water = true;
    run(w, c, 1790);
    expect(w.suspect() && !w.allow_mist(), "no probe yet, still held off");
    run(w, c, 20);
    expect(w.probing(), "probe starts after the interval");
    run(w, c, 120);
    expect(!w.suspect() && w.verdict() == WaterVerdict::Ok, "a probe with water clears suspect");
    expect(w.allow_mist(), "mister runs again");
  }
  {
    // Still dry: the probe fails and the mister goes back off.
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 1200);
    run(w, c, 1810);
    expect(w.probing(), "probe armed");
    run(w, c, 120);
    expect(w.suspect() && !w.probing() && !w.allow_mist(), "a dry probe stays suspect and stops");
  }
  {
    // The refilled() button probes now instead of waiting.
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 1200);
    c.water = true;
    w.refilled();
    expect(w.probing() && w.allow_mist(), "refilled starts a probe at once");
    run(w, c, 120);
    expect(!w.suspect(), "and a good probe clears it");
  }
  {
    // refilled() when not suspect does not make anything worse.
    WaterInference w;
    w.refilled();
    expect(!w.suspect() && w.allow_mist(), "refilled while ok is a no-op");
  }
  {
    // Fans running most of the time hide the rise. That window proves nothing.
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 3600, true);
    expect(!w.suspect(), "fan-dominated windows never make it suspect");
  }
  {
    // Humidity already saturated: a window passes even without a measurable gain.
    WaterInference w;
    Chamber c;
    c.rh = 93;
    c.water = false;
    c.leak_per_s = 0;
    run(w, c, 3600);
    expect(!w.suspect(), "saturated humidity passes");
  }
  {
    // No humidity reading means no evidence.
    WaterInference w;
    for (int i = 0; i < 4000; i++)
      w.tick(false, NAN, true, false);
    expect(!w.suspect(), "stale humidity cannot make it suspect");
  }
  {
    // A mister that rarely runs never collects a window.
    WaterInference w;
    Chamber c;
    c.water = false;
    c.mist_demand = false;
    run(w, c, 6 * 3600);
    expect(!w.suspect(), "no mist means no verdict");
  }
  {
    // Suspect survives a reboot, and the probe timer restarts.
    WaterInference w;
    w.restore_suspect(true);
    expect(w.suspect() && !w.allow_mist(), "restored suspect holds the mister off");
    Chamber c;
    run(w, c, 1810);
    expect(w.probing(), "a restored suspect still gets probed");
    run(w, c, 120);
    expect(!w.suspect(), "and clears when the mister works");
  }
  {
    // A good window between two bad ones resets the strikes.
    WaterInference w;
    Chamber c;
    c.water = false;
    run(w, c, 600);
    c.water = true;
    run(w, c, 600);
    c.water = false;
    c.rh = 60;
    run(w, c, 600);
    expect(!w.suspect(), "a good window resets the strike count");
  }
  {
    expect(std::string_view(water_verdict_name(WaterVerdict::Ok)) == "ok", "name ok");
    expect(std::string_view(water_verdict_name(WaterVerdict::Suspect)) == "suspect", "name suspect");
    expect(std::string_view(water_verdict_name(WaterVerdict::Unknown)) == "unknown", "name unknown");
  }
  if (fails) {
    std::fprintf(stderr, "%d failed\n", fails);
    return 1;
  }
  std::printf("water inference host tests passed\n");
  return 0;
}
