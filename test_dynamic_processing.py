"""
test_dynamic_processing.py - End-to-end tests for dynamic logical processing and multi-problem verification.

Guarantees:
1. Validates /api/problems endpoint returns full problem catalog.
2. Verifies Python AST syntax errors are dynamically caught with SYNTAX_ERROR.
3. Verifies Python logic errors that fail test cases produce LOGIC_INCORRECT (no fake passing).
4. Verifies Python passing solutions produce OPTIMAL with measured execution metrics.
5. Verifies C++ test case evaluation catches logic discrepancies with LOGIC_INCORRECT.
6. Verifies remedial generation produces tailored 5-slide plans for all concepts including SYNTAX_ERROR and LOGIC_INCORRECT.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from ai_engine import offline_analyze_code, generate_remedial_plan
from db import init_and_seed_db


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_dynamic.db")
    monkeypatch.setenv("CAMPUSGHOSTS_DB", test_db)
    init_and_seed_db(test_db)


@pytest.fixture
def client():
    return TestClient(app)


def test_api_problems_catalog(client):
    """Verify /api/problems returns structured catalog with starter codes and test specs."""
    resp = client.get("/api/problems")
    assert resp.status_code == 200
    data = resp.json()
    assert "problems" in data
    assert len(data["problems"]) >= 5

    problem_ids = {p["id"] for p in data["problems"]}
    assert "arr-bound" in problem_ids
    assert "ptr-swap" in problem_ids
    assert "loop-converge" in problem_ids
    assert "rec-fact" in problem_ids
    assert "str-palindrome" in problem_ids

    for p in data["problems"]:
        assert "starter_code" in p
        assert "cpp" in p["starter_code"]
        assert "python" in p["starter_code"]
        assert "description" in p


def test_python_syntax_error_detection():
    """Verify Python syntax errors are caught dynamically and not marked OPTIMAL."""
    bad_code = "def broken(arr:\n    return arr["
    diag = offline_analyze_code(bad_code, language="python", problem_id="arr-bound")

    assert diag["passed"] is False
    assert diag["concept_tag"] == "SYNTAX_ERROR"
    assert diag["severity"] == "CRITICAL"
    assert "Syntax Error" in diag["socratic_hint"]


def test_python_logic_error_detection():
    """Verify code that compiles but produces wrong output is flagged as LOGIC_INCORRECT."""
    wrong_code = """
def sum_array_elements(arr: list[int]) -> int:
    return 0  # Wrong answer for non-empty arrays
"""
    diag = offline_analyze_code(wrong_code, language="python", problem_id="arr-bound")

    assert diag["passed"] is False
    assert diag["concept_tag"] == "LOGIC_INCORRECT"
    assert diag["severity"] == "MEDIUM"
    assert "Logic failure on test case" in diag["socratic_hint"]


def test_python_optimal_solution():
    """Verify correct Python code passes all test cases and is marked OPTIMAL."""
    correct_code = """
def sum_array_elements(arr: list[int]) -> int:
    total = 0
    for x in arr:
        total += x
    return total
"""
    diag = offline_analyze_code(correct_code, language="python", problem_id="arr-bound")

    assert diag["passed"] is True
    assert diag["concept_tag"] == "OPTIMAL"
    assert diag["severity"] == "LOW"
    assert diag["est_time_ms"] >= 0


def test_cpp_wrong_logic_detection():
    """Verify C++ code returning wrong value is caught as LOGIC_INCORRECT."""
    c_code = """
#include <vector>
int sumArrayElements(const std::vector<int>& arr) {
    return 0; // Wrong logic
}
"""
    diag = offline_analyze_code(c_code, language="cpp", problem_id="arr-bound")

    assert diag["passed"] is False
    assert diag["concept_tag"] == "LOGIC_INCORRECT"


def test_remedial_plan_dynamic_concepts():
    """Verify remedial generation produces tailored 5-slide plans for new concept tags."""
    for tag in ("SYNTAX_ERROR", "LOGIC_INCORRECT", "ARRAY_OUT_OF_BOUNDS", "POINTER_DEREF_NULL"):
        plan = generate_remedial_plan(tag, ghost_count=3)
        assert len(plan["slides"]) == 5
        assert len(plan["viva_questions"]) == 3
        assert plan["title"]


def test_debug_schema_inspect_foreign_keys(client):
    """Verify schema inspection confirms zero foreign keys across all isolated tables."""
    resp = client.get("/api/debug/schema-inspect")
    assert resp.status_code == 200
    data = resp.json()

    assert data["zero_foreign_keys_verified"] is True
    assert "foreign_keys" in data
    for table, fks in data["foreign_keys"].items():
        assert len(fks) == 0, f"Expected 0 foreign keys in {table}, found: {fks}"


def test_claim_verify_hmac_signature(client):
    """Verify placement claim returns valid institutional HMAC-SHA256 signature token."""
    commit_resp = client.post("/api/auth/commit", json={"roll_no": "2601019911", "secret_salt": "hmac_secret_2026"})
    assert commit_resp.status_code == 200

    claim_resp = client.post("/api/claim/verify", json={"roll_no": "2601019911", "secret_salt": "hmac_secret_2026"})
    assert claim_resp.status_code == 200
    res = claim_resp.json()

    assert res["verified"] is True
    assert "signed_proof_hash" in res
    assert "hmac_signature" in res
    assert len(res["hmac_signature"]) == 64


def test_matchmake_against_institutional_ghosts(client):
    """Verify real-time matchmaking against institutional ghost profiles."""
    commit_resp = client.post("/api/auth/commit", json={"roll_no": "2601018888", "secret_salt": "matchmake_salt_2026"})
    assert commit_resp.status_code == 200
    student_hash = commit_resp.json()["commitment_hash"]

    mm_resp = client.post("/api/duel/matchmake", json={
        "commitment_hash": student_hash,
        "problem_id": "arr-bound",
        "language": "python",
    })
    assert mm_resp.status_code == 200
    data = mm_resp.json()

    assert "match_id" in data
    assert data["match_id"].startswith("match_")
    assert data["round_duration_sec"] == 180

    # Student info verified
    assert data["student"]["alias"].startswith("Cipher_")
    assert data["student"]["elo"] == 1200

    # Real rival verified from institutional ghost profiles
    rival = data["rival"]
    assert rival["alias"].startswith("Ghost_") or rival["alias"].startswith("Cipher_")
    assert rival["alias"] != data["student"]["alias"]
    assert 900 <= rival["elo"] <= 1600
    assert rival["target_time_sec"] > 0
    assert rival["cps"] >= 16


def test_matchmake_unauthorized_student(client):
    """Verify 404 when non-existent commitment hash requests matchmaking."""
    fake_hash = "f" * 64
    mm_resp = client.post("/api/duel/matchmake", json={"commitment_hash": fake_hash})
    assert mm_resp.status_code == 404


def test_duel_submission_victory_match_summary(client):
    """Verify duel submission calculates victory when student passes and beats rival."""
    commit_resp = client.post("/api/auth/commit", json={"roll_no": "2601017771", "secret_salt": "victory_salt_2026"})
    student_hash = commit_resp.json()["commitment_hash"]

    correct_python = """
def sum_array_elements(arr: list[int]) -> int:
    return sum(arr)
"""
    sub_resp = client.post("/api/duel/submit", json={
        "commitment_hash": student_hash,
        "code": correct_python,
        "language": "python",
        "problem_id": "arr-bound",
        "match_id": "match_test_vic",
        "rival_alias": "Cipher_09",
        "opponent_elo": 1250,
        "elapsed_time_sec": 38.5,
        "rival_finished": False,
    })
    assert sub_resp.status_code == 200
    res = sub_resp.json()

    assert "match_summary" in res
    summary = res["match_summary"]
    assert summary["outcome"] == "VICTORY"
    assert summary["passed"] is True
    assert summary["student_time_sec"] == 38.5
    assert summary["rival_alias"] == "Cipher_09"
    assert res["elo_delta"] > 0
    assert res["new_elo"] > 1200


def test_duel_submission_defeat_match_summary(client):
    """Verify duel submission calculates defeat when student code fails invariant."""
    commit_resp = client.post("/api/auth/commit", json={"roll_no": "2601017772", "secret_salt": "defeat_salt_2026"})
    student_hash = commit_resp.json()["commitment_hash"]

    buggy_python = """
def sum_array_elements(arr: list[int]) -> int:
    return arr[len(arr) + 1]
"""
    sub_resp = client.post("/api/duel/submit", json={
        "commitment_hash": student_hash,
        "code": buggy_python,
        "language": "python",
        "problem_id": "arr-bound",
        "match_id": "match_test_def",
        "rival_alias": "Cipher_14",
        "opponent_elo": 1220,
        "elapsed_time_sec": 65.0,
        "rival_finished": True,
    })
    assert sub_resp.status_code == 200
    res = sub_resp.json()

    assert "match_summary" in res
    summary = res["match_summary"]
    assert summary["outcome"] == "DEFEAT"
    assert summary["passed"] is False
    assert res["elo_delta"] < 0
    assert res["new_elo"] < 1200


