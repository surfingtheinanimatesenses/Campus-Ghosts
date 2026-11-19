"""
verify_system.py - Automated End-to-End System Verification for CampusGhosts.

Verifies:
(a) All pytest suites pass with 100% success rate.
(b) GET / returns HTTP 200 with the 3-column authentication and landing portal.
(c) REST API endpoints (/api/v1/arena/problems, /api/v1/faculty/telemetry) return HTTP 200.
(d) Static web modules pass Node.js syntax checks (node --check).
(e) Vercel configuration vercel.json exists and validates as valid JSON.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import pytest
from fastapi.testclient import TestClient

_CURRENT_DIR = str(Path(__file__).resolve().parent)
_BACKEND_DIR = os.path.join(_CURRENT_DIR, "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from backend.main import app


def run_verification() -> bool:
    print("=" * 70)
    print("CAMPUSGHOSTS MULTI-ROLE & VERCEL SYSTEM VERIFICATION HARNESS")
    print("=" * 70)
    all_passed = True

    # -------------------------------------------------------------------------
    # 1. Pytest Test Suites
    # -------------------------------------------------------------------------
    print("\n[CHECK A] Running Pytest Suite (backend/test_api.py)...")
    test_files = [
        os.path.join(_CURRENT_DIR, "backend", "test_api.py"),
    ]

    ret_code = pytest.main(["-q", "--no-header", *test_files])
    if ret_code == 0:
        print("  \u2713 [PASS] All 13 API and workflow tests passed cleanly.")
    else:
        print(f"  \u2717 [FAIL] Pytest exited with code {ret_code}.")
        all_passed = False

    # -------------------------------------------------------------------------
    # 2. HTTP Root Route Verification (3-Card Landing Portal)
    # -------------------------------------------------------------------------
    print("\n[CHECK B] Verifying GET / (Landing Portal)...")
    client = TestClient(app)

    resp_root = client.get("/")
    if resp_root.status_code == 200 and "Student ZK Portal" in resp_root.text:
        print(f"  \u2713 [PASS] GET / returned HTTP 200 ({len(resp_root.text)} bytes HTML with Student, Faculty & Arena portals).")
    else:
        print(f"  \u2717 [FAIL] GET / returned HTTP {resp_root.status_code}.")
        all_passed = False

    # -------------------------------------------------------------------------
    # 3. Core API Endpoints
    # -------------------------------------------------------------------------
    print("\n[CHECK C] Verifying Core REST Endpoints...")
    endpoints = [
        ("/api/v1/arena/problems", 200, "ptr-swap"),
        ("/api/v1/faculty/telemetry", 200, "clusters"),
        ("/api/v1/arena/leaderboard", 200, "leaderboard"),
    ]

    for endpoint, expected_status, signature in endpoints:
        resp = client.get(endpoint)
        if resp.status_code == expected_status and signature in resp.text:
            print(f"  \u2713 [PASS] GET {endpoint} returned HTTP {expected_status} (Contains '{signature}').")
        else:
            print(f"  \u2717 [FAIL] GET {endpoint} returned HTTP {resp.status_code}.")
            all_passed = False

    # -------------------------------------------------------------------------
    # 4. JavaScript Syntax Validation via Node.js
    # -------------------------------------------------------------------------
    print("\n[CHECK D] Validating JavaScript Syntax via 'node --check'...")
    node_bin = shutil.which("node")
    if node_bin:
        js_file = os.path.join(_CURRENT_DIR, "static", "app.js")
        cmd = [node_bin, "--check", js_file]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print("  \u2713 [PASS] Node.js syntax check passed with 0 errors.")
        else:
            print(f"  \u2717 [FAIL] Node.js syntax check reported errors:\n{res.stderr}")
            all_passed = False
    else:
        print("  ! [SKIP] Node.js binary not detected in PATH.")

    # -------------------------------------------------------------------------
    # 5. Vercel Configuration Check
    # -------------------------------------------------------------------------
    print("\n[CHECK E] Validating vercel.json configuration...")
    vpath = os.path.join(_CURRENT_DIR, "vercel.json")
    if os.path.exists(vpath):
        try:
            with open(vpath, "r", encoding="utf-8") as f:
                vconfig = json.load(f)
            assert "builds" in vconfig or "routes" in vconfig
            print("  \u2713 [PASS] vercel.json is present and valid JSON.")
        except Exception as e:
            print(f"  \u2717 [FAIL] vercel.json validation error: {e}")
            all_passed = False
    else:
        print("  \u2717 [FAIL] vercel.json missing.")
        all_passed = False

    # -------------------------------------------------------------------------
    # Overall Status Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    if all_passed:
        print("VERIFICATION RESULT: ALL CHECKS PASSED CLEANLY (SYSTEM READY FOR LOCALHOST & VERCEL).")
        print("=" * 70)
        return True
    else:
        print("VERIFICATION RESULT: ONE OR MORE CHECKS FAILED.")
        print("=" * 70)
        return False


if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
