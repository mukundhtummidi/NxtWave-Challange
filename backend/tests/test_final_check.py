"""Final-check regression requested by main agent.

Covers:
- /api/admin/login wrong password -> 401; /api/admin/{stats,me,export.csv} no token -> 401
- /api/admin/demo-visibility, /api/admin/verify wrong PIN -> 401
- /api/register duplicate email (same + different case) -> 409
- register rate limit survives spoofed X-Forwarded-For (>12 within 10 min -> 429)
- workshop date is consistent across /api/config and /api/share/{seat}
"""
import os
import random
import string

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ADMIN_PIN = os.environ["ADMIN_PIN"]
EXPECTED_LABEL = "Sat, 17 Oct 2026 · 6:00 PM IST"
EXPECTED_START_ISO = "2026-10-17T18:00:00+05:30"


# ---------- Admin auth negative paths ----------
class TestAdminAuthNegative:
    def test_login_wrong_password_returns_401(self):
        r = requests.post(f"{BASE}/api/admin/login", json={"password": "definitely-wrong-xxx"}, timeout=10)
        assert r.status_code == 401, r.text

    def test_stats_no_token_401(self):
        assert requests.get(f"{BASE}/api/admin/stats", timeout=10).status_code == 401

    def test_me_no_token_401(self):
        assert requests.get(f"{BASE}/api/admin/me", timeout=10).status_code == 401

    def test_export_csv_no_token_401(self):
        assert requests.get(f"{BASE}/api/admin/export.csv", timeout=10).status_code == 401

    def test_demo_visibility_wrong_pin_401(self):
        r = requests.post(
            f"{BASE}/api/admin/demo-visibility",
            json={"pin": "000000", "hidden": True},
            timeout=10,
        )
        assert r.status_code == 401, r.text

    def test_verify_wrong_pin_401(self):
        r = requests.post(
            f"{BASE}/api/admin/verify",
            json={"pin": "000000", "hidden": False},
            timeout=10,
        )
        assert r.status_code == 401, r.text


# ---------- Duplicate email ----------
def _reg_payload(email: str) -> dict:
    suffix = "".join(random.choices(string.ascii_lowercase, k=4))
    return {
        "name": f"RL Dup {suffix}",
        "email": email,
        "college": "Test College of Engineering",
        "branch": "CSE/IT",
        "year": "3rd",
        "interest": "Placements",
    }


class TestDuplicateEmail:
    def test_duplicate_email_same_and_mixed_case_returns_409(self):
        suffix = "".join(random.choices(string.ascii_lowercase, k=6))
        email_lower = f"test_dup_{suffix}@example.com"
        email_mixed = email_lower.replace("test_", "TeSt_").replace("@example.com", "@Example.COM")

        r1 = requests.post(f"{BASE}/api/register", json=_reg_payload(email_lower), timeout=10)
        assert r1.status_code == 201, r1.text

        r2 = requests.post(f"{BASE}/api/register", json=_reg_payload(email_lower), timeout=10)
        assert r2.status_code == 409, r2.text

        r3 = requests.post(f"{BASE}/api/register", json=_reg_payload(email_mixed), timeout=10)
        assert r3.status_code == 409, r3.text


# ---------- Register rate limit with spoofed XFF ----------
class TestRegisterRateLimitSpoofedXFF:
    def test_spoofed_xff_cannot_bypass_rate_limit(self):
        """>12 registrations within 10 min with a different fake XFF each request still returns 429.

        We restart the backend here so the register bucket for this egress IP starts clean regardless
        of earlier test modules that also registered from the same IP.
        """
        import shutil
        import subprocess
        import time

        if shutil.which("supervisorctl"):
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
            # Wait for ingress to stabilise.
            ok = 0
            for _ in range(80):
                try:
                    if requests.get(f"{BASE}/api/", timeout=3).status_code == 200:
                        ok += 1
                    else:
                        ok = 0
                except requests.RequestException:
                    ok = 0
                if ok >= 5:
                    break
                time.sleep(0.5)
            time.sleep(1)

        results = []
        last_resp = None
        for i in range(15):
            email = f"rl_spoof_{random.randint(10**9, 10**10)}@example.com"
            payload = _reg_payload(email)
            payload["name"] = "RL Spoof"
            fake_ip = f"203.0.113.{i + 10}"  # Reserved docs block, never routable
            resp = requests.post(
                f"{BASE}/api/register",
                json=payload,
                headers={"X-Forwarded-For": fake_ip},
                timeout=10,
            )
            results.append(resp.status_code)
            last_resp = resp
            if resp.status_code == 429:
                break
        two_oh_ones = sum(1 for s in results if s == 201)
        assert 429 in results, f"Expected 429 within 15 attempts despite spoofed XFF, got {results}"
        assert two_oh_ones >= 12, (
            f"Expected at least 12 successful registrations before 429 proves the limit; got {results}. "
            "If this fails with too few 201s, prior test state consumed the per-IP bucket."
        )
        assert last_resp is not None and last_resp.status_code == 429

    @classmethod
    def teardown_class(cls):
        try:
            client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=3000)
            db = client[os.environ["DB_NAME"]]
            res = db.registrations.delete_many({"name": "RL Spoof"})
            print(f"Cleaned RL Spoof registrations: {res.deleted_count}")
        except Exception as exc:  # pragma: no cover - cleanup best-effort
            print(f"Cleanup error: {exc}")


# ---------- Workshop date consistency ----------
class TestWorkshopDateConsistency:
    def test_config_has_expected_label_and_iso(self):
        r = requests.get(f"{BASE}/api/config", timeout=10)
        assert r.status_code == 200, r.text
        ws = r.json()["workshop"]
        assert ws["datetime_label"] == EXPECTED_LABEL, ws
        assert ws["start_iso"] == EXPECTED_START_ISO, ws

    def test_share_page_contains_label(self):
        # Need an existing seat; register a throwaway one.
        email = f"share_check_{random.randint(10**9, 10**10)}@example.com"
        payload = _reg_payload(email)
        payload["name"] = "RL Spoof"  # clean up with teardown above if re-run
        reg = requests.post(f"{BASE}/api/register", json=payload, timeout=10)
        if reg.status_code != 201:
            pytest.skip(f"Could not register throwaway seat (status {reg.status_code}); rate limit interference")
        seat = reg.json()["seat_code"]
        r = requests.get(f"{BASE}/api/share/{seat}", timeout=10)
        assert r.status_code == 200, r.text
        # datetime_label is HTML-escaped (· becomes &middot;? Actually · is a safe unicode char — html.escape only escapes <>&"'). So raw string should appear.
        assert EXPECTED_LABEL in r.text, f"Expected label '{EXPECTED_LABEL}' in share page HTML"

    @classmethod
    def teardown_class(cls):
        try:
            client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=3000)
            db = client[os.environ["DB_NAME"]]
            res = db.registrations.delete_many({"name": "RL Spoof"})
            print(f"Cleaned trailing RL Spoof registrations: {res.deleted_count}")
        except Exception as exc:  # pragma: no cover
            print(f"Cleanup error: {exc}")
