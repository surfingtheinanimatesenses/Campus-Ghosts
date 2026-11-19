# CampusGhosts 👻

**Privacy-Preserving Competitive Developer Infrastructure, Real-Time Anti-Cheat Duel Arena & $k$-Anonymized Diagnostic Engine**

Built for hackathons and production environments, CampusGhosts runs identically on `localhost:8000` and **Vercel** (`@vercel/python`) with zero build steps.

---

## 1. Architectural Guarantees & Privacy Model

1. **Split-Table Isolation (Zero Foreign Keys)**:
   - `verified_students`: Institutional roll number and verification timestamp only.
   - `ghost_profiles`: Pseudonymous alias (`Cipher_XX`), performance ELO rating, and live human trust score. No roll numbers stored.
   - `telemetry_events`: Error concept tags and severity. Unlinked from institutional identities.
2. **One-Way Blind Commitment**:
   - `commitment_hash = SHA256(roll_number || secret_salt)`
   - Server cannot reverse the commitment hash back to the student's roll number.
3. **$k$-Anonymity Governance ($k \ge 5$)**:
   - Concept failure bottlenecks with $< 5$ distinct students are masked as `MASKED (k < 5)` in safe mode to protect student privacy from faculty de-anonymization.
4. **Tamper-Proof Placement Claim Proof**:
   - Students can verify their cohort percentile and ELO standing without revealing their duel history:
   - `proof_hash = SHA256(commitment_hash : elo_rating : "KRMU_VERIFIED")`

---

## 2. Directory Structure

```text
campusghosts-vercel/
├── main.py              # FastAPI single-origin server, REST APIs, static file routing
├── db.py                # Split-table SQLite schema, Vercel /tmp handler, 42-student seeder
├── ai_engine.py         # Multi-key Groq pooler (Llama-3.3-70B) + deterministic offline fallback
├── rating.py            # Time & memory optimization-weighted logistic ELO calculator
├── vercel.json          # Vercel Python serverless routing config (@vercel/python)
├── requirements.txt     # fastapi, uvicorn, pydantic, httpx, pytest
├── keys.example.json    # Local template for Groq API keys
├── .gitignore           # Ignores keys.json, *.db, __pycache__, .venv
├── README.md            # Deployment & architecture documentation
├── verify_system.py     # End-to-end smoke test suite (Checks A through E)
├── test_phase1.py       # Pytest unit & schema test suite (6 tests)
├── test_phase2.py       # Pytest integration & transition test suite (10 tests)
└── static/
    ├── index.html       # Dark cyberpunk split-screen God Mode UI
    ├── app.js           # Arena wiring, live heatmap updates, DB inspector, Claim Verifier
    ├── guard.js         # Anti-cheat (paste blocker, 3-strike tab/fullscreen monitor, telemetry)
    ├── replay.js        # 1v1 Ghost competitor keystroke replay & one-click demo presets
    └── vendor/          # Offline fallback libraries (Chart.js, Lucide, Tailwind CSS)
```

---

## 3. Quickstart: Running on Localhost

### Prerequisites
- Python 3.10+
- (Optional) Node.js (for `node --check` static analysis)

### Installation
```bash
cd campusghosts-vercel
pip install -r requirements.txt
```

### Configure Groq API Key (Optional)
To use Groq's `llama-3.3-70b-versatile` LLM:
```bash
# Option A: Environment Variable
export GROQ_API_KEY="gsk_your_groq_key_here"  # Linux / macOS
$env:GROQ_API_KEY="gsk_your_groq_key_here"    # Windows PowerShell

# Option B: Local keys.json file
cp keys.example.json keys.json
# Edit keys.json with your key: {"groq": ["gsk_..."]}
```
*Note: If no key is configured, CampusGhosts seamlessly uses its deterministic offline AST diagnostic engine with zero errors.*

### Start Server
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Open **`http://localhost:8000`** in any modern web browser.

---

## 4. One-Click Deployment to Vercel

CampusGhosts is pre-configured with `vercel.json` for `@vercel/python`.

### Deployment Steps:
1. **Push to GitHub** or run Vercel CLI directly:
   ```bash
   vercel
   ```
2. **Environment Variables**:
   In your Vercel Project Dashboard, navigate to **Settings > Environment Variables** and add:
   - `GROQ_API_KEY`: `gsk_your_groq_key` (optional, for live Groq Llama-3.3-70B evaluations).
3. **Serverless Filesystem Handling**:
   - `db.py` automatically detects Vercel's serverless runtime and creates `/tmp/campusghosts.db`.
   - On cold start, the database is seeded idempotently with 42 student profiles and calibrated failure telemetry.

---

## 5. Automated System Verification

Run the full automated verification harness:
```bash
python verify_system.py
```

The test harness validates:
- **CHECK A**: 16/16 pytest unit and API tests pass cleanly.
- **CHECK B**: `GET /` serves the complete dark cyberpunk God Mode UI.
- **CHECK C**: Static ES modules (`app.js`, `guard.js`, `replay.js`) serve under both `/static/*` and direct root paths.
- **CHECK D**: JavaScript ES modules pass `node --check` with 0 syntax errors.
- **CHECK E**: `vercel.json` configuration is structurally valid.

---

## 6. Demo Walkthrough & Cheat Sheet

1. **Student Commitment Auth**:
   - Default Roll Number: `2601010043`
   - Default Secret Salt: `krmu2026_salt` (or click **Random** to generate 128-bit entropy).
   - Click **Enter as Ghost** to anchor your identity.
2. **1v1 Duel Arena**:
   - Click **Start 1v1 Duel** (arms anti-cheat guard and starts phantom competitor stream).
   - Use the demo preset buttons:
     - `Load Buggy Array (k=4->5)`: Demonstrates off-by-one bug triggering $k$-anonymity threshold transition.
     - `Load Null Pointer Bug`: Triggers SIGSEGV pointer dereference diagnostic.
     - `Load Clean Solution`: Awards positive ELO optimization bonus.
3. **Anti-Cheat Guard**:
   - Try pasting into the student editor (intercepted and flagged as bot action).
   - Switch browser tabs (triggers debounce strike counter; 3 strikes disqualifies).
4. **Faculty Telemetry & K-Anonymity**:
   - Toggle **Safe View ($k \ge 5$)** vs. **Raw View** to observe `ARRAY_OUT_OF_BOUNDS` unmasking.
   - Click any cluster bar to open the automated 5-slide pedagogical remedial deck.
5. **Placement Claim Auditor**:
   - Verify any roll number + secret salt pair to generate a verifiable signed placement proof.
