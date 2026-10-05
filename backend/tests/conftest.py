"""Load backend/.env and frontend/.env so tests pick up the live BASE_URL and admin credentials."""
import os
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
for env_file in (ROOT / "backend" / ".env", ROOT / "frontend" / ".env"):
    if env_file.exists():
        for k, v in dotenv_values(env_file).items():
            if v is not None and k not in os.environ:
                os.environ[k] = v
