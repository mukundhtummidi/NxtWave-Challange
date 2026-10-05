"""Register rate limit. Lives in its own module named to sort last so it does not starve other modules
of the 12 registrations / 10 min / IP budget. Run the suite serially (-n 0) after a backend restart."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _uniq_email(tag="qa"):
    return f"{tag}+{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Rate limit (RUN LAST) ----------
class TestRateLimitLast:
    def test_rate_limit_429(self, s):
        got_429 = False
        for i in range(20):
            r = s.post(f"{API}/register", json={
                "name": f"RL User {i}", "email": _uniq_email(f"rl{i}"),
                "college": "KL University", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"})
            if r.status_code == 429:
                got_429 = True
                break
            time.sleep(0.05)
        assert got_429, "Expected 429 after >12 attempts/10min from same IP"
