# CampusGhosts

## Niche Problem Statement & Tracks

* **Primary Tracks:** Track 03 (Smart Education) & Track 04 (Cybersecurity / Privacy)

* **Niche Problem Statement:** Privacy-Preserving Coding Assessment & Anti-Cheat Classroom Telemetry — eliminating first-year "Leaderboard Anxiety" and LLM copy-pasting in programming labs while giving faculty real-time, mathematically anonymized visibility into batch-wide conceptual bottlenecks without singling out individual students.

---

## Complete Feature & Technical Point List

### 1. Cryptographic Blind Identity Commitments (Split-Table SQLite)
* Strips university roll numbers via `SHA-256(Roll_No || Secret_Salt)` into untraceable aliases (e.g., `Cipher_99`).
* Stores enrollment verification (`verified_students`) and coding activity (`ghost_profiles`) in unlinked tables with zero foreign keys or join columns.

### 2. Side-by-Side 1v1 Live Duel Arena
* Split-screen C++/Python coding arena displaying the active student's editor alongside a live peer competitor's real-time code progression.

### 3. Behavioral Anti-Cheat & Bot Detection Guard
* **Copy-Paste & Drop Blocker:** Intercepts and blocks `paste`, `drop`, and `Ctrl+V` events inside the code editor to stop AI copy-pasting.
* **3-Strike Tab & Fullscreen Enforcement:** Tracks tab switches, window blurs, and fullscreen exits during active matches; 3 strikes disqualify the session and deduct ELO rating.
* **Human vs. Bot Telemetry:** Analyzes mouse pointer direction shifts, cursor velocity variance, and keystroke flight intervals to compute a live Human Trust Score (`0–100%`).

### 4. Time & Memory Optimization-Weighted ELO Engine
* Updates leaderboard ratings dynamically based on match outcome ($S$ vs. expected score $E$) plus normalized execution time and memory efficiency:

$$\Delta R = \text{round}\left(32(S - E) + 10\left(\frac{T_{\max} - T_{\text{used}}}{T_{\max}} + \frac{M_{\max} - M_{\text{used}}}{M_{\max}}\right)\right)$$

### 5. Structured AI Socratic Code Coach (With Offline Fallback)
* Round-robins across pooled Groq (`Llama-3.3-70B`) API keys, falling back to deterministic local regex/AST rules if offline.
* Outputs strict JSON bug tags (`POINTER_DEREF_NULL`, `ARRAY_OUT_OF_BOUNDS`, `LOOP_INFINITE_BOUND`, `RECURSION_NO_BASE`) and delivers a 2-line Socratic hint without revealing solution code.

### 6. $k$-Anonymous Faculty Bottleneck Heatmap ($k \ge 5$)
* Enforces `HAVING COUNT(DISTINCT commitment_hash) >= 5` in SQL so failing micro-concepts are only revealed to professors when at least 5 distinct students struggle—preventing individual singling-out.
* Includes a live **Safe View ($k \ge 5$)** vs. **Raw DB Audit** toggle for live verification.

### 7. 1-Click AI Remedial Lecture & Viva Generator
* Converts the top aggregated batch failure tag into a 10-minute, 5-slide remedial lecture outline and 3 viva questions for the professor's next class.

### 8. Cryptographic Placement Claim Verifier
* Allows high-ranking students to prove ownership of their Ghost alias to the Placement Cell by recomputing `SHA-256(Roll_No || Secret_Salt)` and exporting a signed verification hash—while keeping early failed attempts permanently private.

---

## CampusGhosts Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend & Runtime** | Python, FastAPI (single-origin REST API & static file server), Uvicorn (local), Vercel Python Serverless Runtime (`@vercel/python`) |
| **Database & Privacy Layer** | SQLite3 (unlinked split-table schema with zero foreign keys; `/tmp` ephemeral storage on Vercel, local `.db` file offline), SQL `HAVING COUNT(DISTINCT commitment_hash) >= 5` $k$-anonymity aggregation guard, Python `hashlib` SHA-256 salted commitments |
| **AI & Diagnostic Stack** | Groq API (`llama-3.3-70b-versatile`) via an async round-robin multi-key pooler (`httpx`), backed by a deterministic offline regex/AST rule engine |
| **Frontend & Visualization** | Vanilla HTML5, ES6+ JavaScript modules (`app.js`, `guard.js`, `replay.js`), Tailwind CSS (CDN), Chart.js (CDN) for real-time faculty heatmaps |
| **Client-Side Anti-Cheat Telemetry** | Native browser event listeners (`paste` / `drop` interception, debounced `visibilitychange` / `blur` / `fullscreenchange` 3-strike tracker, `mousemove` angular velocity + `keydown` flight-time scoring) |
| **Deployment & Testing** | GitHub + Vercel CI/CD (`vercel.json`), `pytest`, FastAPI `TestClient` for automated end-to-end verification |
