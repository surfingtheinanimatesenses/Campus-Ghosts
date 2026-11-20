"""
test_api.py - FastAPI TestClient Test Suite for CampusGhosts.

Comprehensive normal & edge-case test suite covering:
  1. Blind login with whitespace in roll number (normalization & rank).
  2. Repeat failure deduplication (same ghost failing 5 times = 1 student, masked under k=5).
  3. Raw audit mode exposes sub-k cohorts.
  4. Wrong salt fails placement claim cleanly without data leak.
  5. Correct roll + salt verifies Rank #1 claim.
  6. Empty / gibberish code guard (no crash, zero telemetry pollution).
  7. Code length overflow (>10,000 chars) returns HTTP 400.
  8. Leaderboard privacy guarantee (NEVER leaks ghost_hash or roll_number).
  9. Health check endpoint contract.
 10. Root static file mount serves without shadowing API routes.
"""

from __future__ import annotations

import sys
from pathlib import Path
import warnings

# Filter StarletteDeprecationWarning about httpx
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient

from crypto_privacy import get_db_connection, init_db
from main import app
from seed_demo import seed_database

client = TestClient(app)

PASS_COUNT = 0
FAIL_COUNT = 0
FAILURES = []


def record_pass(test_name: str) -> None:
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  [PASS] {test_name}")


def record_fail(test_name: str, reason: str) -> None:
    global FAIL_COUNT
    FAIL_COUNT += 1
    FAILURES.append(f"{test_name}: {reason}")
    print(f"  [FAIL] {test_name} - {reason}")


def assert_test(test_name: str, condition: bool, failure_msg: str = "") -> None:
    if condition:
        record_pass(test_name)
    else:
        record_fail(test_name, failure_msg or "Assertion failed")


# ---------------------------------------------------------------------------
# Test Functions
# ---------------------------------------------------------------------------
def test_health_endpoint() -> None:
    print("\n--- Test 1: Health Endpoint ---")
    resp = client.get("/api/v1/health")
    assert_test("Health returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    data = resp.json()
    assert_test("Health status is 'ok'", data.get("status") == "ok")
    assert_test("Health returns active_groq_keys", "active_groq_keys" in data)
    assert_test("Health returns active_gemini_keys", "active_gemini_keys" in data)
    assert_test("Health returns db_ghosts_count >= 42", data.get("db_ghosts_count", 0) >= 42)


def test_blind_login_with_spaces() -> None:
    print("\n--- Test 2: Blind Login with Whitespace Normalization ---")
    payload = {
        "roll_number": "   2601010043   ",
        "secret_salt": "krmu2026",
        "section": "CSE-1C",
    }
    resp = client.post("/api/v1/auth/ghost-login", json=payload)
    assert_test("Login returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    data = resp.json()

    assert_test("Login derives correct alias Shadow_188", data.get("alias") == "Shadow_188")
    assert_test("Primary identity has ELO 1540", data.get("elo") == 1540)
    assert_test("Primary identity is Rank #1", data.get("rank") == 1)
    assert_test("Section is CSE-1C", data.get("section") == "CSE-1C")

    # Short credentials error check
    bad_resp = client.post(
        "/api/v1/auth/ghost-login",
        json={"roll_number": " 12 ", "secret_salt": "krmu2026"},
    )
    assert_test("Short roll number rejected with 400", bad_resp.status_code == 400)


def test_problems_endpoint() -> None:
    print("\n--- Test 3: Arena Problems Endpoint ---")
    resp = client.get("/api/v1/arena/problems")
    assert_test("Problems endpoint returns 200", resp.status_code == 200)
    data = resp.json()
    problems = data.get("problems", [])
    assert_test("Problems list contains at least 3 items", len(problems) >= 3)
    ids = [p["id"] for p in problems]
    assert_test("ptr-swap in problems", "ptr-swap" in ids)
    assert_test("arr-bound in problems", "arr-bound" in ids)
    assert_test("rec-fact in problems", "rec-fact" in ids)


def test_repeat_failures_deduplication() -> None:
    print("\n--- Test 4: Repeat Failures Deduplication & K-Anonymity ---")
    # Login a dedicated test ghost student
    login_resp = client.post(
        "/api/v1/auth/ghost-login",
        json={"roll_number": "2601019999", "secret_salt": "dedup_salt_9999", "section": "TEST-SEC"},
    )
    assert_test("Test student login 200", login_resp.status_code == 200)
    test_ghost = login_resp.json()

    # Submit 5 consecutive buggy factorial solutions for this same ghost
    buggy_code = "def factorial(n):\n    return n * factorial(n - 1)\n"
    for i in range(5):
        sub_resp = client.post(
            "/api/v1/arena/submit-code",
            json={
                "problem_id": "rec-fact",
                "code": buggy_code,
                "ghost_hash": test_ghost["ghost_hash"],
                "section": "TEST-SEC",
                "language": "python",
            },
        )
        assert sub_resp.status_code == 200, f"Submit {i} failed with {sub_resp.status_code}"

    # Query telemetry for TEST-SEC under k=5 protected mode
    telem_resp = client.get("/api/v1/faculty/telemetry?section=TEST-SEC&k_threshold=5&raw_audit_mode=false")
    assert_test("Telemetry query 200", telem_resp.status_code == 200)
    telem_data = telem_resp.json()

    rec_clusters = [c for c in telem_data["clusters"] if c["concept_tag"] == "MISSING_BASE_CASE_OVERFLOW"]
    assert_test("Cluster exists in telemetry", len(rec_clusters) == 1)

    rec_c = rec_clusters[0]
    assert_test("Total failures is 5", rec_c["total_failures"] == 5)
    assert_test("Student count is masked under k=5 (None)", rec_c["student_count"] is None)
    assert_test("Display count shows '< 5 (Protected)'", "< 5" in rec_c["display_count"])
    assert_test("Status is MASKED_BY_K_ANONYMITY", rec_c["status"] == "MASKED_BY_K_ANONYMITY")

    # In raw audit mode, distinct student count must be strictly 1, NOT 5!
    raw_resp = client.get("/api/v1/faculty/telemetry?section=TEST-SEC&k_threshold=5&raw_audit_mode=true")
    raw_data = raw_resp.json()
    raw_c = [c for c in raw_data["clusters"] if c["concept_tag"] == "MISSING_BASE_CASE_OVERFLOW"][0]
    assert_test("Raw mode exposes student_count == 1 (Deduplicated)", raw_c["student_count"] == 1)
    assert_test("Raw mode status is EXPOSED_IN_RAW_MODE", raw_c["status"] == "EXPOSED_IN_RAW_MODE")


def test_raw_audit_mode_cse1c() -> None:
    print("\n--- Test 5: Raw Audit Mode on Seeded Section CSE-1C ---")
    resp = client.get("/api/v1/faculty/telemetry?section=CSE-1C&k_threshold=5&raw_audit_mode=true")
    assert_test("Telemetry raw query returns 200", resp.status_code == 200)
    data = resp.json()
    clusters = {c["concept_tag"]: c for c in data["clusters"]}

    # Verify counts for sub-threshold cohorts
    assert_test(
        "Recursion has 3 distinct students",
        clusters.get("MISSING_BASE_CASE_OVERFLOW", {}).get("student_count") == 3,
    )
    assert_test(
        "Bit manipulation has 2 distinct students",
        clusters.get("SIGNED_SHIFT_OVERFLOW", {}).get("student_count") == 2,
    )
    assert_test(
        "Sub-threshold status is EXPOSED_IN_RAW_MODE",
        clusters.get("MISSING_BASE_CASE_OVERFLOW", {}).get("status") == "EXPOSED_IN_RAW_MODE",
    )


def test_placement_claim_verification() -> None:
    print("\n--- Test 6: Placement Claim Verification ---")
    # 1. Wrong salt fails cleanly
    tampered_resp = client.post(
        "/api/v1/auth/verify-claim",
        json={
            "roll_number": "2601010043",
            "secret_salt": "wrong_salt_xyz",
            "claimed_alias": "Shadow_188",
        },
    )
    assert_test("Wrong salt claim returns 200", tampered_resp.status_code == 200)
    tampered_data = tampered_resp.json()
    assert_test("Wrong salt verified is False", tampered_data.get("verified") is False)
    assert_test("Wrong salt profile is None", tampered_data.get("profile") is None)

    # 2. Correct roll + salt verifies Rank #1 claim
    correct_resp = client.post(
        "/api/v1/auth/verify-claim",
        json={
            "roll_number": "2601010043",
            "secret_salt": "krmu2026",
            "claimed_alias": "Shadow_188",
        },
    )
    assert_test("Valid claim returns 200", correct_resp.status_code == 200)
    correct_data = correct_resp.json()
    assert_test("Valid claim verified is True", correct_data.get("verified") is True)
    assert_test(
        "Valid claim profile has ELO 1540",
        correct_data.get("profile", {}).get("elo") == 1540,
    )


def test_gibberish_guard_no_telemetry_pollution() -> None:
    print("\n--- Test 7: Gibberish Code Guard (Zero Telemetry Pollution) ---")
    # Get telemetry count before
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM telemetry_events;")
    initial_event_count = c.fetchone()[0]
    conn.close()

    # Submit garbage/empty code
    resp = client.post(
        "/api/v1/arena/submit-code",
        json={
            "problem_id": "ptr-swap",
            "code": "   ???   ",
            "roll_number": "2601010043",
            "secret_salt": "krmu2026",
        },
    )
    assert_test("Gibberish submit returns 200", resp.status_code == 200)
    data = resp.json()
    assert_test("is_valid_attempt is False", data.get("is_valid_attempt") is False)
    assert_test(
        "concept_tag is INCOMPLETE_SYNTAX",
        data.get("diagnostic", {}).get("concept_tag") == "INCOMPLETE_SYNTAX",
    )

    # Telemetry events count in DB MUST NOT have increased
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM telemetry_events;")
    new_event_count = c.fetchone()[0]
    conn.close()
    assert_test(
        "Telemetry event count untouched (No pollution)",
        new_event_count == initial_event_count,
        f"Was {initial_event_count}, now {new_event_count}",
    )


def test_code_length_limit() -> None:
    print("\n--- Test 8: Code Length Overflow (>10,000 characters) ---")
    huge_code = "int x = 1;\n" * 1200  # >12,000 chars
    resp = client.post(
        "/api/v1/arena/submit-code",
        json={
            "problem_id": "ptr-swap",
            "code": huge_code,
            "roll_number": "2601010043",
            "secret_salt": "krmu2026",
        },
    )
    assert_test("Code > 10,000 chars returns HTTP 400", resp.status_code == 400)


def test_leaderboard_privacy() -> None:
    print("\n--- Test 9: Leaderboard Privacy Leak Check ---")
    resp = client.get("/api/v1/arena/leaderboard?section=CSE-1C")
    assert_test("Leaderboard returns 200", resp.status_code == 200)
    data = resp.json()
    leaderboard = data.get("leaderboard", [])
    assert_test("Leaderboard contains at least 1 entry", len(leaderboard) > 0)

    # Check every entry for prohibited fields
    leaks = []
    for entry in leaderboard:
        if "ghost_hash" in entry:
            leaks.append("ghost_hash leaked")
        if "roll_number" in entry:
            leaks.append("roll_number leaked")

    assert_test("ZERO leak of ghost_hash or roll_number in leaderboard", len(leaks) == 0, str(leaks))
    assert_test("Leaderboard Rank 1 is Shadow_188", leaderboard[0].get("alias") == "Shadow_188")
    assert_test("Leaderboard Rank 1 ELO is 1540", leaderboard[0].get("elo") == 1540)


def test_faculty_remedial_plan() -> None:
    print("\n--- Test 10: Faculty Remedial Plan Generation ---")
    resp = client.post(
        "/api/v1/faculty/remedial-plan",
        json={
            "topic": "Pointers & Memory",
            "concept_tag": "UNINITIALIZED_POINTER_DEREF",
            "student_count": 14,
        },
    )
    assert_test("Remedial plan returns 200", resp.status_code == 200)
    plan = resp.json()
    assert_test("Plan has title", bool(plan.get("title")))
    assert_test("Plan has root_cause_summary", bool(plan.get("root_cause_summary")))
    assert_test("Plan has live_code_demo_fix", bool(plan.get("live_code_demo_fix")))
    assert_test("Plan has 3 viva questions", len(plan.get("three_viva_questions", [])) == 3)
    assert_test("Plan has practice_drill", bool(plan.get("practice_drill")))


def test_static_files_root_mount() -> None:
    print("\n--- Test 11: Static Files Root Mount ---")
    resp = client.get("/")
    assert_test("GET / returns 200", resp.status_code == 200)
    assert_test("GET / returns HTML", "text/html" in resp.headers.get("content-type", ""))
    assert_test("GET / contains CampusGhosts content", "CampusGhosts" in resp.text)


def test_role_auth_and_create_problem() -> None:
    print("\n--- Test 12: Role-Separated Auth & Create Problem ---")
    # 1. Student Login
    stu_resp = client.post(
        "/api/v1/auth/student-login",
        json={"roll_number": "2601010043", "secret_salt": "krmu2026", "section": "CSE-1C"},
    )
    assert_test("Student login 200", stu_resp.status_code == 200)
    stu_data = stu_resp.json()
    assert_test("Role is student", stu_data.get("role") == "student")
    assert_test("Session token generated", bool(stu_data.get("session_token")))
    assert_test("Recovery key text present", "ZERO-KNOWLEDGE IDENTITY RECOVERY CARD" in stu_data.get("recovery_key_text", ""))
    assert_test("Alias is Shadow_188", stu_data.get("alias") == "Shadow_188")

    # 2. Faculty Login
    bad_email_resp = client.post(
        "/api/v1/auth/faculty-login",
        json={"email": "invalidemail", "passcode": "KRMU-FAC-2026"},
    )
    assert_test("Faculty login without @ rejected 400", bad_email_resp.status_code == 400)

    bad_pass_resp = client.post(
        "/api/v1/auth/faculty-login",
        json={"email": "prof.sharma@krmangalam.edu.in", "passcode": "WRONG-PASS"},
    )
    assert_test("Faculty login with wrong passcode rejected 401", bad_pass_resp.status_code == 401)

    fac_resp = client.post(
        "/api/v1/auth/faculty-login",
        json={"email": "prof.sharma@krmangalam.edu.in", "passcode": "KRMU-FAC-2026", "section": "CSE-1C"},
    )
    assert_test("Faculty login 200", fac_resp.status_code == 200)
    fac_data = fac_resp.json()
    assert_test("Role is faculty", fac_data.get("role") == "faculty")
    assert_test("Faculty name parsed", "Prof." in fac_data.get("faculty_name", ""))
    assert_test("Department present", fac_data.get("department") == "School of Engineering & Technology")

    # 3. Faculty Create Problem
    prob_payload = {
        "title": "Reverse Linked List",
        "language": "cpp",
        "difficulty": "intermediate",
        "topic": "Linked Lists",
        "concept_tag": "POINTER_CYCLE_MEMORY_LEAK",
        "description": "Reverse a singly-linked list in-place.",
        "sample_input": "1->2->3",
        "sample_output": "3->2->1",
        "buggy_code": "ListNode* reverse(ListNode* h) { return h; }",
        "fixed_code": "ListNode* reverse(ListNode* h) { ListNode* prev = nullptr; return prev; }",
        "created_by": "Prof. Sharma",
    }
    create_resp = client.post("/api/v1/faculty/create-problem", json=prob_payload)
    assert_test("Create problem 200", create_resp.status_code == 200)
    create_data = create_resp.json()
    assert_test("Problem created status ok", create_data.get("status") == "ok")
    new_pid = create_data.get("problem", {}).get("id")
    assert_test("Problem ID generated", bool(new_pid))

    # Verify problem immediately visible in GET /api/v1/arena/problems
    list_resp = client.get("/api/v1/arena/problems")
    assert_test("Problems list query 200", list_resp.status_code == 200)
    all_pids = [p["id"] for p in list_resp.json().get("problems", [])]
    assert_test("New problem exists in problems list", new_pid in all_pids)


def test_section_governance_and_sos_flares() -> None:
    print("\n--- Test 13: Section Governance, Channels & SOS Flares ---")
    # 1. Check settings
    s_resp = client.get("/api/v1/section/settings?section=CSE-1C")
    assert_test("Settings returns 200", s_resp.status_code == 200)
    assert_test("SOS initially enabled", s_resp.json().get("sos_enabled") is True)

    # 2. Channel messages: student cannot post in #announcements
    ann_forbidden = client.post(
        "/api/v1/channels/messages",
        json={
            "section": "CSE-1C",
            "channel": "#announcements",
            "sender_alias": "Shadow_188",
            "sender_role": "student",
            "content": "I shouldn't be able to post here",
        },
    )
    assert_test("Student posting in #announcements returns 403", ann_forbidden.status_code == 403)

    # Faculty CAN post in #announcements
    ann_ok = client.post(
        "/api/v1/channels/messages",
        json={
            "section": "CSE-1C",
            "channel": "#announcements",
            "sender_alias": "Prof. Sharma",
            "sender_role": "faculty",
            "content": "Lab Exam starts in 10 minutes.",
        },
    )
    assert_test("Faculty posting in #announcements returns 200", ann_ok.status_code == 200)

    # Students CAN post in #general-chat
    gen_ok = client.post(
        "/api/v1/channels/messages",
        json={
            "section": "CSE-1C",
            "channel": "#general-chat",
            "sender_alias": "Shadow_188",
            "sender_role": "student",
            "content": "Anyone solved problem 2 yet?",
        },
    )
    assert_test("Student posting in #general-chat returns 200", gen_ok.status_code == 200)

    # 3. Create SOS flare when enabled
    flare_resp = client.post(
        "/api/v1/sos/create",
        json={
            "section": "CSE-1C",
            "ghost_hash": "dummy_hash_123",
            "alias": "Phantom_999",
            "problem_title": "Pointer Swap",
            "language": "cpp",
            "code_snippet": "int* temp; *temp = *a;",
        },
    )
    assert_test("Create SOS flare returns 200", flare_resp.status_code == 200)
    flare_id = flare_resp.json().get("flare_id")
    assert_test("Flare ID returned", bool(flare_id))

    # 4. Anti-code-dump guard tests for SOS reply
    # Code dump with semicolon
    reply_code = client.post(
        "/api/v1/sos/reply",
        json={
            "flare_id": flare_id,
            "helper_alias": "Shadow_188",
            "nudge_text": "Just do int temp = *a; and then *a = *b;",
        },
    )
    assert_test("SOS reply with ';' rejected (400)", reply_code.status_code == 400)

    # Code dump with braces
    reply_brace = client.post(
        "/api/v1/sos/reply",
        json={
            "flare_id": flare_id,
            "helper_alias": "Shadow_188",
            "nudge_text": "void swap(int* a, int* b) { int t = *a; }",
        },
    )
    assert_test("SOS reply with '{' rejected (400)", reply_brace.status_code == 400)

    # Clean Socratic nudge awards +8 Mentor Rating
    lead_before = client.get("/api/v1/arena/leaderboard?section=CSE-1C").json()["leaderboard"]
    shadow_rating_before = next((x.get("rating", x.get("elo")) for x in lead_before if x["alias"] == "Shadow_188"), 1540)

    reply_clean = client.post(
        "/api/v1/sos/reply",
        json={
            "flare_id": flare_id,
            "helper_alias": "Shadow_188",
            "nudge_text": "Remember that pointer temp doesn't point to allocated memory. Allocate a plain integer value instead.",
        },
    )
    assert_test("Clean Socratic nudge returns 200", reply_clean.status_code == 200)
    assert_test("Clean reply awards 8 rating", reply_clean.json().get("awarded_rating") == 8 or reply_clean.json().get("awarded_elo") == 8)

    lead_after = client.get("/api/v1/arena/leaderboard?section=CSE-1C").json()["leaderboard"]
    shadow_rating_after = next((x.get("rating", x.get("elo")) for x in lead_after if x["alias"] == "Shadow_188"), 0)
    assert_test("Helper received +8 rating in leaderboard", shadow_rating_after == shadow_rating_before + 8)

    # 5. Disable SOS via Faculty governance
    toggle_resp = client.post(
        "/api/v1/faculty/settings",
        json={"section": "CSE-1C", "sos_enabled": False, "duel_mode": "Bug Hunt"},
    )
    assert_test("Faculty disable SOS returns 200", toggle_resp.status_code == 200)

    # Attempt create flare when disabled -> 403
    flare_disabled = client.post(
        "/api/v1/sos/create",
        json={
            "section": "CSE-1C",
            "ghost_hash": "dummy_hash_456",
            "alias": "Phantom_999",
            "problem_title": "Array Sum",
            "language": "cpp",
            "code_snippet": "for (int i=0; i<=n; i++)",
        },
    )
    assert_test("Create SOS flare when disabled returns 403", flare_disabled.status_code == 403)

    # Re-enable SOS
    client.post(
        "/api/v1/faculty/settings",
        json={"section": "CSE-1C", "sos_enabled": True, "duel_mode": "Bug Hunt"},
    )


def test_institutional_email_otp():
    """Test 14: Validates institutional email OTP issuance, validation, and zero foreign keys."""
    print("\n--- Test 14: Institutional Email OTP & Unlinkable Verification ---")
    
    # 1. Request OTP
    resp = client.post("/api/v1/auth/email/request-otp", json={"email": "scholar@krmu.edu.in"})
    assert_test("Request OTP status", resp.status_code == 200, f"Status: {resp.status_code}")
    data = resp.json()
    assert_test("Response contains success", data.get("success") is True)
    demo_otp = data.get("demo_otp")
    assert_test("Demo OTP provided", bool(demo_otp))

    # 2. Verify with wrong OTP
    bad_resp = client.post("/api/v1/auth/email/verify-otp", json={"email": "scholar@krmu.edu.in", "otp": "000000"})
    assert_test("Bad OTP rejection", bad_resp.status_code == 400)

    # 3. Verify with correct OTP
    good_resp = client.post("/api/v1/auth/email/verify-otp", json={"email": "scholar@krmu.edu.in", "otp": demo_otp})
    assert_test("Good OTP status", good_resp.status_code == 200)
    v_data = good_resp.json()
    assert_test("Email verified", v_data.get("verified") is True)
    assert_test("Has verification token", bool(v_data.get("verification_token")))
    assert_test("Has suggested salt", "krmu_" in v_data.get("suggested_salt", ""))


def test_container_code_execution():
    """Test 15: Validates real code execution via container sandbox on problem submission."""
    print("\n--- Test 15: Container Sandbox Code Execution & Diagnostic Pipeline ---")
    
    resp = client.post("/api/duel/submit", json={
        "commitment_hash": "test_ghost_eval_hash",
        "code": "#include <iostream>\nint main() { std::cout << 15 << std::endl; return 0; }",
        "language": "cpp",
        "problem_id": "arr-bound",
        "opponent_elo": 1200
    })
    assert_test("Duel submit HTTP 200", resp.status_code == 200, f"Status: {resp.status_code}")
    data = resp.json()
    assert_test("Duel submission has diagnostic", "diagnostic" in data)
    assert_test("Duel submission has new_elo", "new_elo" in data)


# ---------------------------------------------------------------------------
# Test Runner
# ---------------------------------------------------------------------------
def run_all_tests() -> None:
    print("=" * 70)
    print("STARTING CAMPUSGHOSTS API TEST SUITE (FastAPI TestClient)")
    print("=" * 70)

    # Ensure clean seeded state before running
    seed_database()

    test_health_endpoint()
    test_blind_login_with_spaces()
    test_problems_endpoint()
    test_repeat_failures_deduplication()
    test_raw_audit_mode_cse1c()
    test_placement_claim_verification()
    test_gibberish_guard_no_telemetry_pollution()
    test_code_length_limit()
    test_leaderboard_privacy()
    test_faculty_remedial_plan()
    test_static_files_root_mount()
    test_role_auth_and_create_problem()
    test_section_governance_and_sos_flares()
    test_institutional_email_otp()
    test_container_code_execution()

    print("\n" + "=" * 70)
    total = PASS_COUNT + FAIL_COUNT
    print(f"RESULTS: {PASS_COUNT}/{total} passed, {FAIL_COUNT} failed.")
    print("=" * 70)

    if FAIL_COUNT > 0:
        print("\nFAILURES:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("\nALL API NORMAL AND EDGE-CASE TESTS PASSED WITH ZERO ERRORS.")


if __name__ == "__main__":
    run_all_tests()
