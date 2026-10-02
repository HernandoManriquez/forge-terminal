#!/usr/bin/env python3
"""Run project checks without changing tests or hiding failures."""
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
os.chdir(root)
(root / "reports").mkdir(exist_ok=True)
(root / "build").mkdir(exist_ok=True)
checks = json.loads((root / "quality_gate.json").read_text())["checks"]
results = []
for check in checks:
    if "platforms" in check and platform.system().lower() not in check["platforms"]:
        results.append({"name": check["name"], "status": "SKIP", "reason": "Platform-specific check"})
        continue
    print(check["name"], flush=True)
    result = subprocess.run(check["command"], capture_output=True, text=True)
    status = "PASS" if result.returncode == 0 else "FAIL"
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    results.append({"name": check["name"], "status": status, "exit_code": result.returncode})
    (root / "reports" / ("gate-" + str(len(results)) + ".log")).write_text(result.stdout + result.stderr)
    if result.returncode:
        break
passed = not any(r["status"] == "FAIL" for r in results)
(root / "reports" / "quality-gate.json").write_text(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), "status": "PASS" if passed else "FAIL", "results": results}, indent=2))
sys.exit(0 if passed else 1)
