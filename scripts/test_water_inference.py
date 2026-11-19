#!/usr/bin/env python3
"""Host tests for the Lykyn tank inference (include/water_inference.h) and the water telemetry fields."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def build_and_run(tmp, name, sources, includes):
    exe = Path(tmp) / name
    cxx = os.environ.get("CXX", "g++")
    cmd = [cxx, "-std=c++17", "-O1", "-Wall", "-Werror", "-fsanitize=address,undefined"]
    for inc in includes:
        cmd += ["-I", str(inc)]
    cmd += [str(REPO / s) for s in sources] + ["-o", str(exe)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{name} compile failed\n{r.stdout}{r.stderr}")
    r = subprocess.run([str(exe)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.exit(f"{name} failed\n{r.stderr}")


def main():
    comp = REPO / "external_components/shroom_labs_cloud"
    with tempfile.TemporaryDirectory() as tmp:
        build_and_run(tmp, "water_inference_test", ["scripts/water_inference_host_test.cpp"], [REPO / "include"])
        build_and_run(
            tmp,
            "water_telemetry_test",
            ["scripts/water_telemetry_host_test.cpp", "external_components/shroom_labs_cloud/cloud_format.cpp"],
            [comp],
        )


if __name__ == "__main__":
    main()
