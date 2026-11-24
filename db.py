"""
db.py - SQLite Database Module for CampusGhosts Phase 1.

Architectural Guarantees:
1. Split-Table Schema: 3 isolated tables with ZERO foreign keys.
2. ZERO shared timestamps or joinable identity-activity telemetry columns.
3. Cryptographic commitment generation with SHA-256 ('||' separator).
4. k-Anonymity telemetry reporting with distinct ghost counting.
"""

from datetime import datetime, timezone, timedelta
import hashlib
import os
import sqlite3
from typing import Any, Dict, List, Optional

# Default path points to campusghosts.db in the directory of this file
DEFAULT_LOCAL_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "campusghosts.db")


def is_serverless_env() -> bool:
    """Detect if running in Vercel or AWS Lambda serverless read-only runtime."""
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"):
        return True
    try:
        test_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return False
    except (OSError, PermissionError):
        return True


def get_db_path(db_path: Optional[str] = None) -> str:
    """Return configured database path or serverless /tmp fallback."""
    if db_path:
        return db_path
    env_override = os.getenv("CAMPUSGHOSTS_DB")
    if env_override:
        return env_override
    if is_serverless_env():
        return "/tmp/campusghosts.db"
    return DEFAULT_LOCAL_DB


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Create a SQLite connection configured with WAL journal mode and busy timeout."""
    target_path = get_db_path(db_path)
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    conn = sqlite3.connect(target_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except sqlite3.OperationalError:
        conn.execute("PRAGMA journal_mode=MEMORY;")
    return conn


def compute_commitment(roll_no: str, secret_salt: str) -> str:
    """
    Compute cryptographic one-way commitment hash linking a student to their ghost identity.
    Uses SHA-256 over '{roll_no}||{secret_salt}'.
    """
    clean_roll = str(roll_no).strip()
    clean_salt = str(secret_salt).strip()
    payload = f"{clean_roll}||{clean_salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def create_schema(conn: sqlite3.Connection) -> None:
    """
    Create the 3 core tables with ZERO foreign keys and ZERO joinable columns.
    """
    with conn:
        # Table 1: Institutional verification registry (Identities only)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS verified_students (
                roll_no TEXT PRIMARY KEY,
                verified_at TEXT NOT NULL
            );
            """
        )

        # Table 2: Ghost profiles (Pseudonymous profiles, ZERO roll numbers)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ghost_profiles (
                commitment_hash TEXT PRIMARY KEY,
                alias TEXT UNIQUE NOT NULL,
                elo_rating INTEGER DEFAULT 1200,
                human_trust_score REAL DEFAULT 100.0
            );
            """
        )

        # Table 3: Telemetry events (Activity only, ZERO foreign keys)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commitment_hash TEXT NOT NULL,
                concept_tag TEXT NOT NULL,
                severity TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


def init_and_seed_db(db_path: Optional[str] = None) -> None:
    """
    Idempotent database initializer and seeder:
    1. Creates the 3 tables if they do not exist.
    2. Seeds 42 fake KRMU CSE ghost profiles ONLY IF ghost_profiles is empty.
    3. Seeds telemetry_events with exact distinct ghost counts:
       - POINTER_DEREF_NULL : 14 distinct ghosts
       - LOOP_INFINITE_BOUND : 9 distinct ghosts
       - RECURSION_NO_BASE  : 6 distinct ghosts
       - ARRAY_OUT_OF_BOUNDS: 4 distinct ghosts (k < 5, must start masked)
    """
    conn = get_connection(db_path)
    try:
        create_schema(conn)

        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
        profile_count = cursor.fetchone()[0]

        # Idempotency check: only seed if table is completely empty
        if profile_count > 0:
            return

        base_time = datetime(2026, 11, 15, 8, 30, 0, tzinfo=timezone.utc)

        # 1. Generate 42 fake KRMU CSE students and ghost profiles
        student_rows: List[tuple] = []
        ghost_rows: List[tuple] = []
        ghost_hashes: List[str] = []

        for i in range(1, 43):
            roll_no = f"260101{i:04d}"
            secret_salt = f"krmu_phase1_salt_{i:04d}"
            commitment_hash = compute_commitment(roll_no, secret_salt)
            ghost_hashes.append(commitment_hash)

            # Different timestamps for registration to avoid temporal correlation
            verified_at = (base_time - timedelta(days=7, hours=i * 2, minutes=i * 3)).isoformat()
            student_rows.append((roll_no, verified_at))

            alias = f"Ghost_{i:02d}"
            ghost_rows.append((commitment_hash, alias, 1200, 100.0))

        with conn:
            conn.executemany(
                "INSERT INTO verified_students (roll_no, verified_at) VALUES (?, ?);",
                student_rows,
            )
            conn.executemany(
                """
                INSERT INTO ghost_profiles (commitment_hash, alias, elo_rating, human_trust_score)
                VALUES (?, ?, ?, ?);
                """,
                ghost_rows,
            )

        # 2. Seed telemetry_events with exact distinct ghost allocations
        # Telemetry uses distinct events and intentionally includes duplicate events
        # per ghost to verify COUNT(DISTINCT commitment_hash) correctness.
        telemetry_rows: List[tuple] = []

        # Target 1: POINTER_DEREF_NULL -> 14 distinct ghosts (ghost_hashes[0:14])
        for idx, g_hash in enumerate(ghost_hashes[0:14]):
            t_stamp = (base_time + timedelta(hours=idx, minutes=10)).isoformat()
            telemetry_rows.append((g_hash, "POINTER_DEREF_NULL", "HIGH", t_stamp))
            # Include repeat attempts for several ghosts to test distinct deduplication
            if idx in (0, 3, 7):
                repeat_t = (base_time + timedelta(hours=idx, minutes=25)).isoformat()
                telemetry_rows.append((g_hash, "POINTER_DEREF_NULL", "HIGH", repeat_t))

        # Target 2: LOOP_INFINITE_BOUND -> 9 distinct ghosts (ghost_hashes[14:23])
        for idx, g_hash in enumerate(ghost_hashes[14:23]):
            t_stamp = (base_time + timedelta(hours=idx + 1, minutes=15)).isoformat()
            telemetry_rows.append((g_hash, "LOOP_INFINITE_BOUND", "MEDIUM", t_stamp))
            if idx in (1, 4):
                repeat_t = (base_time + timedelta(hours=idx + 1, minutes=35)).isoformat()
                telemetry_rows.append((g_hash, "LOOP_INFINITE_BOUND", "MEDIUM", repeat_t))

        # Target 3: RECURSION_NO_BASE -> 6 distinct ghosts (ghost_hashes[23:29])
        for idx, g_hash in enumerate(ghost_hashes[23:29]):
            t_stamp = (base_time + timedelta(hours=idx + 2, minutes=20)).isoformat()
            telemetry_rows.append((g_hash, "RECURSION_NO_BASE", "HIGH", t_stamp))
            if idx == 2:
                repeat_t = (base_time + timedelta(hours=idx + 2, minutes=45)).isoformat()
                telemetry_rows.append((g_hash, "RECURSION_NO_BASE", "HIGH", repeat_t))

        # Target 4: ARRAY_OUT_OF_BOUNDS -> exactly 4 distinct ghosts (ghost_hashes[29:33])
        # Starts below k >= 5 threshold (4 < 5)
        for idx, g_hash in enumerate(ghost_hashes[29:33]):
            t_stamp = (base_time + timedelta(hours=idx + 3, minutes=30)).isoformat()
            telemetry_rows.append((g_hash, "ARRAY_OUT_OF_BOUNDS", "CRITICAL", t_stamp))
            # Ghosts 29 and 31 made 2 extra attempts, but distinct count must remain exactly 4
            if idx in (0, 2):
                extra_1 = (base_time + timedelta(hours=idx + 3, minutes=40)).isoformat()
                extra_2 = (base_time + timedelta(hours=idx + 3, minutes=55)).isoformat()
                telemetry_rows.append((g_hash, "ARRAY_OUT_OF_BOUNDS", "CRITICAL", extra_1))
                telemetry_rows.append((g_hash, "ARRAY_OUT_OF_BOUNDS", "CRITICAL", extra_2))

        with conn:
            conn.executemany(
                """
                INSERT INTO telemetry_events (commitment_hash, concept_tag, severity, created_at)
                VALUES (?, ?, ?, ?);
                """,
                telemetry_rows,
            )
    finally:
        conn.close()


def record_telemetry(
    commitment_hash: str,
    concept_tag: str,
    severity: str = "HIGH",
    created_at: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """Insert a single telemetry event. Returns the inserted event id."""
    conn = get_connection(db_path)
    t_stamp = created_at or datetime.now(timezone.utc).isoformat()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO telemetry_events (commitment_hash, concept_tag, severity, created_at)
                VALUES (?, ?, ?, ?);
                """,
                (commitment_hash.strip(), concept_tag.strip(), severity.strip(), t_stamp),
            )
            return cursor.lastrowid
    finally:
        conn.close()


def get_telemetry(mode: str = "safe", db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieve telemetry grouped by concept_tag using COUNT(DISTINCT commitment_hash).

    Parameters:
      mode: 'safe' (enforce k >= 5 masking) or 'raw' (unmasked counts)
      db_path: Optional database path

    Returns:
      List of dicts formatted per mode:
        In 'safe' mode:
          - count < 5:  {"concept_tag": tag, "count": None, "masked": True, "label": "MASKED (k < 5)"}
          - count >= 5: {"concept_tag": tag, "count": count, "masked": False, "label": str(count)}
        In 'raw' mode:
          - all counts: {"concept_tag": tag, "count": count, "masked": False, "label": str(count)}
    """
    clean_mode = mode.lower().strip()
    if clean_mode not in ("safe", "raw"):
        raise ValueError(f"Invalid mode '{mode}'. Allowed modes are 'safe' and 'raw'.")

    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT concept_tag, COUNT(DISTINCT commitment_hash) AS distinct_ghosts
            FROM telemetry_events
            GROUP BY concept_tag
            ORDER BY distinct_ghosts DESC, concept_tag ASC;
            """
        )
        rows = cursor.fetchall()

        results: List[Dict[str, Any]] = []
        for row in rows:
            tag = row["concept_tag"]
            count = row["distinct_ghosts"]

            if clean_mode == "safe" and count < 5:
                results.append({
                    "concept_tag": tag,
                    "count": None,
                    "masked": True,
                    "label": "MASKED (k < 5)",
                })
            else:
                results.append({
                    "concept_tag": tag,
                    "count": count,
                    "masked": False,
                    "label": str(count),
                })
        return results
    finally:
        conn.close()
