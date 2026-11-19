"""
test_phase1.py - Test Suite for CampusGhosts Phase 1.

Validates:
1. Idempotent seeding and 42 ghost profiles.
2. Zero foreign keys and schema isolation across all 3 SQLite tables.
3. Telemetry masking: ARRAY_OUT_OF_BOUNDS masked in safe mode, equal to 4 in raw mode.
4. Duplicate submissions from the same ghost do NOT inflate telemetry counts.
5. Clamped ELO bounds and mathematical expectations.
"""

import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import pytest

# Ensure campusghosts directory is on sys.path
_CURRENT_DIR = str(Path(__file__).resolve().parent)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from db import (
    compute_commitment,
    init_and_seed_db,
    get_connection,
    get_telemetry,
    record_telemetry,
)
from rating import calculate_elo_delta, apply_elo_delta


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def test_db(tmp_path):
    """Create a temporary SQLite database for test isolation."""
    db_file = str(tmp_path / "test_campusghosts.db")
    init_and_seed_db(db_file)
    return db_file


# ---------------------------------------------------------------------------
# Test 1: Cryptographic Commitment
# ---------------------------------------------------------------------------
def test_compute_commitment():
    """Verify SHA-256 computation using '||' delimiter and normalization."""
    roll = "2601010043"
    salt = "krmu2026_salt"
    expected = hashlib.sha256(f"{roll}||{salt}".encode("utf-8")).hexdigest()

    result = compute_commitment(roll, salt)
    assert result == expected
    assert len(result) == 64

    # Whitespace normalization
    assert compute_commitment(f"  {roll}  ", f"\n{salt}\t") == expected

    # Collision resistance across different rolls/salts
    assert compute_commitment("2601010044", salt) != expected
    assert compute_commitment(roll, "other_salt") != expected


# ---------------------------------------------------------------------------
# Test 2: Schema Isolation & Zero Foreign Keys
# ---------------------------------------------------------------------------
def test_db_schema_isolation_and_zero_foreign_keys(test_db):
    """Verify 3 isolated tables with ZERO foreign keys and ZERO shared columns."""
    conn = get_connection(test_db)
    cursor = conn.cursor()

    # 1. Verify exact 3 tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = {row[0] for row in cursor.fetchall()}
    assert tables == {"verified_students", "ghost_profiles", "telemetry_events"}

    # 2. Verify ZERO foreign keys on all tables
    for table in tables:
        cursor.execute(f"PRAGMA foreign_key_list({table});")
        fks = cursor.fetchall()
        assert len(fks) == 0, f"Table {table} must have ZERO foreign keys, found: {fks}"

    # 3. Verify zero shared join columns between identity and activity
    cursor.execute("PRAGMA table_info(verified_students);")
    student_cols = {row[1] for row in cursor.fetchall()}
    assert student_cols == {"roll_no", "verified_at"}

    cursor.execute("PRAGMA table_info(ghost_profiles);")
    ghost_cols = {row[1] for row in cursor.fetchall()}
    assert ghost_cols == {"commitment_hash", "alias", "elo_rating", "human_trust_score"}

    cursor.execute("PRAGMA table_info(telemetry_events);")
    telemetry_cols = {row[1] for row in cursor.fetchall()}
    assert telemetry_cols == {"id", "commitment_hash", "concept_tag", "severity", "created_at"}

    # No roll_no in ghost_profiles or telemetry_events
    assert "roll_no" not in ghost_cols
    assert "roll_no" not in telemetry_cols
    # No alias or commitment_hash in verified_students
    assert "alias" not in student_cols
    assert "commitment_hash" not in student_cols
    # No shared timestamp column names
    assert student_cols.isdisjoint({"created_at"})
    assert telemetry_cols.isdisjoint({"verified_at"})

    conn.close()


# ---------------------------------------------------------------------------
# Test 3: Idempotent Seeding & 42 Ghosts
# ---------------------------------------------------------------------------
def test_idempotent_seeding_and_42_ghosts(test_db):
    """Verify exactly 42 ghosts seeded and idempotency upon multiple invocations."""
    conn = get_connection(test_db)
    cursor = conn.cursor()

    # Initial counts after first seed
    cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
    assert cursor.fetchone()[0] == 42

    cursor.execute("SELECT COUNT(*) FROM verified_students;")
    assert cursor.fetchone()[0] == 42

    cursor.execute("SELECT COUNT(*) FROM telemetry_events;")
    initial_telemetry_count = cursor.fetchone()[0]
    assert initial_telemetry_count > 0

    # Call init_and_seed_db again (2nd and 3rd time)
    init_and_seed_db(test_db)
    init_and_seed_db(test_db)

    # Verify counts remain strictly identical (zero duplicates)
    cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
    assert cursor.fetchone()[0] == 42

    cursor.execute("SELECT COUNT(*) FROM verified_students;")
    assert cursor.fetchone()[0] == 42

    cursor.execute("SELECT COUNT(*) FROM telemetry_events;")
    assert cursor.fetchone()[0] == initial_telemetry_count

    conn.close()


# ---------------------------------------------------------------------------
# Test 4: k-Anonymity Telemetry (Safe vs Raw Mode)
# ---------------------------------------------------------------------------
def test_telemetry_safe_and_raw_modes(test_db):
    """
    Verify:
      - In 'safe' mode, ARRAY_OUT_OF_BOUNDS (4 ghosts < 5) is masked.
      - In 'raw' mode, ARRAY_OUT_OF_BOUNDS exposes exact count (4).
      - Other tags (14, 9, 6) are unmasked in both safe and raw modes.
    """
    # 1. Safe Mode
    safe_data = get_telemetry(mode="safe", db_path=test_db)
    safe_dict = {item["concept_tag"]: item for item in safe_data}

    # ARRAY_OUT_OF_BOUNDS must be masked because 4 < 5
    assert "ARRAY_OUT_OF_BOUNDS" in safe_dict
    arr_safe = safe_dict["ARRAY_OUT_OF_BOUNDS"]
    assert arr_safe["masked"] is True
    assert arr_safe["count"] is None
    assert arr_safe["label"] == "MASKED (k < 5)"

    # Tags >= 5 must be visible
    assert safe_dict["POINTER_DEREF_NULL"]["masked"] is False
    assert safe_dict["POINTER_DEREF_NULL"]["count"] == 14
    assert safe_dict["POINTER_DEREF_NULL"]["label"] == "14"

    assert safe_dict["LOOP_INFINITE_BOUND"]["masked"] is False
    assert safe_dict["LOOP_INFINITE_BOUND"]["count"] == 9
    assert safe_dict["LOOP_INFINITE_BOUND"]["label"] == "9"

    assert safe_dict["RECURSION_NO_BASE"]["masked"] is False
    assert safe_dict["RECURSION_NO_BASE"]["count"] == 6
    assert safe_dict["RECURSION_NO_BASE"]["label"] == "6"

    # 2. Raw Mode
    raw_data = get_telemetry(mode="raw", db_path=test_db)
    raw_dict = {item["concept_tag"]: item for item in raw_data}

    # In raw mode, ARRAY_OUT_OF_BOUNDS is unmasked with exact count 4
    assert raw_dict["ARRAY_OUT_OF_BOUNDS"]["masked"] is False
    assert raw_dict["ARRAY_OUT_OF_BOUNDS"]["count"] == 4
    assert raw_dict["ARRAY_OUT_OF_BOUNDS"]["label"] == "4"

    assert raw_dict["POINTER_DEREF_NULL"]["count"] == 14
    assert raw_dict["LOOP_INFINITE_BOUND"]["count"] == 9
    assert raw_dict["RECURSION_NO_BASE"]["count"] == 6

    # 3. Invalid Mode
    with pytest.raises(ValueError, match="Invalid mode"):
        get_telemetry(mode="super_secret", db_path=test_db)


# ---------------------------------------------------------------------------
# Test 5: Duplicate Submissions Do Not Inflate Counts
# ---------------------------------------------------------------------------
def test_duplicate_submissions_do_not_inflate_counts(test_db):
    """
    Verify COUNT(DISTINCT commitment_hash):
    Duplicate submissions from the same ghost hash do NOT inflate count.
    Adding a 5th distinct ghost unmasks ARRAY_OUT_OF_BOUNDS in safe mode.
    """
    conn = get_connection(test_db)
    cursor = conn.cursor()

    # Get one of the ghosts currently failing on ARRAY_OUT_OF_BOUNDS
    cursor.execute(
        """
        SELECT DISTINCT commitment_hash
        FROM telemetry_events
        WHERE concept_tag = 'ARRAY_OUT_OF_BOUNDS';
        """
    )
    existing_hashes = [r[0] for r in cursor.fetchall()]
    assert len(existing_hashes) == 4

    # Flood the database with 15 duplicate telemetry events from an existing ghost
    target_ghost = existing_hashes[0]
    for _ in range(15):
        record_telemetry(
            commitment_hash=target_ghost,
            concept_tag="ARRAY_OUT_OF_BOUNDS",
            severity="CRITICAL",
            db_path=test_db,
        )

    # Distinct count in raw mode MUST STILL be exactly 4
    raw_data = get_telemetry(mode="raw", db_path=test_db)
    arr_raw = next(item for item in raw_data if item["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_raw["count"] == 4, "Duplicate events from same ghost must NOT inflate distinct count"

    # Safe mode MUST STILL be masked (4 < 5)
    safe_data = get_telemetry(mode="safe", db_path=test_db)
    arr_safe = next(item for item in safe_data if item["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_safe["masked"] is True
    assert arr_safe["count"] is None

    # Now, add a 5th DISTINCT ghost to ARRAY_OUT_OF_BOUNDS
    cursor.execute(
        """
        SELECT commitment_hash
        FROM ghost_profiles
        WHERE commitment_hash NOT IN (
            SELECT commitment_hash FROM telemetry_events WHERE concept_tag = 'ARRAY_OUT_OF_BOUNDS'
        )
        LIMIT 1;
        """
    )
    new_ghost = cursor.fetchone()[0]
    conn.close()

    record_telemetry(
        commitment_hash=new_ghost,
        concept_tag="ARRAY_OUT_OF_BOUNDS",
        severity="CRITICAL",
        db_path=test_db,
    )

    # Now with 5 distinct ghosts, it must unmask in safe mode!
    safe_data_after = get_telemetry(mode="safe", db_path=test_db)
    arr_safe_after = next(item for item in safe_data_after if item["concept_tag"] == "ARRAY_OUT_OF_BOUNDS")
    assert arr_safe_after["masked"] is False
    assert arr_safe_after["count"] == 5
    assert arr_safe_after["label"] == "5"


# ---------------------------------------------------------------------------
# Test 6: Performance-Aware ELO Rating System & Clamped Bounds
# ---------------------------------------------------------------------------
def test_clamped_elo_bounds_and_formula():
    """Verify calculate_elo_delta mathematical model and strict input clamping."""
    # 1. Equal ratings, perfect win (time=0, memory=0)
    # E = 0.5; 32*(1-0.5) = 16; 10*(1.0 + 1.0) = 20; Total = 36
    delta_perfect_win = calculate_elo_delta(
        player_elo=1200,
        opponent_elo=1200,
        won=True,
        time_ms=0,
        memory_kb=0,
        t_max=1000,
        m_max=65536,
    )
    assert delta_perfect_win == 36

    # 2. Equal ratings, worst loss (time=1000, memory=65536)
    # E = 0.5; 32*(0-0.5) = -16; 10*(0.0 + 0.0) = 0; Total = -16
    delta_worst_loss = calculate_elo_delta(
        player_elo=1200,
        opponent_elo=1200,
        won=False,
        time_ms=1000,
        memory_kb=65536,
        t_max=1000,
        m_max=65536,
    )
    assert delta_worst_loss == -16

    # 3. Test Upper Clamping:
    # time_ms = 999999 (far above t_max=1000) must clamp to t_max and match time_ms=1000
    delta_clamped_high_time = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=999999, memory_kb=0
    )
    delta_exact_max_time = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=1000, memory_kb=0
    )
    assert delta_clamped_high_time == delta_exact_max_time

    # memory_kb = 99999999 (far above m_max=65536) must clamp to m_max
    delta_clamped_high_mem = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=0, memory_kb=99999999
    )
    delta_exact_max_mem = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=0, memory_kb=65536
    )
    assert delta_clamped_high_mem == delta_exact_max_mem

    # 4. Test Lower Clamping:
    # Negative time or memory must clamp to 0
    delta_neg_time = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=-500, memory_kb=0
    )
    assert delta_neg_time == delta_perfect_win

    delta_neg_mem = calculate_elo_delta(
        player_elo=1200, opponent_elo=1200, won=True, time_ms=0, memory_kb=-1000
    )
    assert delta_neg_mem == delta_perfect_win

    # 5. Underdog victory produces higher rating gain than favorite victory
    underdog_delta = calculate_elo_delta(player_elo=1000, opponent_elo=1400, won=True, time_ms=500, memory_kb=30000)
    favorite_delta = calculate_elo_delta(player_elo=1400, opponent_elo=1000, won=True, time_ms=500, memory_kb=30000)
    assert underdog_delta > favorite_delta

    # 6. Safety floor helper
    assert apply_elo_delta(810, -50, floor=800) == 800
    assert apply_elo_delta(1200, 25, floor=800) == 1225
