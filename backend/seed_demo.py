"""
seed_demo.py - Database seeder and verification harness for CampusGhosts.

Drops and cleanly recreates tables, seeds 42 student profiles in CSE-1C,
assigns Rank #1 to the primary demo identity (Roll: 2601010043, Salt: krmu2026),
and generates 85 realistic failure telemetry events across 5 concept clusters.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
import sys
from pathlib import Path

# Add backend directory to path if executed standalone
sys.path.insert(0, str(Path(__file__).resolve().parent))

from crypto_privacy import (
    DB_PATH,
    generate_ghost_commitment,
    get_db_connection,
    get_k_anonymous_telemetry,
    init_db,
    verify_placement_claim,
)

SECTION_NAME = "CSE-1C"
PRIMARY_ROLL = "2601010043"
PRIMARY_SALT = "krmu2026"


def seed_database() -> dict:
    """Reset and seed the CampusGhosts database."""
    print("=" * 70)
    print("RESETTING & SEEDING CAMPUSGHOSTS DATABASE")
    print("=" * 70)

    # 1. Drop and recreate tables
    init_db(drop_existing=True)
    conn = get_db_connection()

    base_time = datetime(2026, 11, 10, 9, 0, 0, tzinfo=timezone.utc)

    # 2. Build 42 student identities
    # - 1 primary demo student (Roll 2601010043)
    # - 41 other cohort members in CSE-1C
    students = []

    # Primary student first
    primary_commitment = generate_ghost_commitment(PRIMARY_ROLL, PRIMARY_SALT)
    primary_profile = {
        "roll_number": PRIMARY_ROLL,
        "ghost_hash": primary_commitment["ghost_hash"],
        "alias": primary_commitment["alias"],
        "section": SECTION_NAME,
        "rating": 1540,
        "streak": 9,
        "solved_count": 28,
        "registered_at": (base_time - timedelta(days=30)).isoformat(),
        "is_primary": True,
    }
    students.append(primary_profile)

    # Generate 41 other students
    rng = random.Random(42)  # Fixed seed for repeatable deterministic demo data
    other_rolls = [f"260101{i:04d}" for i in range(1, 44) if f"260101{i:04d}" != PRIMARY_ROLL]

    for idx, roll in enumerate(other_rolls[:41], start=1):
        salt = f"salt_student_{roll}_{idx*7}"
        commitment = generate_ghost_commitment(roll, salt)

        # Ensure rating stays strictly below 1540 so primary remains Rank #1
        rating = rng.randint(1100, 1490)
        streak = rng.randint(1, 6)
        solved_count = rng.randint(3, 24)
        reg_time = (base_time - timedelta(days=rng.randint(5, 45))).isoformat()

        students.append({
            "roll_number": roll,
            "ghost_hash": commitment["ghost_hash"],
            "alias": commitment["alias"],
            "section": SECTION_NAME,
            "rating": rating,
            "streak": streak,
            "solved_count": solved_count,
            "registered_at": reg_time,
            "is_primary": False,
        })

    # Insert into split tables (ZERO foreign keys)
    with conn:
        for s in students:
            conn.execute(
                """
                INSERT INTO enrolled_roll_registry (roll_number, section, registered_at)
                VALUES (?, ?, ?);
                """,
                (s["roll_number"], s["section"], s["registered_at"]),
            )
            conn.execute(
                """
                INSERT INTO ghost_profiles (ghost_hash, alias, section, rating, streak, solved_count)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (s["ghost_hash"], s["alias"], s["section"], s["rating"], s["streak"], s["solved_count"]),
            )

    print(f"[OK] Seeded 42 enrolled students in enrolled_roll_registry (Section {SECTION_NAME}).")
    print(f"[OK] Seeded 42 ghost profiles in ghost_profiles.")
    print(f"\n>>> PRIMARY DEMO IDENTITY (Rank #1):")
    print(f"    Roll Number  : {primary_profile['roll_number']}")
    print(f"    Secret Salt  : {PRIMARY_SALT}")
    print(f"    Ghost Hash   : {primary_profile['ghost_hash']}")
    print(f"    Ghost Alias  : {primary_profile['alias']}")
    print(f"    Rating/Stats : Rating {primary_profile['rating']} | Streak {primary_profile['streak']} | Solved {primary_profile['solved_count']}")
    print("=" * 70)

    # 3. Seed 85 failure telemetry events across 5 distinct concept clusters
    # Cluster Specifications:
    # 1. Pointers & Memory / UNINITIALIZED_POINTER_DEREF -> 14 distinct ghosts, 30 events
    # 2. Loops & Iteration / OFF_BY_ONE_BOUNDARY         -> 11 distinct ghosts, 24 events
    # 3. Functions & Scope / PASS_BY_VALUE_MUTATION_BUG   -> 7 distinct ghosts, 16 events
    # 4. Recursion / MISSING_BASE_CASE_OVERFLOW           -> 3 distinct ghosts, 9 events  (k=5 mask)
    # 5. Bit Manipulation / SIGNED_SHIFT_OVERFLOW        -> 2 distinct ghosts, 6 events  (k=5 mask)
    # Total distinct ghosts involved = 14 + 11 + 7 + 3 + 2 = 37 distinct students
    # Total failure events = 30 + 24 + 16 + 9 + 6 = 85 events

    all_hashes = [s["ghost_hash"] for s in students]

    cluster_specs = [
        {
            "topic": "Pointers & Memory",
            "concept_tag": "UNINITIALIZED_POINTER_DEREF",
            "target_distinct": 14,
            "target_events": 30,
            "ghosts": all_hashes[0:14],
            "problems": ["PTR-101", "PTR-102", "PTR-205"],
            "languages": ["C", "C++"],
        },
        {
            "topic": "Loops & Iteration",
            "concept_tag": "OFF_BY_ONE_BOUNDARY",
            "target_distinct": 11,
            "target_events": 24,
            "ghosts": all_hashes[14:25],
            "problems": ["LOOP-004", "LOOP-108", "ARR-201"],
            "languages": ["Python", "C++", "Java"],
        },
        {
            "topic": "Functions & Scope",
            "concept_tag": "PASS_BY_VALUE_MUTATION_BUG",
            "target_distinct": 7,
            "target_events": 16,
            "ghosts": all_hashes[25:32],
            "problems": ["FN-102", "FN-201"],
            "languages": ["Python", "C++"],
        },
        {
            "topic": "Recursion",
            "concept_tag": "MISSING_BASE_CASE_OVERFLOW",
            "target_distinct": 3,
            "target_events": 9,
            "ghosts": all_hashes[32:35],
            "problems": ["REC-301", "TREE-402"],
            "languages": ["Python", "C++"],
        },
        {
            "topic": "Bit Manipulation",
            "concept_tag": "SIGNED_SHIFT_OVERFLOW",
            "target_distinct": 2,
            "target_events": 6,
            "ghosts": all_hashes[35:37],
            "problems": ["BIT-101", "BIT-204"],
            "languages": ["C", "C++"],
        },
    ]

    telemetry_rows = []
    current_timestamp = base_time

    for spec in cluster_specs:
        ghosts = spec["ghosts"]
        target_distinct = spec["target_distinct"]
        target_events = spec["target_events"]

        assert len(ghosts) == target_distinct, f"Ghost slice mismatch for {spec['concept_tag']}"

        # 1. Guarantee every distinct ghost has at least 1 failure event
        assigned_events = []
        for g in ghosts:
            assigned_events.append(g)

        # 2. Fill remaining events deterministically across the same ghosts
        remaining_count = target_events - len(assigned_events)
        for i in range(remaining_count):
            assigned_events.append(ghosts[i % len(ghosts)])

        assert len(assigned_events) == target_events
        assert len(set(assigned_events)) == target_distinct

        # Build telemetry rows
        for idx, g_hash in enumerate(assigned_events):
            current_timestamp += timedelta(minutes=rng.randint(12, 180))
            lang = spec["languages"][idx % len(spec["languages"])]
            prob = spec["problems"][idx % len(spec["problems"])]
            telemetry_rows.append((
                g_hash,
                SECTION_NAME,
                lang,
                prob,
                spec["topic"],
                spec["concept_tag"],
                0,  # passed = 0 (failure event)
                current_timestamp.isoformat(),
            ))

    assert len(telemetry_rows) == 85, f"Expected 85 telemetry rows, got {len(telemetry_rows)}"

    # 4. Seed Arena Problems
    problems_data = [
        (
            "ptr-swap",
            "Pointer Swap",
            "cpp",
            "beginner",
            "Pointers & Memory",
            "UNINITIALIZED_POINTER_DEREF",
            "Write a C++ function `void swap(int* a, int* b)` that swaps the values stored at two integer pointers. Do NOT use a third pointer variable — use a temporary integer value.",
            "5 10",
            "10 5",
            "#include <iostream>\nusing namespace std;\n\nvoid swap(int* a, int* b) {\n    int* temp;        // uninitialized pointer — writing to *temp is UB\n    *temp = *a;       // BUG: dereferencing uninitialized pointer\n    *a = *b;\n    *b = *temp;       // BUG: same undefined behaviour\n}\n\nint main() {\n    int x = 5, y = 10;\n    swap(&x, &y);\n    cout << x << \" \" << y << endl;\n    return 0;\n}",
            "#include <iostream>\nusing namespace std;\n\nvoid swap(int* a, int* b) {\n    int temp = *a;    // store VALUE, not a pointer\n    *a = *b;\n    *b = temp;\n}\n\nint main() {\n    int x = 5, y = 10;\n    swap(&x, &y);\n    cout << x << \" \" << y << endl;\n    return 0;\n}",
            "system",
            1250,
        ),
        (
            "arr-bound",
            "Safe Array Sum",
            "cpp",
            "beginner",
            "Loops & Iteration",
            "OFF_BY_ONE_BOUNDARY",
            "Write a C++ function `int arraySum(int arr[], int n)` that returns the sum of `n` elements in `arr`. Be careful with loop boundary conditions.",
            "5\n1 2 3 4 5",
            "15",
            "#include <iostream>\nusing namespace std;\n\nint arraySum(int arr[], int n) {\n    int sum = 0;\n    for (int i = 0; i <= n; i++) {  // BUG: i <= n reads arr[n] which is out of bounds\n        sum += arr[i];\n    }\n    return sum;\n}\n\nint main() {\n    int arr[] = {1, 2, 3, 4, 5};\n    cout << arraySum(arr, 5) << endl;\n    return 0;\n}",
            "#include <iostream>\nusing namespace std;\n\nint arraySum(int arr[], int n) {\n    int sum = 0;\n    for (int i = 0; i < n; i++) {   // FIXED: strict less-than\n        sum += arr[i];\n    }\n    return sum;\n}\n\nint main() {\n    int arr[] = {1, 2, 3, 4, 5};\n    cout << arraySum(arr, 5) << endl;\n    return 0;\n}",
            "system",
            1180,
        ),
        (
            "rec-fact",
            "Recursive Factorial",
            "python",
            "beginner",
            "Recursion",
            "MISSING_BASE_CASE_OVERFLOW",
            "Write a Python function `factorial(n)` that returns `n!` using recursion. Ensure your base case prevents infinite recursion.",
            "5",
            "120",
            "def factorial(n):\n    # BUG: missing base case — infinite recursion for any input\n    return n * factorial(n - 1)\n\nprint(factorial(5))",
            "def factorial(n):\n    if n <= 1:              # base case handles 0 and 1\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(5))",
            "system",
            1220,
        ),
    ]

    with conn:
        conn.executemany(
            """
            INSERT INTO telemetry_events (
                ghost_hash, section, language, problem_id, topic, concept_tag, passed, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            telemetry_rows,
        )
        conn.executemany(
            """
            INSERT INTO problems (
                id, title, language, difficulty, topic, concept_tag, description, sample_input, sample_output, buggy_code, fixed_code, created_by, problem_rating
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            problems_data,
        )

        # 5. Seed Section Settings
        conn.execute(
            """
            INSERT INTO section_settings (section, sos_enabled, duel_mode)
            VALUES (?, ?, ?);
            """,
            (SECTION_NAME, 1, "Bug Hunt"),
        )

        # 6. Seed Channel Messages
        channel_msgs = [
            (SECTION_NAME, "announcements", "Prof. Sharma", "faculty", "Welcome to Week 6 Systems Programming Lab. Pointer & Memory Safety duel is now active.", "2026-11-19T09:00:00Z"),
            (SECTION_NAME, "announcements", "Prof. Sharma", "faculty", "Reminder: Zero PII is linked to duel leaderboards. SOS flares are enabled for peer guidance.", "2026-11-19T09:30:00Z"),
            (SECTION_NAME, "general-chat", "Spectre_578", "student", "Has anyone cleared the pointer swap problem yet?", "2026-11-19T10:05:00Z"),
            (SECTION_NAME, "general-chat", "NullPtr_467", "student", "Yes! Watch out for uninitialized int* temp, store a direct integer value instead.", "2026-11-19T10:12:00Z"),
            (SECTION_NAME, "cpp-guild", "Cipher_102", "student", "Remember: loop boundary is i < n, not i <= n when traversing fixed C arrays.", "2026-11-19T10:20:00Z"),
            (SECTION_NAME, "cpp-guild", "Vortex_901", "student", "Off-by-one errors trigger UB in C++ - AddressSanitizer flags this instantly.", "2026-11-19T10:25:00Z"),
            (SECTION_NAME, "python-den", "Shadow_188", "student", "Recursive factorial without base case n <= 1 hits RecursionError every time.", "2026-11-19T10:35:00Z"),
            (SECTION_NAME, "python-den", "Flux_304", "student", "Always test with n=0 and n=1 before submitting to the test runner.", "2026-11-19T10:40:00Z"),
        ]
        conn.executemany(
            """
            INSERT INTO channel_messages (section, channel, sender_alias, sender_role, content, timestamp)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            channel_msgs,
        )

        # 7. Seed SOS Flares
        sos_flares_data = [
            (
                SECTION_NAME,
                all_hashes[5],
                "Spectre_578",
                "Pointer Swap",
                "cpp",
                "void swap(int* a, int* b) {\n    int* temp;\n    *temp = *a;\n    *a = *b;\n    *b = *temp;\n}",
                "OPEN",
                '[{"helper_alias": "Kernel_231", "nudge_text": "Where does temp point when you declare int* temp without allocating memory?", "timestamp": "2026-11-19T10:15:00Z"}]',
                "2026-11-19T10:10:00Z",
            ),
            (
                SECTION_NAME,
                all_hashes[12],
                "Vortex_901",
                "Safe Array Sum",
                "cpp",
                "int arraySum(int arr[], int n) {\n    int sum = 0;\n    for (int i = 0; i <= n; i++) sum += arr[i];\n    return sum;\n}",
                "OPEN",
                '[{"helper_alias": "Shadow_188", "nudge_text": "What index does a 5-element array end at in 0-indexed languages?", "timestamp": "2026-11-19T11:02:00Z"}]',
                "2026-11-19T10:55:00Z",
            ),
            (
                SECTION_NAME,
                all_hashes[22],
                "NullPtr_467",
                "Recursive Factorial",
                "python",
                "def factorial(n):\n    return n * factorial(n - 1)",
                "OPEN",
                '[{"helper_alias": "Byte_772", "nudge_text": "When should the function stop recursing and return an immediate value?", "timestamp": "2026-11-19T11:45:00Z"}]',
                "2026-11-19T11:30:00Z",
            ),
        ]
        conn.executemany(
            """
            INSERT INTO sos_flares (section, ghost_hash, alias, problem_title, language, code_snippet, status, replies_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            sos_flares_data,
        )

    print(f"[OK] Seeded {len(telemetry_rows)} failure telemetry events across {len(cluster_specs)} concept clusters.")
    print(f"[OK] Seeded {len(problems_data)} coding duel problems in problems table.")
    print(f"[OK] Seeded section settings for {SECTION_NAME} (sos_enabled = 1).")
    print(f"[OK] Seeded {len(channel_msgs)} messages across channels.")
    print(f"[OK] Seeded {len(sos_flares_data)} active SOS flares.")
    conn.close()

    return {
        "primary_profile": primary_profile,
        "total_students": len(students),
        "total_events": len(telemetry_rows),
    }


def verify_integrity(primary_profile: dict) -> None:
    """Run comprehensive verification suite on seeded database."""
    print("\n" + "=" * 70)
    print("RUNNING AUTOMATED VERIFICATION SUITE")
    print("=" * 70)

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Count checks
    cursor.execute("SELECT COUNT(*) FROM enrolled_roll_registry;")
    enrolled_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
    ghosts_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM telemetry_events;")
    telemetry_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM problems;")
    problems_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM channel_messages;")
    channel_msgs_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM sos_flares;")
    sos_flares_count = cursor.fetchone()[0]
    cursor.execute("SELECT sos_enabled FROM section_settings WHERE section = ?;", (SECTION_NAME,))
    sos_enabled_val = cursor.fetchone()[0]

    assert enrolled_count == 42, f"Enrolled count mismatch: {enrolled_count} != 42"
    assert ghosts_count == 42, f"Ghost count mismatch: {ghosts_count} != 42"
    assert telemetry_count == 85, f"Telemetry count mismatch: {telemetry_count} != 85"
    assert problems_count == 3, f"Problems count mismatch: {problems_count} != 3"
    assert channel_msgs_count == 8, f"Channel messages mismatch: {channel_msgs_count} != 8"
    assert sos_flares_count == 3, f"SOS flares mismatch: {sos_flares_count} != 3"
    assert sos_enabled_val == 1, f"SOS enabled mismatch: {sos_enabled_val} != 1"
    print(f"[PASS] Counts: 42 enrolled, 42 ghosts, 85 telemetry, 3 problems, 8 messages, 3 flares, SOS=1.")

    # 2. Rank #1 validation
    cursor.execute("SELECT alias, rating, solved_count, streak FROM ghost_profiles ORDER BY rating DESC LIMIT 1;")
    top_student = cursor.fetchone()
    assert top_student["alias"] == primary_profile["alias"], f"Top student is {top_student['alias']} instead of {primary_profile['alias']}"
    assert top_student["rating"] == 1540, f"Top Rating is {top_student['rating']} != 1540"
    print(f"[PASS] Primary Identity {primary_profile['alias']} is verified Rank #1 (Rating: 1540).")

    # 3. K-Anonymity evaluation in protected mode (k=5)
    k_data_protected = get_k_anonymous_telemetry(SECTION_NAME, k_threshold=5, raw_audit_mode=False)
    print("\n>>> K-ANONYMITY TELEMETRY (Protected Mode, k=5):")
    for c in k_data_protected["clusters"]:
        print(f"    - [{c['status']}] {c['topic']} / {c['concept_tag']}: students={c['student_count']} (display: {c['display_count']}), failures={c['total_failures']}")

    # Verify masking rules
    for c in k_data_protected["clusters"]:
        if c["concept_tag"] in ("MISSING_BASE_CASE_OVERFLOW", "SIGNED_SHIFT_OVERFLOW"):
            assert c["status"] == "MASKED_BY_K_ANONYMITY", f"Expected masked status for {c['concept_tag']}"
            assert c["student_count"] is None, f"Expected None student_count for {c['concept_tag']}"
            assert "< 5" in c["display_count"], f"Expected '< 5' in display_count"
        else:
            assert c["status"] == "VISIBLE", f"Expected visible status for {c['concept_tag']}"
            assert c["student_count"] is not None and c["student_count"] >= 5
    print("[PASS] K-Anonymity Protected Mode successfully masked sub-threshold clusters (< 5).")

    # 4. K-Anonymity evaluation in raw audit mode
    k_data_raw = get_k_anonymous_telemetry(SECTION_NAME, k_threshold=5, raw_audit_mode=True)
    print("\n>>> K-ANONYMITY TELEMETRY (Raw Audit Mode, k=5):")
    for c in k_data_raw["clusters"]:
        print(f"    - [{c['status']}] {c['topic']} / {c['concept_tag']}: students={c['student_count']} (display: {c['display_count']}), failures={c['total_failures']}")

    for c in k_data_raw["clusters"]:
        if c["concept_tag"] == "MISSING_BASE_CASE_OVERFLOW":
            assert c["status"] == "EXPOSED_IN_RAW_MODE"
            assert c["student_count"] == 3
        elif c["concept_tag"] == "SIGNED_SHIFT_OVERFLOW":
            assert c["status"] == "EXPOSED_IN_RAW_MODE"
            assert c["student_count"] == 2
        elif c["concept_tag"] == "UNINITIALIZED_POINTER_DEREF":
            assert c["student_count"] == 14
        elif c["concept_tag"] == "OFF_BY_ONE_BOUNDARY":
            assert c["student_count"] == 11
        elif c["concept_tag"] == "PASS_BY_VALUE_MUTATION_BUG":
            assert c["student_count"] == 7
    print("[PASS] K-Anonymity Raw Mode exposed exact counts (14, 11, 7, 3, 2 distinct students).")

    # 5. Placement Claim Verification Tests
    print("\n>>> ZERO-KNOWLEDGE CLAIM VERIFICATION TESTS:")

    # Valid claim
    valid_res = verify_placement_claim(PRIMARY_ROLL, PRIMARY_SALT, primary_profile["alias"])
    assert valid_res["verified"] is True, "Valid claim failed verification!"
    assert valid_res["profile"]["rating"] == 1540
    print(f"[PASS] Valid claim verified: {valid_res['message']} (Alias: {valid_res['profile']['alias']})")

    # Invalid salt claim
    tampered_salt_res = verify_placement_claim(PRIMARY_ROLL, "wrong_salt_1234", primary_profile["alias"])
    assert tampered_salt_res["verified"] is False, "Tampered salt should fail!"
    assert tampered_salt_res["profile"] is None
    print(f"[PASS] Tampered salt rejected cleanly without data leak: {tampered_salt_res['message']}")

    # Invalid roll claim
    tampered_roll_res = verify_placement_claim("2601019999", PRIMARY_SALT, primary_profile["alias"])
    assert tampered_roll_res["verified"] is False, "Tampered roll should fail!"
    assert tampered_roll_res["profile"] is None
    print(f"[PASS] Tampered roll rejected cleanly without data leak: {tampered_roll_res['message']}")

    # False alias claim
    tampered_alias_res = verify_placement_claim(PRIMARY_ROLL, PRIMARY_SALT, "Phantom_999")
    assert tampered_alias_res["verified"] is False, "Non-existent alias claim should fail!"
    print(f"[PASS] False alias rejected cleanly: {tampered_alias_res['message']}")

    conn.close()
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED WITH ZERO ERRORS.")
    print("=" * 70)


if __name__ == "__main__":
    result = seed_database()
    verify_integrity(result["primary_profile"])
