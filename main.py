"""
main.py - Single-Origin Server & Vercel Entrypoint for CampusGhosts.

Exports the FastAPI 'app' instance initialized in backend.main.
Runs identically on localhost:8000 and Vercel (@vercel/python).
"""

from pathlib import Path
import sys

# Ensure backend directory is on sys.path
_root = Path(__file__).resolve().parent
_backend_dir = _root / "backend"
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from backend.main import app
