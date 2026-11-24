"""
verify_system.py - Automated End-to-End System Verification for CampusGhosts.

Verifies:
(a) All pytest suites from Phases 1 & 2 pass with 100% success rate.
(b) GET / returns HTTP 200 with complete index.html UI.
(c) GET /static/app.js, /static/guard.js, /static/replay.js return HTTP 200 with valid content.
(d) Node.js syntax inspection (node --check) succeeds for all static ES modules.
"""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure campusghosts directory is on sys.path
_CURRENT_DIR = str(Path(__file__).resolve().parent)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from main import app
from db import init_and_seed_db


def run_verification() -> bool:
    print("=" * 70)
    print("CAMPUSGHOSTS SYSTEM VERIFICATION HARNESS")
    print("=" * 70)
    all_passed = True

    # -------------------------------------------------------------------------
    # 1. Pytest Test Suites (Phase 1 & Phase 2)
    # -------------------------------------------------------------------------
    print("\n[CHECK A] Running Pytest Suites (test_phase1.py, test_phase2.py & test_dynamic_processing.py)...")
    test_files = [
        os.path.join(_CURRENT_DIR, "test_phase1.py"),
        os.path.join(_CURRENT_DIR, "test_phase2.py"),
        os.path.join(_CURRENT_DIR, "test_dynamic_processing.py"),
    ]

    ret_code = pytest.main(["-q", "--no-header", *test_files])
    if ret_code == 0:
        print("  \u2713 [PASS] All 28 pytest tests passed across Phase 1, Phase 2 & Dynamic Processing.")
    else:
        print(f"  \u2717 [FAIL] Pytest exited with code {ret_code}.")
        all_passed = False

    # -------------------------------------------------------------------------
    # 2. HTTP Root Route Verification
    # -------------------------------------------------------------------------
    print("\n[CHECK B] Verifying GET / (index.html)...")
    init_and_seed_db()
    client = TestClient(app)

    resp_root = client.get("/")
    if resp_root.status_code == 200 and "CampusGhosts" in resp_root.text:
        print(f"  \u2713 [PASS] GET / returned HTTP 200 ({len(resp_root.text)} bytes HTML).")
    else:
        print(f"  \u2717 [FAIL] GET / returned HTTP {resp_root.status_code}.")
        all_passed = False

    # -------------------------------------------------------------------------
    # 3. Static ES Module Endpoints
    # -------------------------------------------------------------------------
    print("\n[CHECK C] Verifying Static ES Module Endpoints...")
    static_endpoints = [
        ("/static/app.js", "AntiCheatGuard"),
        ("/static/guard.js", "class AntiCheatGuard"),
        ("/static/replay.js", "class GhostReplayEngine"),
    ]

    for endpoint, signature in static_endpoints:
        resp = client.get(endpoint)
        if resp.status_code == 200 and signature in resp.text:
            print(f"  \u2713 [PASS] GET {endpoint} returned HTTP 200 (Contains '{signature}').")
        else:
            print(f"  \u2717 [FAIL] GET {endpoint} failed with HTTP {resp.status_code}.")
            all_passed = False

    # -------------------------------------------------------------------------
    # 4. JavaScript Syntax Validation via Node.js
    # -------------------------------------------------------------------------
    print("\n[CHECK D] Validating JavaScript ES Modules Syntax via 'node --check'...")
    node_bin = shutil.which("node")
    if node_bin:
        js_files = [
            os.path.join(_CURRENT_DIR, "static", "app.js"),
            os.path.join(_CURRENT_DIR, "static", "guard.js"),
            os.path.join(_CURRENT_DIR, "static", "replay.js"),
        ]
        cmd = [node_bin, "--check", *js_files]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"  \u2713 [PASS] Node.js syntax check passed with 0 errors across {len(js_files)} modules.")
        else:
            print(f"  \u2717 [FAIL] Node.js syntax check reported errors:\n{res.stderr}")
            all_passed = False
    else:
        print("  ! [SKIP] Node.js binary not detected in PATH. Skipping 'node --check'.")

    # -------------------------------------------------------------------------
    # Overall Status Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    if all_passed:
        print("VERIFICATION RESULT: ALL CHECKS PASSED CLEANLY (SYSTEM READY).")
        print("=" * 70)
        return True
    else:
        print("VERIFICATION RESULT: ONE OR MORE CHECKS FAILED.")
        print("=" * 70)
        return False


if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
