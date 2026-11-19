"""
crypto_privacy.py - Cryptographic Identity & K-Anonymity Engine for CampusGhosts.

Split-Table Privacy Architecture:
1. enrolled_roll_registry: Student roll numbers and section mapping (ZERO foreign keys).
2. ghost_profiles: Deterministic pseudonymous profiles derived via salted SHA-256 commitments.
3. telemetry_events: Diagnostic execution events with zero student PII, protected by k-anonymity.
"""

from __future__ import annotations

import hashlib
import hmac
from pathlib import Path
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple, Union

DEFAULT_LOCAL_DB = Path(__file__).resolve().parent / "campusghosts.db"


def is_serverless_env() -> bool:
    """Detect if running in Vercel or AWS Lambda serverless read-only runtime."""
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"):
        return True
    try:
        test_file = Path(__file__).resolve().parent / ".write_test"
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return False
    except (OSError, PermissionError):
        return True


def get_target_db_path(db_path: Optional[Union[str, Path]] = None) -> Path:
    """Return database path. Falls back to /tmp/campusghosts.db in Vercel serverless."""
    if db_path:
        return Path(db_path)
    env_override = os.getenv("CAMPUSGHOSTS_DB")
    if env_override:
        return Path(env_override)
    if is_serverless_env():
        return Path("/tmp/campusghosts.db")
    return DEFAULT_LOCAL_DB


DB_PATH = get_target_db_path()

ALIAS_PREFIXES = [
    "Cipher",
    "Phantom",
    "NullPtr",
    "Vortex",
    "Shadow",
    "Kernel",
    "Spectre",
    "Hex",
    "Byte",
    "Flux",
]


def get_db_connection(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """
    Establish SQLite connection with WAL journal mode and 10.0s timeout to prevent locking.
    """
    target_path = get_target_db_path(db_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target_path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except sqlite3.OperationalError:
        conn.execute("PRAGMA journal_mode=MEMORY;")
    return conn


def init_db(db_path: Optional[Union[str, Path]] = None, drop_existing: bool = False) -> None:
    """
    Initialize database schema with Split-Table design (ZERO foreign keys).
    """
    conn = get_db_connection(db_path)
    try:
        with conn:
            if drop_existing:
                conn.execute("DROP TABLE IF EXISTS sos_flares;")
                conn.execute("DROP TABLE IF EXISTS channel_messages;")
                conn.execute("DROP TABLE IF EXISTS section_settings;")
                conn.execute("DROP TABLE IF EXISTS telemetry_events;")
                conn.execute("DROP TABLE IF EXISTS ghost_profiles;")
                conn.execute("DROP TABLE IF EXISTS enrolled_roll_registry;")
                conn.execute("DROP TABLE IF EXISTS problems;")

            # 1. Enrolled Roll Registry
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS enrolled_roll_registry (
                    roll_number TEXT PRIMARY KEY,
                    section TEXT NOT NULL,
                    registered_at TEXT NOT NULL
                );
                """
            )

            # 2. Ghost Profiles
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ghost_profiles (
                    ghost_hash TEXT PRIMARY KEY,
                    alias TEXT UNIQUE NOT NULL,
                    section TEXT NOT NULL,
                    rating INTEGER DEFAULT 1200,
                    streak INTEGER DEFAULT 1,
                    solved_count INTEGER DEFAULT 0
                );
                """
            )

            # 3. Telemetry Events
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ghost_hash TEXT NOT NULL,
                    section TEXT NOT NULL,
                    language TEXT NOT NULL,
                    problem_id TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    concept_tag TEXT NOT NULL,
                    passed INTEGER NOT NULL,
                    timestamp TEXT NOT NULL
                );
                """
            )

            # 4. Arena Problems (Dynamic Faculty Assignments)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS problems (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    language TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    concept_tag TEXT NOT NULL,
                    description TEXT NOT NULL,
                    sample_input TEXT NOT NULL,
                    sample_output TEXT NOT NULL,
                    buggy_code TEXT NOT NULL,
                    fixed_code TEXT NOT NULL,
                    created_by TEXT DEFAULT 'system',
                    problem_rating INTEGER DEFAULT 1250
                );
                """
            )

            # 5. Section Lab Governance Settings
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS section_settings (
                    section TEXT PRIMARY KEY,
                    sos_enabled INTEGER DEFAULT 1,
                    duel_mode TEXT DEFAULT 'Bug Hunt'
                );
                """
            )

            # 6. Ghost Channels Chat Messages
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS channel_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    section TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    sender_alias TEXT NOT NULL,
                    sender_role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );
                """
            )

            # 7. Anonymous SOS Peer Flares
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sos_flares (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    section TEXT NOT NULL,
                    ghost_hash TEXT NOT NULL,
                    alias TEXT NOT NULL,
                    problem_title TEXT NOT NULL,
                    language TEXT NOT NULL,
                    code_snippet TEXT NOT NULL,
                    status TEXT DEFAULT 'OPEN',
                    replies_json TEXT DEFAULT '[]',
                    timestamp TEXT NOT NULL
                );
                """
            )

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_ghost_profiles_alias ON ghost_profiles(alias);"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_section_passed ON telemetry_events(section, passed);"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_cluster ON telemetry_events(section, passed, topic, concept_tag);"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_channel_messages ON channel_messages(section, channel);"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sos_flares_section ON sos_flares(section, status);"
            )
    finally:
        conn.close()


def generate_ghost_commitment(
    roll_number: str,
    secret_salt: str,
    db_path: Optional[Union[str, Path]] = None,
) -> Dict[str, str]:
    """
    Compute salted cryptographic commitment and deterministic alias.

    - Cleans roll number (strip whitespace, uppercase).
    - Requires roll_number >= 4 chars and secret_salt >= 4 chars.
    - Computes ghost_hash = sha256(f"{roll}::{salt}").
    - Derives deterministic alias: <Prefix>_<3-digit number>.
    - Handles alias collisions: If alias exists in DB for a DIFFERENT hash,
      appends next 2 hex characters from hash.
    """
    if not isinstance(roll_number, str) or not isinstance(secret_salt, str):
        raise ValueError("roll_number and secret_salt must be strings.")

    cleaned_roll = roll_number.strip().upper()
    cleaned_salt = secret_salt.strip()

    if len(cleaned_roll) < 4:
        raise ValueError(
            f"roll_number must be at least 4 characters long (received: '{cleaned_roll}')."
        )
    if len(cleaned_salt) < 4:
        raise ValueError("secret_salt must be at least 4 characters long.")

    commitment_source = f"{cleaned_roll}::{cleaned_salt}".encode("utf-8")
    ghost_hash = hashlib.sha256(commitment_source).hexdigest()

    # Deterministic base alias derivation
    prefix_idx = int(ghost_hash[:4], 16) % len(ALIAS_PREFIXES)
    prefix = ALIAS_PREFIXES[prefix_idx]
    num_suffix = int(ghost_hash[4:8], 16) % 1000
    base_alias = f"{prefix}_{num_suffix:03d}"
    candidate_alias = base_alias

    # Check collision against database if DB is reachable
    target_path = Path(db_path) if db_path else DB_PATH
    if target_path.exists():
        conn = get_db_connection(target_path)
        try:
            cursor = conn.cursor()
            offset = 8
            while True:
                cursor.execute(
                    "SELECT ghost_hash FROM ghost_profiles WHERE alias = ?;",
                    (candidate_alias,),
                )
                row = cursor.fetchone()
                if not row:
                    break
                if hmac.compare_digest(row["ghost_hash"], ghost_hash):
                    # Same commitment already owns this alias
                    break

                # Collision with a DIFFERENT ghost_hash: append next 2 hex characters
                if offset + 2 <= len(ghost_hash):
                    hex_append = ghost_hash[offset : offset + 2]
                    offset += 2
                else:
                    hex_append = ghost_hash[:2]
                candidate_alias = f"{base_alias}_{hex_append}"
        finally:
            conn.close()

    return {
        "ghost_hash": ghost_hash,
        "alias": candidate_alias,
        "roll_number": cleaned_roll,
    }


def get_k_anonymous_telemetry(
    section: str,
    k_threshold: int = 5,
    raw_audit_mode: bool = False,
    db_path: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """
    Retrieve failure telemetry aggregated by concept cluster, enforcing k-anonymity.

    - k_threshold clamped to [2, 20].
    - Groups by (topic, concept_tag) and computes COUNT(DISTINCT ghost_hash) where passed = 0.
    - If raw_audit_mode == False and student_count < k_threshold:
        student_count: None, display_count: "< {k_threshold} (Protected)", status: "MASKED_BY_K_ANONYMITY"
    - If raw_audit_mode == True and student_count < k_threshold:
        student_count: actual count, display_count: str(count), status: "EXPOSED_IN_RAW_MODE"
    - Otherwise:
        student_count: actual count, display_count: str(count), status: "VISIBLE"
    """
    clamped_k = max(2, min(20, int(k_threshold)))
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        query = """
            SELECT
                topic,
                concept_tag,
                COUNT(DISTINCT ghost_hash) AS distinct_students,
                COUNT(*) AS total_failures
            FROM telemetry_events
            WHERE section = ? AND passed = 0
            GROUP BY topic, concept_tag
            ORDER BY distinct_students DESC, total_failures DESC;
        """
        cursor.execute(query, (section,))
        rows = cursor.fetchall()

        clusters: List[Dict[str, Any]] = []
        for row in rows:
            student_count = row["distinct_students"]
            total_failures = row["total_failures"]
            topic = row["topic"]
            concept_tag = row["concept_tag"]

            if student_count < clamped_k:
                if not raw_audit_mode:
                    clusters.append(
                        {
                            "topic": topic,
                            "concept_tag": concept_tag,
                            "student_count": None,
                            "display_count": f"< {clamped_k} (Protected)",
                            "total_failures": total_failures,
                            "status": "MASKED_BY_K_ANONYMITY",
                        }
                    )
                else:
                    clusters.append(
                        {
                            "topic": topic,
                            "concept_tag": concept_tag,
                            "student_count": student_count,
                            "display_count": str(student_count),
                            "total_failures": total_failures,
                            "status": "EXPOSED_IN_RAW_MODE",
                        }
                    )
            else:
                clusters.append(
                    {
                        "topic": topic,
                        "concept_tag": concept_tag,
                        "student_count": student_count,
                        "display_count": str(student_count),
                        "total_failures": total_failures,
                        "status": "VISIBLE",
                    }
                )

        return {
            "section": section,
            "k_threshold": clamped_k,
            "raw_audit_mode": raw_audit_mode,
            "clusters": clusters,
        }
    finally:
        conn.close()


def calculate_rating_change(
    student_rating: int,
    problem_rating: int,
    passed: bool,
    optimization_score: int,
    won_duel: bool = False,
) -> int:
    """
    Logistic Rating Calculation Engine.
    - Expected score: expected = 1.0 / (1.0 + (10.0 ** ((problem_rating - student_rating) / 400.0)))
    - Actual score: 1.0 if passed else 0.0
    - K-Factor: 32
    - Optimization bonus: round((optimization_score - 70) / 10.0) if passed else 0
    - Duel bonus: 6 if (passed and won_duel) else 0
    - Returns delta rating change.
    """
    expected = 1.0 / (1.0 + (10.0 ** ((float(problem_rating) - float(student_rating)) / 400.0)))
    actual = 1.0 if passed else 0.0
    k_factor = 32.0
    opt_bonus = round((float(optimization_score) - 70.0) / 10.0) if passed else 0
    duel_bonus = 6 if (passed and won_duel) else 0
    delta = round(k_factor * (actual - expected)) + opt_bonus + duel_bonus
    return delta


def verify_placement_claim(
    roll_number: str,
    secret_salt: str,
    claimed_alias: str,
    db_path: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """
    Zero-Knowledge Placement Claim Verification.

    Validates that (roll_number, secret_salt) mathematically matches claimed_alias.
    - Constant-time comparison using hmac.compare_digest.
    - Zero data leakage on failure (uniform failure message regardless of whether roll or alias exists).
    """
    failure_response = {
        "verified": False,
        "message": "Verification failed: Claimed identity does not match credentials.",
        "profile": None,
    }

    try:
        commitment = generate_ghost_commitment(
            roll_number=roll_number,
            secret_salt=secret_salt,
            db_path=db_path,
        )
    except (ValueError, TypeError):
        return failure_response

    expected_hash = commitment["ghost_hash"]
    claimed_alias_clean = claimed_alias.strip()

    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ghost_hash, alias, section, rating, streak, solved_count
            FROM ghost_profiles
            WHERE LOWER(alias) = LOWER(?);
            """,
            (claimed_alias_clean,),
        )
        row = cursor.fetchone()

        if not row:
            return failure_response

        stored_hash = row["ghost_hash"]
        if not hmac.compare_digest(stored_hash, expected_hash):
            return failure_response

        return {
            "verified": True,
            "message": "Verification successful.",
            "profile": {
                "ghost_hash": stored_hash,
                "alias": row["alias"],
                "section": row["section"],
                "rating": row["rating"],
                "elo": row["rating"],
                "streak": row["streak"],
                "solved_count": row["solved_count"],
            },
        }
    finally:
        conn.close()
