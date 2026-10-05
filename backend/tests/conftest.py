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


import shutil  # noqa: E402
import subprocess  # noqa: E402
import time  # noqa: E402

import pytest  # noqa: E402
import requests  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def _fresh_rate_limits():
    """The live server keeps rate-limit counters in memory (12 registrations / 10 min / IP). The whole suite
    registers more than that from one IP, so restart the preview backend before each module to start each
    module with clean counters. Production limits are untouched. Set RESET_BACKEND_BETWEEN_MODULES=0 to skip."""
    if os.environ.get("RESET_BACKEND_BETWEEN_MODULES", "1") == "0" or not shutil.which("supervisorctl"):
        yield
        return
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
    base = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
    # The ingress can briefly return 502 right after a restart even once one request succeeds,
    # so require several consecutive healthy responses before the module starts.
    time.sleep(3)
    ok = 0
    for _ in range(80):
        try:
            ok = ok + 1 if requests.get(f"{base}/api/", timeout=3).status_code == 200 else 0
        except requests.RequestException:
            ok = 0
        if ok >= 5:
            break
        time.sleep(0.5)
    time.sleep(1)
    yield
