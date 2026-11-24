"""
main.py - FastAPI Single-Origin Application for CampusGhosts Phase 2.

Exposes REST endpoints for:
- Zero-knowledge student commit & identity verification
- Live duel submission with AI / offline diagnostics and performance ELO updates
- Malicious telemetry penalty deductions
- k-Anonymity faculty bottleneck queries & remedial plan generation
- Schema inspection & leaderboards
- Static asset serving
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from db import (
    compute_commitment,
    init_and_seed_db,
    get_connection,
    get_telemetry,
    record_telemetry,
)
from ai_engine import analyze_code, generate_remedial_plan, PROBLEMS_CATALOG
from rating import calculate_elo_delta

# Directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup handler ensuring database is initialized and seeded."""
    init_and_seed_db()
    yield


app = FastAPI(
    title="CampusGhosts Core API",
    description="Zero-Knowledge Developer Infrastructure & k-Anonymity Telemetry Engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class CommitRequest(BaseModel):
    roll_no: str = Field(..., description="Institutional student roll number")
    secret_salt: str = Field(..., min_length=8, description="Private secret salt (min 8 chars)")


class DuelSubmitRequest(BaseModel):
    commitment_hash: str
    code: str
    language: Optional[str] = "cpp"
    problem_id: Optional[str] = "ptr-swap"
    human_trust_score: Optional[float] = None
    opponent_elo: Optional[int] = 1200
    match_id: Optional[str] = None
    rival_alias: Optional[str] = None
    elapsed_time_sec: Optional[float] = None
    rival_finished: Optional[bool] = False


class MatchmakeRequest(BaseModel):
    commitment_hash: str
    problem_id: Optional[str] = "arr-bound"
    language: Optional[str] = "cpp"


class PenaltyRequest(BaseModel):
    commitment_hash: str
    reason: Optional[str] = "Adversarial or anti-system behavior detected"


class RemedialRequest(BaseModel):
    concept_tag: str
    ghost_count: Optional[int] = 1


class ClaimVerifyRequest(BaseModel):
    roll_no: str
    secret_salt: str


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/problems", status_code=status.HTTP_200_OK)
def list_problems() -> Dict[str, Any]:
    """
    Return all catalog challenges, descriptions, starter codes, and constraints.
    """
    catalog = []
    for pid, pdata in PROBLEMS_CATALOG.items():
        catalog.append({
            "id": pdata["id"],
            "title": pdata["title"],
            "concept_tag": pdata["concept_tag"],
            "difficulty": pdata["difficulty"],
            "description": pdata["description"],
            "starter_code": pdata["starter_code"],
            "buggy_code": pdata.get("buggy_code", {}),
        })
    return {"problems": catalog}


@app.post("/api/auth/commit", status_code=status.HTTP_200_OK)
def auth_commit(payload: CommitRequest) -> Dict[str, Any]:
    """
    Zero-Knowledge student identity commitment:
    1. Validates roll_no and secret_salt (min 8 chars).
    2. Registers roll_no in verified_students.
    3. Computes SHA-256 commitment_hash = SHA256(roll_no || secret_salt).
    4. Fetches or generates unique ghost profile alias ('Cipher_XX') in ghost_profiles.
    5. Returns commitment_hash, alias, elo_rating, human_trust_score WITHOUT storing roll_no in ghost_profiles.
    """
    clean_roll = payload.roll_no.strip()
    clean_salt = payload.secret_salt.strip()

    if not clean_roll:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Roll number cannot be empty.",
        )
    if len(clean_salt) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Secret salt must be at least 8 characters long.",
        )

    commitment_hash = compute_commitment(clean_roll, clean_salt)
    v_timestamp = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    try:
        with conn:
            # Step 1: Register in verified_students
            conn.execute(
                """
                INSERT INTO verified_students (roll_no, verified_at)
                VALUES (?, ?)
                ON CONFLICT(roll_no) DO NOTHING;
                """,
                (clean_roll, v_timestamp),
            )

            # Step 2: Check if ghost profile already exists
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT commitment_hash, alias, elo_rating, human_trust_score
                FROM ghost_profiles
                WHERE commitment_hash = ?;
                """,
                (commitment_hash,),
            )
            existing = cursor.fetchone()

            if existing:
                return {
                    "commitment_hash": existing["commitment_hash"],
                    "alias": existing["alias"],
                    "elo_rating": existing["elo_rating"],
                    "human_trust_score": existing["human_trust_score"],
                }

            # Step 3: Create new ghost profile with sequential alias Cipher_XX
            cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
            count = cursor.fetchone()[0]
            alias = f"Cipher_{count + 1:02d}"

            conn.execute(
                """
                INSERT INTO ghost_profiles (commitment_hash, alias, elo_rating, human_trust_score)
                VALUES (?, ?, 1200, 100.0);
                """,
                (commitment_hash, alias),
            )

        return {
            "commitment_hash": commitment_hash,
            "alias": alias,
            "elo_rating": 1200,
            "human_trust_score": 100.0,
        }
    finally:
        conn.close()


@app.post("/api/duel/matchmake", status_code=status.HTTP_200_OK)
def duel_matchmake(payload: MatchmakeRequest) -> Dict[str, Any]:
    """
    Real-time matchmaking against institutional ghost profiles.
    Finds peer ghosts close to the player's ELO rating.
    """
    clean_hash = payload.commitment_hash.strip()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT commitment_hash, alias, elo_rating, human_trust_score
            FROM ghost_profiles
            WHERE commitment_hash = ?;
            """,
            (clean_hash,),
        )
        student = cursor.fetchone()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ghost profile not found for provided commitment hash.",
            )

        student_elo = student["elo_rating"]

        # Find closest 5 peer ghosts excluding the student
        cursor.execute(
            """
            SELECT commitment_hash, alias, elo_rating, human_trust_score
            FROM ghost_profiles
            WHERE commitment_hash != ?
            ORDER BY ABS(elo_rating - ?) ASC
            LIMIT 5;
            """,
            (clean_hash, student_elo),
        )
        peers = cursor.fetchall()
        if not peers:
            rival = {"alias": "Cipher_01", "elo_rating": 1200, "commitment_hash": "ghost_default"}
        else:
            import random
            rival = random.choice(peers)

        prob_id = payload.problem_id or "arr-bound"
        problem = PROBLEMS_CATALOG.get(prob_id, {
            "id": prob_id,
            "title": "Algorithmic Challenge",
            "difficulty": "Medium",
        })

        rival_elo = rival["elo_rating"]
        base_time = 90
        elo_diff = rival_elo - 1200
        target_time_sec = max(35, min(160, base_time - int(elo_diff * 0.25)))
        cps = max(16, min(36, 22 + int(elo_diff * 0.05)))

        import uuid
        match_id = f"match_{uuid.uuid4().hex[:10]}"

        return {
            "match_id": match_id,
            "round_duration_sec": 180,
            "student": {
                "alias": student["alias"],
                "elo": student["elo_rating"],
                "trust": student["human_trust_score"],
            },
            "rival": {
                "alias": rival["alias"],
                "elo": rival["elo_rating"],
                "commitment_hash": rival["commitment_hash"],
                "target_time_sec": target_time_sec,
                "cps": cps,
            },
            "problem": {
                "id": problem["id"],
                "title": problem["title"],
                "difficulty": problem["difficulty"],
            },
        }
    finally:
        conn.close()


@app.post("/api/duel/submit", status_code=status.HTTP_200_OK)
async def duel_submit(payload: DuelSubmitRequest) -> Dict[str, Any]:
    """
    Evaluate code submission, update ELO and trust score, and record telemetry if failed.
    """
    clean_hash = payload.commitment_hash.strip()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT commitment_hash, alias, elo_rating, human_trust_score
            FROM ghost_profiles
            WHERE commitment_hash = ?;
            """,
            (clean_hash,),
        )
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ghost profile not found for provided commitment hash.",
            )

        current_elo = profile["elo_rating"]
        current_trust = profile["human_trust_score"]
    finally:
        conn.close()

    # 1. Run AI / Offline Diagnostic
    diag = await analyze_code(
        code=payload.code,
        language=payload.language or "cpp",
        problem_id=payload.problem_id or "default",
    )

    passed = bool(diag.get("passed", False))
    concept_tag = diag.get("concept_tag", "UNKNOWN")
    severity = diag.get("severity", "HIGH")
    est_time = int(diag.get("est_time_ms", 10))
    est_mem = int(diag.get("est_memory_kb", 2048))

    # 2. Record telemetry ONLY if submission failed
    if not passed:
        record_telemetry(clean_hash, concept_tag, severity)

    # 3. Calculate Performance ELO Delta
    delta = calculate_elo_delta(
        player_elo=current_elo,
        opponent_elo=payload.opponent_elo or 1200,
        won=passed,
        time_ms=est_time,
        memory_kb=est_mem,
    )
    new_elo = max(100, current_elo + delta)

    # Update trust score if supplied
    new_trust = float(payload.human_trust_score) if payload.human_trust_score is not None else current_trust

    # 4. Persist updated ghost profile stats
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                UPDATE ghost_profiles
                SET elo_rating = ?, human_trust_score = ?
                WHERE commitment_hash = ?;
                """,
                (new_elo, new_trust, clean_hash),
            )
    finally:
        conn.close()

    # 5. Compute match summary and head-to-head outcome if match context provided
    rival_alias = payload.rival_alias or "Rival Ghost"
    rival_finished = bool(payload.rival_finished)
    elapsed = float(payload.elapsed_time_sec) if payload.elapsed_time_sec is not None else (est_time / 1000.0)

    if passed:
        if not rival_finished:
            outcome = "VICTORY"
            outcome_msg = f"Speed & Invariant Victory: Solved in {elapsed:.1f}s before {rival_alias} finished!"
        else:
            outcome = "RUNNER_UP"
            outcome_msg = f"Optimal Solution: Invariants verified, but {rival_alias} submitted code first."
    else:
        outcome = "DEFEAT"
        outcome_msg = f"Invariant Violation: Code failed verification ({concept_tag}). Rival claims the match."

    match_summary = {
        "match_id": payload.match_id or "duel_direct",
        "outcome": outcome,
        "outcome_message": outcome_msg,
        "passed": passed,
        "student_time_sec": round(elapsed, 1),
        "rival_alias": rival_alias,
        "rival_elo": payload.opponent_elo or 1200,
        "rival_finished": rival_finished,
    }

    return {
        "diagnostic": diag,
        "elo_delta": delta,
        "new_elo": new_elo,
        "human_trust_score": new_trust,
        "match_summary": match_summary,
    }


@app.post("/api/duel/penalty", status_code=status.HTTP_200_OK)
def duel_penalty(payload: PenaltyRequest) -> Dict[str, Any]:
    """
    Deduct -25 ELO for adversarial or anti-cheat infractions (floor at 100).
    """
    clean_hash = payload.commitment_hash.strip()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT elo_rating FROM ghost_profiles WHERE commitment_hash = ?;", (clean_hash,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ghost profile not found.")

        current_elo = row["elo_rating"]
        new_elo = max(100, current_elo - 25)

        with conn:
            conn.execute(
                "UPDATE ghost_profiles SET elo_rating = ? WHERE commitment_hash = ?;",
                (new_elo, clean_hash),
            )

        return {
            "commitment_hash": clean_hash,
            "penalty": -25,
            "new_elo": new_elo,
            "reason": payload.reason,
        }
    finally:
        conn.close()


@app.get("/api/faculty/telemetry", status_code=status.HTTP_200_OK)
def faculty_telemetry(mode: str = Query("safe", pattern="^(safe|raw)$")) -> Dict[str, Any]:
    """
    Retrieve k-anonymity filtered or raw failure cluster counts.
    """
    clusters = get_telemetry(mode=mode)
    return {
        "mode": mode,
        "clusters": clusters,
    }


@app.post("/api/faculty/remedial", status_code=status.HTTP_200_OK)
def faculty_remedial(payload: RemedialRequest) -> Dict[str, Any]:
    """
    Generate automated pedagogical remedial slides and viva questions.
    """
    plan = generate_remedial_plan(payload.concept_tag, payload.ghost_count or 1)
    return plan


@app.post("/api/claim/verify", status_code=status.HTTP_200_OK)
def claim_verify(payload: ClaimVerifyRequest) -> Dict[str, Any]:
    """
    Zero-Knowledge placement audit verification:
    1. Recomputes SHA-256 commitment from roll_no and secret_salt.
    2. Verifies match against ghost_profiles.
    3. Calculates cohort rank.
    4. Issues cryptographic signed proof hash: SHA256(commitment_hash:elo_rating:KRMU_VERIFIED).
    """
    clean_roll = payload.roll_no.strip()
    clean_salt = payload.secret_salt.strip()

    commitment_hash = compute_commitment(clean_roll, clean_salt)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT alias, elo_rating, human_trust_score
            FROM ghost_profiles
            WHERE commitment_hash = ?;
            """,
            (commitment_hash,),
        )
        profile = cursor.fetchone()

        if not profile:
            return {
                "verified": False,
                "detail": "Provided credentials do not match any registered ghost identity commitment.",
            }

        elo = profile["elo_rating"]
        alias = profile["alias"]

        # Calculate rank
        cursor.execute(
            "SELECT COUNT(*) + 1 AS rank FROM ghost_profiles WHERE elo_rating > ?;",
            (elo,),
        )
        rank = cursor.fetchone()[0]

        # Construct tamper-proof credential proof
        signed_proof_hash = hashlib.sha256(
            f"{commitment_hash}:{elo}:KRMU_VERIFIED".encode("utf-8")
        ).hexdigest()

        # Institutional HMAC-SHA256 signature
        import hmac
        inst_secret = os.getenv("KRMU_INSTITUTION_KEY", "KRMU_ROOT_AUTH_SECRET_KEY_2026").encode("utf-8")
        hmac_signature = hmac.new(
            inst_secret,
            f"{commitment_hash}:{elo}:{alias}:KRMU_VERIFIED".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "verified": True,
            "alias": alias,
            "elo_rating": elo,
            "rank": rank,
            "signed_proof_hash": signed_proof_hash,
            "hmac_signature": hmac_signature,
        }
    finally:
        conn.close()


@app.get("/api/debug/schema-inspect", status_code=status.HTTP_200_OK)
def debug_schema_inspect() -> Dict[str, Any]:
    """
    Inspection endpoint proving split-table isolation and zero foreign keys.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # 5 sample verified students
        cursor.execute("SELECT roll_no, verified_at FROM verified_students LIMIT 5;")
        students_sample = [dict(r) for r in cursor.fetchall()]

        # 5 sample ghost profiles
        cursor.execute("SELECT commitment_hash, alias, elo_rating, human_trust_score FROM ghost_profiles LIMIT 5;")
        ghosts_sample = [dict(r) for r in cursor.fetchall()]

        # Table schema descriptions and live PRAGMA foreign_key_list checks
        schemas = {}
        foreign_keys = {}
        for table in ("verified_students", "ghost_profiles", "telemetry_events"):
            cursor.execute(f"PRAGMA table_info({table});")
            schemas[table] = [dict(r) for r in cursor.fetchall()]
            cursor.execute(f"PRAGMA foreign_key_list({table});")
            foreign_keys[table] = [dict(r) for r in cursor.fetchall()]

        return {
            "verified_students_sample": students_sample,
            "ghost_profiles_sample": ghosts_sample,
            "schemas": schemas,
            "foreign_keys": foreign_keys,
            "zero_foreign_keys_verified": all(len(fk_list) == 0 for fk_list in foreign_keys.values()),
        }
    finally:
        conn.close()


@app.get("/api/leaderboard", status_code=status.HTTP_200_OK)
def leaderboard() -> Dict[str, Any]:
    """
    Top 10 cohort aliases by ELO rating (identity-stripped).
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT alias, elo_rating, human_trust_score
            FROM ghost_profiles
            ORDER BY elo_rating DESC, alias ASC
            LIMIT 10;
            """
        )
        rows = cursor.fetchall()
        board = [
            {
                "rank": idx + 1,
                "alias": r["alias"],
                "elo_rating": r["elo_rating"],
                "human_trust_score": r["human_trust_score"],
            }
            for idx, r in enumerate(rows)
        ]
        return {"leaderboard": board}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Static Web Assets Mount
# ---------------------------------------------------------------------------
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=FileResponse)
def serve_index() -> FileResponse:
    """Serve the root web application."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Index HTML not found.")


# Export handler for Vercel serverless runtime
handler = app
