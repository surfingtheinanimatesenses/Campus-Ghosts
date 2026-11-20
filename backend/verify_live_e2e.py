"""
verify_live_e2e.py — End-to-End Live System Verification against Running Server
Tests the full lifecycle: Frontend Assets -> Auth -> AntiCheat Ingestion -> Sandbox Execution ->
Database Persistence -> ELO & Trust Score Rendering -> Faculty Remedials -> SOS Socratic Mentorship.
"""

import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def request(endpoint, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{endpoint}"
    req_body = None
    if data is not None:
        req_body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            status = resp.status
            try:
                return status, json.loads(content)
            except Exception:
                return status, content
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, content

PASS = 0
FAIL = 0

def test(name, cond, info=""):
    global PASS, FAIL
    if cond:
        print(f"  [PASS] {name}")
        PASS += 1
    else:
        print(f"  [FAIL] {name} - {info}")
        FAIL += 1

print("=" * 70)
print("CAMPUSGHOSTS LIVE END-TO-END SYSTEM VERIFICATION")
print("=" * 70)

# 1. Assets Check
print("\n--- Phase 1: Static Assets & JavaScript Mounting ---")
s, html = request("/")
test("Root page / returns 200", s == 200)
test("HTML contains subview-student-arena", "subview-student-arena" in html)
test("HTML contains student-lockout-overlay", "student-lockout-overlay" in html)
test("HTML contains student-trust-badge", "student-trust-badge" in html)

s, guard_js = request("/guard.js")
test("guard.js loads 200", s == 200)
test("guard.js exports AntiCheatGuard", "export class AntiCheatGuard" in guard_js)
test("guard.js includes acceleration and deceleration tracking", "accelerationSamples" in guard_js and "decelerationSamples" in guard_js)

s, app_js = request("/app.js")
test("app.js loads 200", s == 200)
test("app.js initializes AntiCheatGuard", "setupAppGuard" in app_js)
test("app.js submits human_trust_score", "human_trust_score:" in app_js)

s, duel_js = request("/split_duel.js")
test("split_duel.js loads 200", s == 200)
test("split_duel.js handles dual-schema schema-inspect", "roll_no || s.roll_number" in duel_js)

# 2. Student Auth
print("\n--- Phase 2: Cryptographic Student Authentication ---")
s, auth_data = request("/api/v1/auth/student-login", method="POST", data={
    "roll_number": "2601010043",
    "secret_salt": "krmu2026",
    "section": "CSE-1C"
})
test("Student login returns 200", s == 200, f"status: {s}")
test("Student role is student", auth_data.get("role") == "student")
alias = auth_data.get("alias")
test("Student alias is Shadow_188", alias == "Shadow_188", f"got: {alias}")
ghost_hash = auth_data.get("ghost_hash")
test("Ghost commitment hash generated", ghost_hash is not None and len(ghost_hash) == 64)

# 3. Problem Submission with Trust Score
print("\n--- Phase 3: AntiCheat Guard -> Submission -> Sandbox Execution ---")
solution_code = """#include <iostream>
using namespace std;

void swap(int* a, int* b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 5, y = 10;
    swap(&x, &y);
    cout << x << " " << y << endl;
    return 0;
}
"""
s, submit_res = request("/api/v1/arena/submit-code", method="POST", data={
    "problem_id": "ptr-swap",
    "code": solution_code,
    "language": "cpp",
    "roll_number": "2601010043",
    "secret_salt": "krmu2026",
    "section": "CSE-1C",
    "human_trust_score": 82.0
})
test("Submit code returns 200", s == 200, f"status: {s}")
diag = submit_res.get("diagnostic", submit_res)
test("Submission passed evaluation", diag.get("passed") is True, f"result: {submit_res}")
new_elo = submit_res.get("elo") or submit_res.get("rating") or submit_res.get("new_elo")
test("ELO rating updated", new_elo is not None and new_elo > 0)

# 4. Database Persistence & Leaderboard Rendering
print("\n--- Phase 4: Leaderboard Trust Score & ELO Persistence ---")
s, lb_data = request("/api/v1/arena/leaderboard?section=CSE-1C")
test("Leaderboard returns 200", s == 200)
students = lb_data.get("leaderboard", [])
test("Leaderboard contains students", len(students) > 0)
my_entry = next((item for item in students if item.get("alias") == "Shadow_188"), None)
test("Shadow_188 found in leaderboard", my_entry is not None)
if my_entry:
    lb_elo = my_entry.get("rating") or my_entry.get("elo") or my_entry.get("elo_rating")
    test("Leaderboard displays correct ELO", lb_elo == new_elo, f"expected {new_elo}, got {lb_elo}")
    test("Leaderboard displays persisted human_trust_score", my_entry.get("human_trust_score") is not None and 0 <= my_entry.get("human_trust_score") <= 100.0, f"got: {my_entry.get('human_trust_score')}")

# 5. Split Duel Submission
print("\n--- Phase 5: Split-Screen Duel Submission ---")
s, duel_res = request("/api/duel/submit", method="POST", data={
    "commitment_hash": ghost_hash,
    "problem_id": "ptr-swap",
    "code": solution_code,
    "language": "cpp",
    "opponent_elo": 1240,
    "human_trust_score": 75.0
})
test("Duel submit returns 200", s == 200, f"status: {s}")
test("Duel diagnostic present", "diagnostic" in duel_res)
test("Duel updated ELO returned", duel_res.get("new_elo") is not None)

# 6. Schema Inspect Compatibility
print("\n--- Phase 6: Dual-Schema Inspector Compatibility ---")
s, schema_res = request("/api/debug/schema-inspect")
test("Schema inspect returns 200", s == 200)
s_sample = schema_res.get("verified_students_sample", [{}])[0]
test("Student has roll_no AND roll_number", "roll_no" in s_sample and "roll_number" in s_sample)
g_sample = schema_res.get("ghost_profiles_sample", [{}])[0]
test("Ghost has commitment_hash AND ghost_hash", "commitment_hash" in g_sample and "ghost_hash" in g_sample)
test("Ghost has elo_rating AND rating", "elo_rating" in g_sample and "rating" in g_sample)

# 7. Faculty Telemetry & Remedial Plan
print("\n--- Phase 7: Faculty K-Anonymity & Remedial Engine ---")
s, faculty_auth = request("/api/v1/auth/faculty-login", method="POST", data={
    "email": "prof.sharma@krmangalam.edu.in",
    "passcode": "KRMU-FAC-2026",
    "section": "CSE-1C"
})
test("Faculty login returns 200", s == 200, f"status: {s}")

s, telem_masked = request("/api/v1/faculty/telemetry?section=CSE-1C&k_threshold=5&raw_audit_mode=false")
test("Faculty telemetry (k=5 masked) returns 200", s == 200)
s, telem_raw = request("/api/v1/faculty/telemetry?section=CSE-1C&k_threshold=5&raw_audit_mode=true")
test("Faculty telemetry (raw audit) returns 200", s == 200)

s, remedial = request("/api/v1/faculty/remedial-plan", method="POST", data={
    "concept_tag": "UNINITIALIZED_POINTER_DEREF",
    "topic": "Pointers & Memory",
    "affected_students": 3
})
test("Remedial plan returns 200", s == 200)
test("Remedial plan has title", "title" in remedial)
test("Remedial plan has live code fix", "live_code_demo_fix" in remedial)
test("Remedial plan has 3 viva questions", len(remedial.get("three_viva_questions", [])) == 3)

# 8. SOS Flare & Socratic Mentor Loop
print("\n--- Phase 8: SOS Flare & Socratic Nudge Feedback Loop ---")
s, flare = request("/api/v1/sos/create", method="POST", data={
    "section": "CSE-1C",
    "ghost_hash": ghost_hash,
    "alias": "Shadow_188",
    "problem_title": "Pointer Swap Challenge",
    "language": "cpp",
    "code_snippet": solution_code
})
test("Create SOS flare returns 200", s == 200, f"status: {s}")
flare_id = flare.get("flare_id")

# Socratic reply with forbidden code
s, bad_reply = request("/api/v1/sos/reply", method="POST", data={
    "flare_id": flare_id,
    "helper_alias": "Shadow_188",
    "nudge_text": "Just write int temp = *a; and then *a = *b;"
})
test("Direct code spoiler reply rejected with 400", s == 400)

# Clean Socratic nudge
s, good_reply = request("/api/v1/sos/reply", method="POST", data={
    "flare_id": flare_id,
    "helper_alias": "Shadow_188",
    "nudge_text": "Think about what happens to the values stored in memory before and after the swap."
})
test("Clean Socratic nudge accepted with 200", s == 200)
test("Helper awarded +8 mentor rating", good_reply.get("awarded_rating") == 8)

# 9. Placement Verification
print("\n--- Phase 9: Placement Credential Cryptographic Claim Verification ---")
s, claim_valid = request("/api/v1/auth/verify-claim", method="POST", data={
    "roll_number": "2601010043",
    "secret_salt": "krmu2026",
    "claimed_alias": "Shadow_188"
})
test("Valid placement claim returns 200", s == 200, f"status: {s}")
test("Claim is verified", claim_valid.get("verified") is True, f"res: {claim_valid}")
test("Claim profile contains alias", claim_valid.get("profile", {}).get("alias") == "Shadow_188")

print("\n" + "=" * 70)
print(f"LIVE E2E SYSTEM RESULTS: {PASS}/{PASS + FAIL} passed, {FAIL} failed.")
print("=" * 70)

if FAIL > 0:
    sys.exit(1)
