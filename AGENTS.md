# CampusGhosts Workspace Agent Rules

## Subagent Model Tier Delegation
- **Main Coordinator (`inherit` / Hydrogen):** Handle architecture, complex multi-file edits (`main.py`, `ai_engine.py`, `db.py`, `static/app.js`, `static/index.html`), debugging, and final verification directly in the primary session.
- **Subagent Delegation (`flash` / `flash_lite`):** When launching `invoke_subagent` for broad codebase exploration (`research`), repetitive boilerplate edits, documentation lookups, or routine verification runs, set `Model: "flash"` (or `"flash_lite"` for trivial checks) so lightweight work does not consume heavy-tier quota.
- Keep 1–2 simple direct lookups in the main session instead of over-spawning subagents.
