"""
main.py - FastAPI Application for CampusGhosts.

Endpoints:
  - GET  /api/v1/health
  - POST /api/v1/auth/ghost-login
  - GET  /api/v1/arena/problems
  - POST /api/v1/arena/submit-code
  - GET  /api/v1/arena/leaderboard
  - GET  /api/v1/faculty/telemetry
  - POST /api/v1/faculty/remedial-plan
  - POST /api/v1/auth/verify-claim
  - GET  /* -> Static files mounted at root
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import secrets
import sys
import time
from typing import Any, Dict, List, Optional

_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai_engine import (
    KEY_POOL,
    PROBLEMS,
    PROBLEMS_FILE,
    analyse_code,
    evaluate_code,
    generate_remedial_plan,
)
from crypto_privacy import (
    DB_PATH,
    calculate_rating_change,
    generate_ghost_commitment,
    get_db_connection,
    get_k_anonymous_telemetry,
    init_db,
    verify_placement_claim,
)

# Initialize and seed database if empty (handles Vercel /tmp ephemeral runtime)
def ensure_db_seeded():
    try:
        init_db(drop_existing=False)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM ghost_profiles;")
        count = cursor.fetchone()[0]
        conn.close()
        if count == 0:
            from seed_demo import seed_database
            seed_database()
    except Exception as e:
        try:
            from seed_demo import seed_database
            seed_database()
        except Exception as se:
            print(f"Warning during DB bootstrap: {se}")

ensure_db_seeded()

app = FastAPI(
    title="CampusGhosts API",
    description="Privacy-Preserving Competitive Coding Arena & Socratic Diagnostic Engine",
    version="2.0.0",
)

# Enable CORS for all origins
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
class GhostLoginRequest(BaseModel):
    roll_number: str
    secret_salt: str
    section: Optional[str] = "CSE-1C"


class StudentLoginRequest(BaseModel):
    roll_number: str
    secret_salt: str
    section: Optional[str] = "CSE-1C"


class FacultyLoginRequest(BaseModel):
    email: str
    passcode: str
    section: Optional[str] = "CSE-1C"


class CreateProblemRequest(BaseModel):
    title: str
    language: str = "cpp"
    difficulty: str = "beginner"
    topic: str
    concept_tag: str
    description: str
    sample_input: Optional[str] = ""
    sample_output: Optional[str] = ""
    buggy_code: str
    fixed_code: str
    created_by: Optional[str] = "Faculty"


class SubmitCodeRequest(BaseModel):
    problem_id: str
    code: str
    roll_number: Optional[str] = None
    secret_salt: Optional[str] = None
    ghost_hash: Optional[str] = None
    section: Optional[str] = "CSE-1C"
    language: Optional[str] = None
    won_duel: Optional[bool] = False


class RemedialPlanRequest(BaseModel):
    topic: str
    concept_tag: str
    student_count: int = Field(default=1, ge=1)


class VerifyClaimRequest(BaseModel):
    roll_number: str
    secret_salt: str
    claimed_alias: str


class UpdateSettingsRequest(BaseModel):
    section: str = "CSE-1C"
    sos_enabled: bool = True
    duel_mode: Optional[str] = "Bug Hunt"


class ChannelMessageRequest(BaseModel):
    section: str = "CSE-1C"
    channel: str
    sender_alias: str
    sender_role: str = "student"
    content: str


class CreateFlareRequest(BaseModel):
    section: str = "CSE-1C"
    ghost_hash: str
    alias: str
    problem_title: str
    language: str
    code_snippet: str


class ReplyFlareRequest(BaseModel):
    flare_id: int
    helper_alias: str
    nudge_text: str


class EmailOtpRequest(BaseModel):
    email: str


class EmailVerifyRequest(BaseModel):
    email: str
    otp: str


# ---------------------------------------------------------------------------
# API Routes (/api/v1/*)
# ---------------------------------------------------------------------------
@app.get("/api/v1/health")
def health_check() -> Dict[str, Any]:
    """Return health status, key pool statistics, and database record counts."""
    active_groq = sum(1 for e in KEY_POOL._groq if e.is_available())
    active_gemini = sum(1 for e in KEY_POOL._gemini if e.is_available())

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM ghost_profiles;")
        db_ghosts_count = cursor.fetchone()[0]
    finally:
        conn.close()

    return {
        "status": "ok",
        "active_groq_keys": active_groq,
        "active_gemini_keys": active_gemini,
        "db_ghosts_count": db_ghosts_count,
    }


@app.post("/api/v1/auth/ghost-login")
def ghost_login(payload: GhostLoginRequest) -> Dict[str, Any]:
    """
    Blind login: validates roll & salt, derives commitment & alias,
    upserts enrolled_roll_registry and ghost_profiles independently (ZERO foreign keys),
    and returns ghost profile + section rank.
    """
    try:
        commitment = generate_ghost_commitment(payload.roll_number, payload.secret_salt)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    ghost_hash = commitment["ghost_hash"]
    alias = commitment["alias"]
    section = payload.section.strip() if payload.section else "CSE-1C"
    registered_at = datetime.now(timezone.utc).isoformat()

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO enrolled_roll_registry (roll_number, section, registered_at)
                VALUES (?, ?, ?)
                ON CONFLICT(roll_number) DO UPDATE SET section=excluded.section;
                """,
                (commitment["roll_number"], section, registered_at),
            )
            conn.execute(
                """
                INSERT INTO ghost_profiles (ghost_hash, alias, section, rating, streak, solved_count)
                VALUES (?, ?, ?, 1200, 1, 0)
                ON CONFLICT(ghost_hash) DO NOTHING;
                """,
                (ghost_hash, alias, section),
            )

        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ghost_hash, alias, section, rating, streak, solved_count
            FROM ghost_profiles
            WHERE ghost_hash = ?;
            """,
            (ghost_hash,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve ghost profile.",
            )
        profile = dict(row)
        profile["elo"] = profile["rating"]

        cursor.execute(
            """
            SELECT COUNT(*) + 1 AS rank
            FROM ghost_profiles
            WHERE section = ? AND rating > ?;
            """,
            (section, profile["rating"]),
        )
        profile["rank"] = cursor.fetchone()[0]
        return profile
    finally:
        conn.close()


@app.post("/api/v1/auth/student-login")
def student_login(payload: StudentLoginRequest) -> Dict[str, Any]:
    """
    Role-separated Student Zero-Knowledge login:
    Validates roll & salt, creates/fetches unlinked ghost profile,
    returns role, session token, stats, and identity recovery key.
    """
    try:
        commitment = generate_ghost_commitment(payload.roll_number, payload.secret_salt)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    ghost_hash = commitment["ghost_hash"]
    alias = commitment["alias"]
    section = payload.section.strip() if payload.section else "CSE-1C"
    registered_at = datetime.now(timezone.utc).isoformat()

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO enrolled_roll_registry (roll_number, section, registered_at)
                VALUES (?, ?, ?)
                ON CONFLICT(roll_number) DO UPDATE SET section=excluded.section;
                """,
                (commitment["roll_number"], section, registered_at),
            )
            conn.execute(
                """
                INSERT INTO ghost_profiles (ghost_hash, alias, section, rating, streak, solved_count)
                VALUES (?, ?, ?, 1200, 1, 0)
                ON CONFLICT(ghost_hash) DO NOTHING;
                """,
                (ghost_hash, alias, section),
            )

        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ghost_hash, alias, section, rating, streak, solved_count
            FROM ghost_profiles
            WHERE ghost_hash = ?;
            """,
            (ghost_hash,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve ghost profile.",
            )
        profile = dict(row)
        profile["elo"] = profile["rating"]

        cursor.execute(
            """
            SELECT COUNT(*) + 1 AS rank
            FROM ghost_profiles
            WHERE section = ? AND rating > ?;
            """,
            (section, profile["rating"]),
        )
        rank = cursor.fetchone()[0]
        session_token = secrets.token_hex(24)

        recovery_key_text = (
            f"=== CAMPUSGHOSTS ZERO-KNOWLEDGE IDENTITY RECOVERY CARD ===\n"
            f"Roll Number : {commitment['roll_number']}\n"
            f"Cohort      : {section}\n"
            f"Ghost Alias : {alias}\n"
            f"Ghost Hash  : {ghost_hash}\n"
            f"Secret Salt : {payload.secret_salt.strip()}\n"
            f"Issued At   : {registered_at}\n"
            f"-----------------------------------------------------------\n"
            f"CRITICAL: Keep this file in a safe offline location.\n"
            f"The CampusGhosts server stores ZERO foreign keys or records\n"
            f"linking your institutional roll number to your ghost alias.\n"
            f"==========================================================="
        )

        return {
            "role": "student",
            "session_token": session_token,
            "ghost_hash": ghost_hash,
            "alias": alias,
            "section": section,
            "rating": profile["rating"],
            "elo": profile["elo"],
            "streak": profile["streak"],
            "solved_count": profile["solved_count"],
            "rank": rank,
            "recovery_key_text": recovery_key_text,
        }
    finally:
        conn.close()


@app.post("/api/v1/auth/email/request-otp")
@app.post("/api/auth/email/request-otp")
def api_request_email_otp(payload: EmailOtpRequest) -> Dict[str, Any]:
    """Issues 6-digit cryptographic OTP for student institutional email domain."""
    from auth_vault import request_institutional_otp
    res = request_institutional_otp(payload.email)
    if not res.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("error", "Failed to generate OTP"),
        )
    return res


@app.post("/api/v1/auth/email/verify-otp")
@app.post("/api/auth/email/verify-otp")
def api_verify_email_otp(payload: EmailVerifyRequest) -> Dict[str, Any]:
    """Verifies OTP and issues proof token without linking to ghost profiles."""
    from auth_vault import verify_institutional_otp
    res = verify_institutional_otp(payload.email, payload.otp)
    if not res.get("verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("error", "Verification failed"),
        )
    return res


@app.post("/api/v1/auth/faculty-login")
def faculty_login(payload: FacultyLoginRequest) -> Dict[str, Any]:
    """
    Role-separated Faculty institutional portal login.
    Validates institutional email and passcode 'KRMU-FAC-2026'.
    """
    email_clean = payload.email.strip().lower()
    if "@" not in email_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Institutional email required (must contain '@').",
        )

    passcode_clean = payload.passcode.strip()
    if passcode_clean != "KRMU-FAC-2026":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid faculty passcode. Required: KRMU-FAC-2026",
        )

    raw_name = email_clean.split("@")[0].replace(".", " ").replace("_", " ").title()
    if raw_name.lower().startswith("prof "):
        faculty_name = "Prof. " + raw_name[5:]
    elif not raw_name.lower().startswith("prof"):
        faculty_name = f"Prof. {raw_name}"
    else:
        faculty_name = raw_name
    section = payload.section.strip() if payload.section else "CSE-1C"

    return {
        "role": "faculty",
        "session_token": secrets.token_hex(24),
        "faculty_name": faculty_name,
        "email": email_clean,
        "department": "School of Engineering & Technology",
        "section": section,
    }


@app.post("/api/v1/faculty/create-problem")
def create_problem(payload: CreateProblemRequest) -> Dict[str, Any]:
    """
    Publish a new lab problem dynamically to SQLite.
    Immediately available to students in their Coding Lab.
    """
    title_clean = payload.title.strip()
    if not title_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty.")

    slug_base = re.sub(r"[^a-z0-9]+", "-", title_clean.lower()).strip("-")
    if not slug_base:
        slug_base = "assignment"
    problem_id = f"{slug_base}-{int(time.time()) % 10000}"

    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO problems (
                    id, title, language, difficulty, topic, concept_tag,
                    description, sample_input, sample_output, buggy_code, fixed_code, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    problem_id,
                    title_clean,
                    payload.language.lower().strip(),
                    payload.difficulty.lower().strip(),
                    payload.topic.strip(),
                    payload.concept_tag.strip().upper(),
                    payload.description.strip(),
                    (payload.sample_input or "").strip(),
                    (payload.sample_output or "").strip(),
                    payload.buggy_code.strip(),
                    payload.fixed_code.strip(),
                    payload.created_by or "Faculty",
                ),
            )

        PROBLEMS[problem_id] = {
            "id": problem_id,
            "title": title_clean,
            "language": payload.language.lower().strip(),
            "topic": payload.topic.strip(),
            "concept_tag": payload.concept_tag.strip().upper(),
            "difficulty": payload.difficulty.lower().strip(),
            "description": payload.description.strip(),
            "sample_input": (payload.sample_input or "").strip(),
            "sample_output": (payload.sample_output or "").strip(),
            "buggy_code": payload.buggy_code.strip(),
            "fixed_code": payload.fixed_code.strip(),
            "created_by": payload.created_by or "Faculty",
        }

        return {
            "status": "ok",
            "message": "Problem published successfully.",
            "problem": PROBLEMS[problem_id],
        }
    finally:
        conn.close()


@app.get("/api/v1/arena/problems")
def get_problems() -> Dict[str, Any]:
    """Serve coding duel problems dynamically from SQLite."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM problems ORDER BY id ASC;")
        rows = cursor.fetchall()
        if rows:
            problems_list = [dict(r) for r in rows]
            for p in problems_list:
                if p["id"] not in PROBLEMS:
                    PROBLEMS[p["id"]] = p
            return {"problems": problems_list}
    finally:
        conn.close()

    if PROBLEMS_FILE.exists():
        try:
            with open(PROBLEMS_FILE, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return {"problems": list(PROBLEMS.values())}


@app.post("/api/v1/arena/submit-code")
def submit_code(payload: SubmitCodeRequest) -> Dict[str, Any]:
    """
    Submit code for diagnostic evaluation.
    - Rejects code > 10,000 characters (HTTP 400).
    - Runs ai_engine.analyse_code().
    - Only logs to telemetry_events if is_valid_attempt is True.
    - Updates ELO (+25 on pass, -5 on fail, floor 800).
    - Returns full diagnostic + updated profile stats.
    """
    if len(payload.code) > 10000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code exceeds 10,000 character limit.",
        )

    # Determine ghost_hash
    ghost_hash = None
    if payload.roll_number and payload.secret_salt:
        try:
            commitment = generate_ghost_commitment(payload.roll_number, payload.secret_salt)
            ghost_hash = commitment["ghost_hash"]
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    elif payload.ghost_hash:
        ghost_hash = payload.ghost_hash.strip()

    if not ghost_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either (roll_number, secret_salt) or ghost_hash.",
        )

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ghost_hash, alias, section, rating, streak, solved_count
            FROM ghost_profiles
            WHERE ghost_hash = ?;
            """,
            (ghost_hash,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ghost profile not found. Please log in first.",
            )
        profile = dict(row)

        # Run AI Diagnostic Engine
        diagnostic = evaluate_code(payload.problem_id, payload.code)
        is_valid = diagnostic.get("is_valid_attempt", True)
        passed = diagnostic.get("passed") is True

        new_rating = profile["rating"]
        new_streak = profile["streak"]
        new_solved = profile["solved_count"]
        rating_delta = 0

        # Only log telemetry and update stats if this is a genuine code attempt
        if is_valid:
            passed_val = 1 if passed else 0
            prob_info = PROBLEMS.get(payload.problem_id)
            if not prob_info:
                cursor.execute("SELECT * FROM problems WHERE id = ?;", (payload.problem_id,))
                p_row = cursor.fetchone()
                if p_row:
                    prob_info = dict(p_row)
                    PROBLEMS[payload.problem_id] = prob_info
                else:
                    prob_info = {}
            language = payload.language or prob_info.get("language", "unknown")
            topic = diagnostic.get("topic") or prob_info.get("topic", "General")
            concept_tag = diagnostic.get("concept_tag") or prob_info.get("concept_tag", "UNKNOWN")
            problem_rating = int(prob_info.get("problem_rating", 1250))
            timestamp = datetime.now(timezone.utc).isoformat()

            opt_score = int(diagnostic.get("optimization_score", 90 if passed else 0))
            won_duel = bool(payload.won_duel)

            rating_delta = calculate_rating_change(
                student_rating=profile["rating"],
                problem_rating=problem_rating,
                passed=passed,
                optimization_score=opt_score,
                won_duel=won_duel,
            )
            new_rating = max(800, profile["rating"] + rating_delta)

            if passed:
                new_streak = profile["streak"] + 1
                new_solved = profile["solved_count"] + 1
            else:
                new_streak = 0

            with conn:
                conn.execute(
                    """
                    INSERT INTO telemetry_events (
                        ghost_hash, section, language, problem_id, topic, concept_tag, passed, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        ghost_hash,
                        profile["section"],
                        language,
                        payload.problem_id,
                        topic,
                        concept_tag,
                        passed_val,
                        timestamp,
                    ),
                )
                conn.execute(
                    """
                    UPDATE ghost_profiles
                    SET rating = ?, streak = ?, solved_count = ?
                    WHERE ghost_hash = ?;
                    """,
                    (new_rating, new_streak, new_solved, ghost_hash),
                )

        return {
            "diagnostic": diagnostic,
            "rating": new_rating,
            "elo": new_rating,
            "rating_delta": rating_delta,
            "streak": new_streak,
            "solved_count": new_solved,
            "is_valid_attempt": is_valid,
        }
    finally:
        conn.close()


@app.get("/api/v1/arena/leaderboard")
def get_leaderboard(section: str = Query("CSE-1C")) -> Dict[str, Any]:
    """
    Retrieve Top 10 aliases for a section.
    CRITICAL: NEVER exposes ghost_hash or roll_number.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT alias, section, rating, streak, solved_count
            FROM ghost_profiles
            WHERE section = ?
            ORDER BY rating DESC, solved_count DESC, streak DESC
            LIMIT 10;
            """,
            (section,),
        )
        rows = cursor.fetchall()
        leaderboard = []
        for rank, row in enumerate(rows, start=1):
            leaderboard.append(
                {
                    "rank": rank,
                    "alias": row["alias"],
                    "section": row["section"],
                    "rating": row["rating"],
                    "elo": row["rating"],
                    "streak": row["streak"],
                    "solved_count": row["solved_count"],
                }
            )
        return {"section": section, "leaderboard": leaderboard}
    finally:
        conn.close()


@app.get("/api/v1/faculty/telemetry")
def get_faculty_telemetry(
    section: str = Query("CSE-1C"),
    k_threshold: int = Query(5, ge=2, le=20),
    raw_audit_mode: bool = Query(False),
) -> Dict[str, Any]:
    """Retrieve failure telemetry aggregated with K-Anonymity privacy guarantees."""
    return get_k_anonymous_telemetry(
        section=section,
        k_threshold=k_threshold,
        raw_audit_mode=raw_audit_mode,
    )


@app.post("/api/v1/faculty/remedial-plan")
def build_remedial_plan(payload: RemedialPlanRequest) -> Dict[str, Any]:
    """Generate 10-minute faculty remedial lecture plan via AI or offline fallback."""
    return generate_remedial_plan(
        topic=payload.topic,
        concept_tag=payload.concept_tag,
        student_count=payload.student_count,
    )


@app.post("/api/v1/auth/verify-claim")
def verify_claim(payload: VerifyClaimRequest) -> Dict[str, Any]:
    """Zero-knowledge placement verification for student ghost alias."""
    return verify_placement_claim(
        roll_number=payload.roll_number,
        secret_salt=payload.secret_salt,
        claimed_alias=payload.claimed_alias,
    )


# ---------------------------------------------------------------------------
# Section Governance, Channels & SOS Flares
# ---------------------------------------------------------------------------
@app.get("/api/v1/section/settings")
def get_section_settings(section: str = Query("CSE-1C")) -> Dict[str, Any]:
    """Retrieve governance settings (SOS toggle, duel mode) for a section."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT section, sos_enabled, duel_mode FROM section_settings WHERE section = ?;", (section,))
        row = cursor.fetchone()
        if row:
            return {
                "section": row["section"],
                "sos_enabled": bool(row["sos_enabled"]),
                "duel_mode": row["duel_mode"] or "Bug Hunt",
            }
        return {
            "section": section,
            "sos_enabled": True,
            "duel_mode": "Bug Hunt",
        }
    finally:
        conn.close()


@app.post("/api/v1/faculty/settings")
def update_section_settings(payload: UpdateSettingsRequest) -> Dict[str, Any]:
    """Faculty governance update: toggles SOS flares or sets duel mode."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO section_settings (section, sos_enabled, duel_mode)
                VALUES (?, ?, ?)
                ON CONFLICT(section) DO UPDATE SET
                    sos_enabled = excluded.sos_enabled,
                    duel_mode = excluded.duel_mode;
                """,
                (payload.section, 1 if payload.sos_enabled else 0, payload.duel_mode or "Bug Hunt"),
            )
        return {
            "status": "ok",
            "section": payload.section,
            "sos_enabled": payload.sos_enabled,
            "duel_mode": payload.duel_mode or "Bug Hunt",
        }
    finally:
        conn.close()


@app.get("/api/v1/channels/messages")
def get_channel_messages(
    section: str = Query("CSE-1C"),
    channel: str = Query("#general-chat"),
) -> Dict[str, Any]:
    """Fetch recent messages for a specific channel in the section."""
    ch_raw = channel.strip()
    ch_hash = ch_raw if ch_raw.startswith("#") else f"#{ch_raw}"
    ch_plain = ch_raw.lstrip("#")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, section, channel, sender_alias, sender_role, content, timestamp
            FROM channel_messages
            WHERE section = ? AND (channel = ? OR channel = ?)
            ORDER BY id ASC
            LIMIT 50;
            """,
            (section, ch_hash, ch_plain),
        )
        rows = cursor.fetchall()
        messages = [dict(r) for r in rows]
        return {
            "section": section,
            "channel": ch_hash,
            "messages": messages,
        }
    finally:
        conn.close()


@app.post("/api/v1/channels/messages")
def post_channel_message(payload: ChannelMessageRequest) -> Dict[str, Any]:
    """
    Post a message to an anonymous channel.
    Rules:
    - Only role 'faculty' can post in #announcements (HTTP 403)
    - Content cannot be blank, max 500 characters
    """
    ch_raw = payload.channel.strip()
    ch = ch_raw if ch_raw.startswith("#") else f"#{ch_raw}"
    ch_clean = ch_raw.lstrip("#").lower()

    if ch_clean == "announcements" and payload.sender_role.strip().lower() != "faculty":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only faculty can post in #announcements",
        )

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message content cannot be empty.")
    if len(content) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message too long (max 500 characters).")

    timestamp = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO channel_messages (section, channel, sender_alias, sender_role, content, timestamp)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (payload.section, ch, payload.sender_alias.strip(), payload.sender_role.strip(), content, timestamp),
            )
            msg_id = cursor.lastrowid
        return {
            "status": "ok",
            "id": msg_id,
            "timestamp": timestamp,
        }
    finally:
        conn.close()


@app.get("/api/v1/sos/list")
def list_sos_flares(section: str = Query("CSE-1C")) -> Dict[str, Any]:
    """Retrieve active SOS flares for the section along with governance status."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT sos_enabled FROM section_settings WHERE section = ?;", (section,))
        s_row = cursor.fetchone()
        sos_enabled = bool(s_row["sos_enabled"]) if s_row else True

        cursor.execute(
            """
            SELECT id, section, ghost_hash, alias, problem_title, language, code_snippet, status, replies_json, timestamp
            FROM sos_flares
            WHERE section = ?
            ORDER BY id DESC;
            """,
            (section,),
        )
        rows = cursor.fetchall()
        flares = []
        for r in rows:
            f_dict = dict(r)
            f_dict.pop("ghost_hash", None)
            try:
                f_dict["replies"] = json.loads(f_dict.get("replies_json") or "[]")
            except Exception:
                f_dict["replies"] = []
            f_dict.pop("replies_json", None)
            flares.append(f_dict)

        return {
            "section": section,
            "sos_enabled": sos_enabled,
            "flares": flares,
        }
    finally:
        conn.close()


@app.post("/api/v1/sos/create")
def create_sos_flare(payload: CreateFlareRequest) -> Dict[str, Any]:
    """
    Drop an anonymous SOS Flare.
    Checks if faculty has disabled SOS flares for lab assessment.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT sos_enabled FROM section_settings WHERE section = ?;", (payload.section,))
        s_row = cursor.fetchone()
        if s_row and not bool(s_row["sos_enabled"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SOS Flares are currently disabled by Faculty for lab assessment",
            )

        snippet = payload.code_snippet.strip()
        if len(snippet) > 2000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code snippet too large (max 2000 chars).")

        timestamp = datetime.now(timezone.utc).isoformat()
        with conn:
            cursor.execute(
                """
                INSERT INTO sos_flares (
                    section, ghost_hash, alias, problem_title, language, code_snippet, status, replies_json, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', '[]', ?);
                """,
                (
                    payload.section,
                    payload.ghost_hash,
                    payload.alias,
                    payload.problem_title,
                    payload.language,
                    snippet,
                    timestamp,
                ),
            )
            flare_id = cursor.lastrowid

        return {"status": "ok", "flare_id": flare_id}
    finally:
        conn.close()


@app.post("/api/v1/sos/reply")
def reply_sos_flare(payload: ReplyFlareRequest) -> Dict[str, Any]:
    """
    Socratic peer nudge reply with Anti-Code-Dump guard.
    - Max 180 chars
    - Disallows code syntax characters: ';', '{', or 'return '
    - Rewards helper with +10 ELO in ghost_profiles
    """
    nudge = payload.nudge_text.strip()
    if not nudge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nudge text cannot be empty.")
    if len(nudge) > 180:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Socratic nudges must be concise (max 180 characters)",
        )

    # Anti-code-dump guard
    forbidden_tokens = [";", "{", "return "]
    for token in forbidden_tokens:
        if token in nudge:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Anti-code-dump guard: Socratic hints cannot contain code syntax ('{token.strip()}'). Give hints, not solutions!",
            )

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, replies_json FROM sos_flares WHERE id = ?;", (payload.flare_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOS Flare not found.")

        try:
            replies = json.loads(row["replies_json"] or "[]")
        except Exception:
            replies = []

        now_iso = datetime.now(timezone.utc).isoformat()
        new_reply = {
            "id": len(replies) + 1,
            "helper_alias": payload.helper_alias.strip(),
            "text": nudge,
            "timestamp": now_iso,
            "upvotes": 0,
        }
        replies.append(new_reply)

        with conn:
            cursor.execute(
                "UPDATE sos_flares SET replies_json = ? WHERE id = ?;",
                (json.dumps(replies), payload.flare_id),
            )
            # Award +8 Mentor Rating to helper
            cursor.execute(
                "UPDATE ghost_profiles SET rating = rating + 8 WHERE alias = ?;",
                (payload.helper_alias.strip(),),
            )

        return {
            "status": "ok",
            "flare_id": payload.flare_id,
            "reply": new_reply,
            "awarded_rating": 8,
            "awarded_elo": 8,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Phase 1-4 Compatibility Routes (/api/* alias mapping)
# ---------------------------------------------------------------------------
class CommitReq(BaseModel):
    roll_no: str
    secret_salt: str

@app.post("/api/auth/commit")
def api_auth_commit(payload: CommitReq):
    c = generate_ghost_commitment(payload.roll_no, payload.secret_salt)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT ghost_hash, alias, rating FROM ghost_profiles WHERE ghost_hash = ?;", (c["ghost_hash"],))
        row = cursor.fetchone()
        if not row:
            with conn:
                conn.execute(
                    "INSERT INTO ghost_profiles (ghost_hash, alias, section, rating, streak, solved_count) VALUES (?, ?, ?, 1200, 1, 0);",
                    (c["ghost_hash"], c["alias"], "CSE-1C")
                )
            elo = 1200
            alias = c["alias"]
        else:
            elo = row["rating"]
            alias = row["alias"]
        return {
            "commitment_hash": c["ghost_hash"],
            "alias": alias,
            "elo_rating": elo,
            "human_trust_score": 100.0,
        }
    finally:
        conn.close()

class DuelSubmitReq(BaseModel):
    commitment_hash: str
    code: str
    language: Optional[str] = "cpp"
    problem_id: Optional[str] = "arr-bound"
    human_trust_score: Optional[float] = None
    opponent_elo: Optional[int] = 1200

@app.post("/api/duel/submit")
async def api_duel_submit(payload: DuelSubmitReq):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT alias, rating FROM ghost_profiles WHERE ghost_hash = ?;", (payload.commitment_hash,))
        row = cursor.fetchone()
        current_elo = row["rating"] if row else 1200
        alias = row["alias"] if row else "Ghost_Guest"
    finally:
        conn.close()

    eval_res = evaluate_code(payload.problem_id or "arr-bound", payload.code, payload.language or "cpp")
    passed = eval_res.get("passed", False)
    concept_tag = eval_res.get("concept_tag", "UNKNOWN")
    severity = "HIGH" if not passed else "LOW"
    runtime_ms = eval_res.get("runtime_ms", 12.0)
    memory_kb = eval_res.get("memory_kb", 2048)

    delta = calculate_rating_change(current_elo, payload.opponent_elo or 1200, passed, eval_res.get("optimization_score", 70))
    new_elo = max(800, current_elo + delta)

    conn = get_db_connection()
    try:
        with conn:
            conn.execute("UPDATE ghost_profiles SET rating = ? WHERE ghost_hash = ?;", (new_elo, payload.commitment_hash))
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO telemetry_events (ghost_hash, section, language, problem_id, topic, concept_tag, passed, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                (payload.commitment_hash, "CSE-1C", payload.language or "cpp", payload.problem_id or "arr-bound", eval_res.get("topic", "Logic"), concept_tag, 1 if passed else 0, now_iso)
            )
    finally:
        conn.close()

    diag = {
        "passed": passed,
        "concept_tag": concept_tag,
        "severity": severity,
        "socratic_hint": eval_res.get("socratic_hint", "Review loop bounds and memory invariants."),
        "est_time_ms": int(runtime_ms),
        "est_memory_kb": int(memory_kb),
        "source": eval_res.get("source", "offline_ast"),
    }
    return {
        "diagnostic": diag,
        "elo_delta": delta,
        "new_elo": new_elo,
        "human_trust_score": payload.human_trust_score if payload.human_trust_score is not None else 100.0,
    }

class PenaltyReq(BaseModel):
    commitment_hash: str
    reason: Optional[str] = "Adversarial or anti-system behavior detected"

@app.post("/api/duel/penalty")
def api_duel_penalty(payload: PenaltyReq):
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("UPDATE ghost_profiles SET rating = MAX(800, rating - 25) WHERE ghost_hash = ?;", (payload.commitment_hash,))
            cursor = conn.cursor()
            cursor.execute("SELECT rating FROM ghost_profiles WHERE ghost_hash = ?;", (payload.commitment_hash,))
            row = cursor.fetchone()
            new_elo = row["rating"] if row else 1175
        return {
            "commitment_hash": payload.commitment_hash,
            "penalty": -25,
            "new_elo": new_elo,
            "reason": payload.reason,
        }
    finally:
        conn.close()

@app.get("/api/faculty/telemetry")
def api_faculty_telemetry(mode: str = Query("safe")):
    k_thresh = 5 if mode == "safe" else 1
    raw_mode = (mode == "raw")
    clusters_dict = get_k_anonymous_telemetry(section="CSE-1C", k_threshold=k_thresh, raw_audit_mode=raw_mode)
    clusters = []
    for tag, meta in clusters_dict.items():
        clusters.append({
            "concept_tag": tag,
            "count": meta["count"] if not meta["is_masked"] else None,
            "masked": meta["is_masked"],
            "label": f"MASKED (k < 5)" if meta["is_masked"] else str(meta["count"]),
        })
    return {"mode": mode, "clusters": clusters}

class RemedialReq(BaseModel):
    concept_tag: str
    ghost_count: Optional[int] = 1

@app.post("/api/faculty/remedial")
async def api_faculty_remedial(payload: RemedialReq):
    plan = await generate_remedial_plan(payload.concept_tag, "CSE-1C", payload.ghost_count or 1)
    slides = []
    for idx, s in enumerate(plan.get("slides", [])):
        slides.append({
            "slide_num": idx + 1,
            "slide": idx + 1,
            "heading": s.get("title", s.get("heading", f"Slide {idx+1}")),
            "content": s.get("bullet_points", [s.get("body", "")])[0] if isinstance(s.get("bullet_points"), list) and s.get("bullet_points") else s.get("body", ""),
            "body": s.get("bullet_points", [s.get("body", "")])[0] if isinstance(s.get("bullet_points"), list) and s.get("bullet_points") else s.get("body", ""),
        })
    viva = []
    for v in plan.get("viva_questions", []):
        viva.append({
            "question": v.get("q", v.get("question", "")),
            "answer": v.get("a", v.get("answer", "")),
            "q": v.get("q", v.get("question", "")),
            "a": v.get("a", v.get("answer", "")),
        })
    return {
        "concept_tag": payload.concept_tag,
        "affected_ghost_count": payload.ghost_count or 1,
        "title": plan.get("topic_title", f"Remedial Lecture: {payload.concept_tag}"),
        "slides": slides,
        "viva_questions": viva,
        "source": plan.get("source", "offline_fallback"),
    }

class ClaimReq(BaseModel):
    roll_no: str
    secret_salt: str

@app.post("/api/claim/verify")
def api_claim_verify(payload: ClaimReq):
    res = verify_placement_claim(payload.roll_no, payload.secret_salt)
    return {
        "verified": res.get("verified", False),
        "alias": res.get("alias", ""),
        "elo_rating": res.get("rating", 1200),
        "rank": res.get("percentile", 1),
        "signed_proof_hash": res.get("proof_hash", ""),
        "detail": res.get("detail", ""),
    }

@app.get("/api/leaderboard")
def api_leaderboard():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT alias, rating FROM ghost_profiles ORDER BY rating DESC LIMIT 10;")
        rows = cursor.fetchall()
        board = [
            {"rank": i + 1, "alias": r["alias"], "elo_rating": r["rating"], "human_trust_score": 100.0}
            for i, r in enumerate(rows)
        ]
        return {"leaderboard": board}
    finally:
        conn.close()

@app.get("/api/debug/schema-inspect")
def api_debug_schema_inspect():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT roll_number, registered_at FROM enrolled_roll_registry LIMIT 5;")
        students = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT ghost_hash, alias, rating FROM ghost_profiles LIMIT 5;")
        ghosts = [dict(r) for r in cursor.fetchall()]
        schemas = {}
        for t in ("enrolled_roll_registry", "ghost_profiles", "telemetry_events", "problems"):
            cursor.execute(f"PRAGMA table_info({t});")
            schemas[t] = [dict(r) for r in cursor.fetchall()]
        return {
            "verified_students_sample": students,
            "ghost_profiles_sample": ghosts,
            "schemas": schemas,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Static Files Mounting (AFTER all /api/v1/* routes to prevent route shadowing)
# ---------------------------------------------------------------------------
static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
