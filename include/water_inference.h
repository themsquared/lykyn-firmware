#pragma once

// Lykyn has no tank sensor. This infers "the tank may be empty or blocked" from the one thing it can
// see: humidity should rise while the mister runs. Every number below is a PLACEHOLDER until it is
// measured on a real unit (see docs/WATER.md). Pure C++ so a host test can run it.
//
// Normal: count the seconds the mister is really on. After WINDOW_ON_S of mist, did humidity rise by at
//   least MIN_GAIN? Two windows in a row without a rise make the state Suspect. A rise at or above
//   SATURATED_RH always counts, since humidity cannot climb much further. A window where the exchange
//   fans ran for more than half the mist time proves nothing, so it is dropped.
// Suspect: the mister is held off, because a dry ultrasonic disc is damaged by running. Every
//   PROBE_INTERVAL_S it is allowed PROBE_ON_S of mist. If humidity rises by PROBE_GAIN the tank is fine
//   again and the state clears. refilled() starts a probe at once, for the "I added water" button.
//
// Suspect is "may be empty", never "is empty". The site words it that way too.

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace esphome {
namespace lykyn {

enum class WaterVerdict : uint8_t { Unknown = 0, Ok = 1, Suspect = 2 };

inline const char *water_verdict_name(WaterVerdict v) {
  switch (v) {
    case WaterVerdict::Ok:
      return "ok";
    case WaterVerdict::Suspect:
      return "suspect";
    default:
      return "unknown";
  }
}

struct WaterInferenceConfig {
  uint32_t window_on_s{600};         // seconds of real mist per evaluation window
  float min_gain{2.0f};              // percent RH the window must gain
  uint8_t strikes_to_suspect{2};     // failed windows in a row
  float saturated_rh{90.0f};         // at or above this the window passes
  uint32_t max_window_s{2u * 3600u}; // a window older than this is stale and restarts
  uint32_t probe_interval_s{1800};   // wait between probes while suspect
  uint32_t probe_on_s{90};           // seconds of mist in a probe
  float probe_gain{1.0f};            // percent RH a probe must gain
};

class WaterInference {
 public:
  explicit WaterInference(WaterInferenceConfig c = WaterInferenceConfig{}) : c_(c) {}

  // Call once a second. fresh: the humidity sample is recent. mist_on: the mister is on this second.
  // fans_on: an exchange fan is running. rh is ignored when not fresh.
  void tick(bool fresh, float rh, bool mist_on, bool fans_on) {
    const bool rh_ok = fresh && !std::isnan(rh);
    if (suspect_) {
      tick_suspect_(rh_ok, rh, mist_on, fans_on);
    } else {
      tick_normal_(rh_ok, rh, mist_on, fans_on);
    }
  }

  // False while the mister must stay off: suspect, and not inside a probe.
  bool allow_mist() const { return !suspect_ || probing_; }
  bool suspect() const { return suspect_; }
  bool probing() const { return probing_; }
  WaterVerdict verdict() const { return suspect_ ? WaterVerdict::Suspect : (verified_ ? WaterVerdict::Ok : WaterVerdict::Unknown); }

  // The owner says they added water. If suspect, probe now. Otherwise just start a fresh window.
  void refilled() {
    if (suspect_) {
      start_probe_();
    } else {
      reset_window_();
      strikes_ = 0;
    }
  }

  // Restore across a reboot, so a power cycle does not send the mister back to dry running.
  void restore_suspect(bool s) {
    suspect_ = s;
    verified_ = false;
    probing_ = false;
    since_probe_s_ = 0;
    reset_window_();
    strikes_ = 0;
  }

 private:
  void reset_window_() {
    have_base_ = false;
    on_s_ = 0;
    fan_on_s_ = 0;
    age_s_ = 0;
    base_ = peak_ = NAN;
  }

  void tick_normal_(bool rh_ok, float rh, bool mist_on, bool fans_on) {
    if (!rh_ok) {
      // No humidity reading, so no evidence either way. Keep the window but let it age.
      if (have_base_ && ++age_s_ > c_.max_window_s)
        reset_window_();
      return;
    }
    if (have_base_) {
      peak_ = std::max(peak_, rh);
      if (++age_s_ > c_.max_window_s) {
        reset_window_();
        return;
      }
    }
    if (!mist_on)
      return;
    if (!have_base_) {
      have_base_ = true;
      base_ = peak_ = rh;
      age_s_ = 0;
    }
    on_s_++;
    if (fans_on)
      fan_on_s_++;
    if (on_s_ < c_.window_on_s)
      return;

    const bool fans_dominated = fan_on_s_ * 2 > on_s_;
    const bool rose = (peak_ - base_) >= c_.min_gain || peak_ >= c_.saturated_rh;
    if (rose) {
      strikes_ = 0;
      verified_ = true;
    } else if (!fans_dominated) {
      if (++strikes_ >= c_.strikes_to_suspect) {
        suspect_ = true;
        verified_ = false;
        since_probe_s_ = 0;
        probing_ = false;
      }
    }
    reset_window_();
  }

  void start_probe_() {
    probing_ = true;
    since_probe_s_ = 0;
    probe_on_s_ = 0;
    probe_fan_s_ = 0;
    probe_have_base_ = false;
    probe_base_ = probe_peak_ = NAN;
  }

  void tick_suspect_(bool rh_ok, float rh, bool mist_on, bool fans_on) {
    if (!probing_) {
      if (++since_probe_s_ >= c_.probe_interval_s)
        start_probe_();
      return;
    }
    if (!rh_ok)
      return;
    if (probe_have_base_)
      probe_peak_ = std::max(probe_peak_, rh);
    if (!mist_on)
      return;
    if (!probe_have_base_) {
      probe_have_base_ = true;
      probe_base_ = probe_peak_ = rh;
    }
    probe_on_s_++;
    if (fans_on)
      probe_fan_s_++;
    if (probe_on_s_ < c_.probe_on_s)
      return;

    const bool fans_dominated = probe_fan_s_ * 2 > probe_on_s_;
    const bool rose = (probe_peak_ - probe_base_) >= c_.probe_gain || probe_peak_ >= c_.saturated_rh;
    probing_ = false;
    since_probe_s_ = 0;
    if (rose) {
      suspect_ = false;
      verified_ = true;
      strikes_ = 0;
      reset_window_();
    } else if (fans_dominated) {
      // Inconclusive. Try again soon rather than after the full interval.
      since_probe_s_ = c_.probe_interval_s > 300 ? c_.probe_interval_s - 300 : 0;
    }
  }

  WaterInferenceConfig c_;
  bool suspect_{false};
  bool verified_{false};
  bool probing_{false};
  uint8_t strikes_{0};

  bool have_base_{false};
  uint32_t on_s_{0};
  uint32_t fan_on_s_{0};
  uint32_t age_s_{0};
  float base_{NAN};
  float peak_{NAN};

  uint32_t since_probe_s_{0};
  uint32_t probe_on_s_{0};
  uint32_t probe_fan_s_{0};
  bool probe_have_base_{false};
  float probe_base_{NAN};
  float probe_peak_{NAN};
};

// The one instance, shared by the 1 s climate loop and the "Water Refilled" button.
inline WaterInference &water_inference() {
  static WaterInference instance;
  return instance;
}

}  // namespace lykyn
}  // namespace esphome
