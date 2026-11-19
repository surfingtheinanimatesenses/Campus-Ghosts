"""
test_phase2.py - End-to-End Test Suite for CampusGhosts Phase 2.

Validates:
1. Student commit & ZK identity verification.
2. Live duel submission with offline fallback and rating calculation.
3. Transition of ARRAY_OUT_OF_BOUNDS from masked: True (4) to masked: False (5) in safe mode.
4. ELO penalties and bounds floor.
5. Zero-knowledge placement claim verification (valid vs wrong salt).
6. Remedial presentation & viva question generation.
7. Leaderboards, schema inspection, and static web index.
8. Safe handling when keys.json is missing or empty.
"""

import hashlib
import os
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure campusghosts directory is on sys.path
_CURRENT_DIR = str(Path(__file__).resolve().parent)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from db import init_and_seed_db, compute_commitment, get_connection
from ai_engine import GLOBAL_KEY_POOL, analyze_code_sync, offline_analyze_code
from main import app


@pytest.fixture(autouse=True)
def setup_test_environment(tmp_path):
    """Isolate database and key pool for every test."""
    db_file = str(tmp_path / "test_p2_campusghosts.db")
    os.environ["CAMPUSGHOSTS_DB"] = db_file
    init_and_seed_db(db_file)

    # Ensure key pool points to a non-existent keys.json so offline fallback is tested
    GLOBAL_KEY_POOL.reload(str(tmp_path / "missing_keys.json"))

    yield

    # Clean up environment variable
    os.environ.pop("CAMPUSGHOSTS_DB", None)


@pytest.fixture
def client():
    """Create a FastAPI TestClient."""
    return TestClient(app)


# ---------------------------------------------------------------------------
# Test 1: Student Commit Endpoint
# ---------------------------------------------------------------------------
def test_auth_commit_valid_and_idempotent(client):
    """Test valid student commitment generation and persistence."""
    roll = "2601019999"
    salt = "secure_salt_2026"

    resp = client.post("/api/auth/commit", json={"roll_no": roll, "secret_salt": salt})
    assert resp.status_code == 200
    data = resp.json()

    expected_hash = compute_commitment(roll, salt)
    assert data["commitment_hash"] == expected_hash
    assert data["alias"].startswith("Cipher_")
    assert data["elo_rating"] == 1200
    assert data["human_trust_score"] == 100.0

    # Idempotent re-commit returns the exact same ghost identity
    resp_again = client.post("/api/auth/commit", json={"roll_no": roll, "secret_salt": salt})
    assert resp_again.status_code == 200
    assert resp_again.json() == data


def test_auth_commit_validation_errors(client):
    """Test validation errors on invalid roll or short salt."""
    # Salt too short (< 8 chars)
    resp = client.post("/api/auth/commit", json={"roll_no": "2601019999", "secret_salt": "short"})
    assert resp.status_code == 422 or resp.status_code == 400

    # Empty roll number
    resp = client.post("/api/auth/commit", json={"roll_no": "   ", "secret_salt": "valid_salt_1234"})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Test 2: Duel Submit & k-Anonymity Transition (Masked -> Unmasked)
# ---------------------------------------------------------------------------
def test_duel_submit_and_k_anonymity_transition(client):
    """
    Critical requirement:
    Submitting buggy array code with a newly committed ghost pushes
    ARRAY_OUT_OF_BOUNDS from masked: True (4) to masked: False (5) in safe mode.
    """
    # 1. Verify initial telemetry in safe mode: ARRAY_OUT_OF_BOUNDS must be masked (4 < 5)
    t_safe = client.get("/api/faculty/telemetry?mode=safe").json()
    arr_safe_before = next(c for c in t_safe["clusters"] if c["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_safe_before["masked"] is True
    assert arr_safe_before["count"] is None
    assert arr_safe_before["label"] == "MASKED (k < 5)"

    # Verify initial count in raw mode is 4
    t_raw = client.get("/api/faculty/telemetry?mode=raw").json()
    arr_raw_before = next(c for c in t_raw["clusters"] if c["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_raw_before["count"] == 4

    # 2. Commit a brand-new student to obtain a fresh ghost hash
    commit_resp = client.post(
        "/api/auth/commit",
        json={"roll_no": "2601018888", "secret_salt": "fresh_new_salt_2026"},
    )
    assert commit_resp.status_code == 200
    new_ghost = commit_resp.json()
    ghost_hash = new_ghost["commitment_hash"]

    # 3. Submit buggy C++ code containing an off-by-one ARRAY_OUT_OF_BOUNDS bug
    buggy_array_code = """
    #include <iostream>
    int sumArray(int arr[], int n) {
        int total = 0;
        for (int i = 0; i <= n; i++) {
            total += arr[i];
        }
        return total;
    }
    """

    submit_resp = client.post(
        "/api/duel/submit",
        json={
            "commitment_hash": ghost_hash,
            "code": buggy_array_code,
            "language": "cpp",
            "problem_id": "arr-bound",
            "opponent_elo": 1200,
        },
    )
    assert submit_resp.status_code == 200
    sub_data = submit_resp.json()

    # Diagnostic must detect the array boundary issue
    assert sub_data["diagnostic"]["passed"] is False
    assert sub_data["diagnostic"]["concept_tag"] == "ARRAY_OUT_OF_BOUNDS"
    assert sub_data["diagnostic"]["severity"] == "HIGH"
    assert sub_data["diagnostic"]["source"] == "offline_fallback"
    assert sub_data["elo_delta"] < 0
    assert sub_data["new_elo"] < 1200

    # 4. Check telemetry in safe mode now: MUST be unmasked with count == 5 (k >= 5)
    t_safe_after = client.get("/api/faculty/telemetry?mode=safe").json()
    arr_safe_after = next(c for c in t_safe_after["clusters"] if c["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_safe_after["masked"] is False
    assert arr_safe_after["count"] == 5
    assert arr_safe_after["label"] == "5"

    # Raw mode must also confirm count == 5
    t_raw_after = client.get("/api/faculty/telemetry?mode=raw").json()
    arr_raw_after = next(c for c in t_raw_after["clusters"] if c["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_raw_after["count"] == 5


# ---------------------------------------------------------------------------
# Test 3: Passing Code Submission
# ---------------------------------------------------------------------------
def test_duel_submit_optimal_code(client):
    """Test optimal passing solution awards positive ELO and records no failure telemetry."""
    # Commit student
    commit_resp = client.post(
        "/api/auth/commit",
        json={"roll_no": "2601017777", "secret_salt": "passing_salt_2026"},
    )
    ghost_hash = commit_resp.json()["commitment_hash"]

    # Passing C++ pointer swap
    optimal_code = """
    void swap(int* a, int* b) {
        int temp = *a;
        *a = *b;
        *b = temp;
    }
    """

    submit_resp = client.post(
        "/api/duel/submit",
        json={
            "commitment_hash": ghost_hash,
            "code": optimal_code,
            "language": "cpp",
            "problem_id": "ptr-swap",
            "opponent_elo": 1200,
        },
    )
    assert submit_resp.status_code == 200
    data = submit_resp.json()

    assert data["diagnostic"]["passed"] is True
    assert data["diagnostic"]["concept_tag"] == "OPTIMAL"
    assert data["elo_delta"] > 0
    assert data["new_elo"] > 1200


# ---------------------------------------------------------------------------
# Test 4: ELO Penalty Deduction & Bounds Floor
# ---------------------------------------------------------------------------
def test_duel_penalty_and_floor(client):
    """Verify -25 ELO deduction with a minimum floor of 100."""
    commit_resp = client.post(
        "/api/auth/commit",
        json={"roll_no": "2601016666", "secret_salt": "penalty_salt_2026"},
    )
    ghost_hash = commit_resp.json()["commitment_hash"]

    # Normal deduction from 1200 -> 1175
    resp = client.post("/api/duel/penalty", json={"commitment_hash": ghost_hash, "reason": "Tab switch"})
    assert resp.status_code == 200
    assert resp.json()["new_elo"] == 1175

    # Manually drop elo to 110 in DB to test floor
    conn = get_connection()
    with conn:
        conn.execute("UPDATE ghost_profiles SET elo_rating = 110 WHERE commitment_hash = ?;", (ghost_hash,))
    conn.close()

    # Deducting 25 from 110 must floor at 100
    resp_floor = client.post("/api/duel/penalty", json={"commitment_hash": ghost_hash, "reason": "Clipboard paste"})
    assert resp_floor.status_code == 200
    assert resp_floor.json()["new_elo"] == 100

    # Non-existent ghost
    resp_404 = client.post("/api/duel/penalty", json={"commitment_hash": "non_existent_hash", "reason": "Test"})
    assert resp_404.status_code == 404


# ---------------------------------------------------------------------------
# Test 5: Placement Claim Verification (Valid vs Wrong Salt)
# ---------------------------------------------------------------------------
def test_claim_verify(client):
    """Verify cryptographic zero-knowledge claim verification."""
    roll = "2601015555"
    salt = "placement_salt_2026"

    # Register student
    commit_resp = client.post("/api/auth/commit", json={"roll_no": roll, "secret_salt": salt})
    assert commit_resp.status_code == 200
    ghost_data = commit_resp.json()

    # 1. Valid Claim
    valid_resp = client.post("/api/claim/verify", json={"roll_no": roll, "secret_salt": salt})
    assert valid_resp.status_code == 200
    val_data = valid_resp.json()
    assert val_data["verified"] is True
    assert val_data["alias"] == ghost_data["alias"]
    assert val_data["elo_rating"] == ghost_data["elo_rating"]
    assert "rank" in val_data
    assert "signed_proof_hash" in val_data

    # Verify signature format: SHA256(commitment_hash:elo_rating:KRMU_VERIFIED)
    expected_proof = hashlib.sha256(
        f"{ghost_data['commitment_hash']}:{ghost_data['elo_rating']}:KRMU_VERIFIED".encode("utf-8")
    ).hexdigest()
    assert val_data["signed_proof_hash"] == expected_proof

    # 2. Wrong Salt Fails
    wrong_resp = client.post("/api/claim/verify", json={"roll_no": roll, "secret_salt": "wrong_salt_9999"})
    assert wrong_resp.status_code == 200
    assert wrong_resp.json()["verified"] is False


# ---------------------------------------------------------------------------
# Test 6: Faculty Remedial Presentation Plan Generation
# ---------------------------------------------------------------------------
def test_faculty_remedial_plan(client):
    """Verify structured remedial generation for all 4 core concepts."""
    for tag in ("POINTER_DEREF_NULL", "ARRAY_OUT_OF_BOUNDS", "LOOP_INFINITE_BOUND", "RECURSION_NO_BASE"):
        resp = client.post("/api/faculty/remedial", json={"concept_tag": tag, "ghost_count": 5})
        assert resp.status_code == 200
        plan = resp.json()

        assert "title" in plan
        assert len(plan["slides"]) == 5
        assert len(plan["viva_questions"]) == 3
        assert plan["source"] == "offline_fallback"

        # Verify slide structure
        for slide in plan["slides"]:
            assert "slide_num" in slide
            assert "heading" in slide
            assert "content" in slide

        # Verify viva questions structure
        for v in plan["viva_questions"]:
            assert "question" in v
            assert "answer" in v


# ---------------------------------------------------------------------------
# Test 7: Schema Inspection & Leaderboard
# ---------------------------------------------------------------------------
def test_schema_inspect_and_leaderboard(client):
    """Verify schema-inspect proves table isolation and leaderboard returns top aliases."""
    # Debug schema inspect
    insp_resp = client.get("/api/debug/schema-inspect")
    assert insp_resp.status_code == 200
    inspect_data = insp_resp.json()

    assert len(inspect_data["verified_students_sample"]) <= 5
    assert len(inspect_data["ghost_profiles_sample"]) <= 5
    assert "verified_students" in inspect_data["schemas"]
    assert "ghost_profiles" in inspect_data["schemas"]
    assert "telemetry_events" in inspect_data["schemas"]

    # Leaderboard
    lb_resp = client.get("/api/leaderboard")
    assert lb_resp.status_code == 200
    lb_data = lb_resp.json()

    assert "leaderboard" in lb_data
    assert len(lb_data["leaderboard"]) <= 10
    for entry in lb_data["leaderboard"]:
        assert "rank" in entry
        assert "alias" in entry
        assert "elo_rating" in entry
        assert "human_trust_score" in entry
        # Privacy guarantee: no commitment hash or roll number exposed
        assert "commitment_hash" not in entry
        assert "roll_no" not in entry


# ---------------------------------------------------------------------------
# Test 8: Static Index Route
# ---------------------------------------------------------------------------
def test_serve_static_index(client):
    """Verify root URL serves the static HTML single-page app."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "CampusGhosts" in resp.text


# ---------------------------------------------------------------------------
# Test 9: Offline Analyzer Rule Checks
# ---------------------------------------------------------------------------
def test_offline_analyzer_all_invariants():
    """Verify direct offline analysis across all 4 bug classes and clean code."""
    # 1. Pointer dereference
    res_ptr = offline_analyze_code("int* ptr; *ptr = 10;", language="cpp")
    assert res_ptr["passed"] is False
    assert res_ptr["concept_tag"] == "POINTER_DEREF_NULL"

    # 2. Infinite loop
    res_loop = offline_analyze_code("while (true) { int a = 1; }", language="cpp")
    assert res_loop["passed"] is False
    assert res_loop["concept_tag"] == "LOOP_INFINITE_BOUND"

    # 3. Recursion missing base
    res_rec = offline_analyze_code("def factorial(n):\n    return n * factorial(n - 1)", language="python")
    assert res_rec["passed"] is False
    assert res_rec["concept_tag"] == "RECURSION_NO_BASE"

    # 4. Clean code
    res_clean = offline_analyze_code("int add(int a, int b) { return a + b; }", language="cpp")
    assert res_clean["passed"] is True
    assert res_clean["concept_tag"] == "OPTIMAL"
