"""Live smoke tests against the deployed backend URL for /checkin and /submit flows.

- Uses NW-KGGN as a pre-registered seat (already checked in once).
- Does NOT hit the real LLM for /submit success (would consume quota and is rate-limited to 6/10m/IP).
  Only validates 422/404 branches and the known-already-checked-in seat on /checkin.
- Admin token is obtained via POST /api/admin/login using ADMIN_PASSWORD env var; test is skipped if
  rate-limited by the server.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
KNOWN_SEAT = "NW-KGGN"


@pytest.fixture(scope="module")
def admin_token():
    pwd = os.environ.get("ADMIN_PASSWORD")
    if not pwd:
        pytest.skip("ADMIN_PASSWORD not set")
    r = requests.post(f"{API}/admin/login", json={"password": pwd}, timeout=10)
    if r.status_code == 429:
        pytest.skip("admin login rate-limited")
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


class TestLiveCheckin:
    def test_422_bad_format(self):
        r = requests.post(f"{API}/checkin", json={"seat_code": "hello"}, timeout=10)
        assert r.status_code == 422

    def test_404_unknown(self):
        r = requests.post(f"{API}/checkin", json={"seat_code": "NW-0000"}, timeout=10)
        assert r.status_code == 404

    def test_known_seat_returns_first_name_only_no_pii(self):
        r = requests.post(f"{API}/checkin", json={"seat_code": KNOWN_SEAT}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["seat_code"] == KNOWN_SEAT
        assert isinstance(d["first_name"], str) and d["first_name"]
        assert d["already_checked_in"] is True  # per prompt, seat already checked in once
        assert "@" not in r.text  # no email leakage
        # Repeat preserves checked_in_at
        r2 = requests.post(f"{API}/checkin", json={"seat_code": KNOWN_SEAT.lower()}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["already_checked_in"] is True
        assert r2.json()["checked_in_at"] == d["checked_in_at"]


class TestLiveSubmitValidation:
    """Validation-only paths (no LLM spend)."""

    def test_404_unknown_seat_valid_body(self):
        body = {
            "seat_code": "NW-0000",
            "title": "Paper Finder",
            "description": "Students waste time finding past papers. My app uses an LLM to tag and search them. It runs on my laptop.",
            "link": None,
        }
        r = requests.post(f"{API}/submit", json=body, timeout=10)
        assert r.status_code == 404

    def test_422_title_too_short(self):
        body = {"seat_code": KNOWN_SEAT, "title": "ab", "description": "x" * 60 + ". y. z.", "link": None}
        assert requests.post(f"{API}/submit", json=body, timeout=10).status_code == 422

    def test_422_bad_link(self):
        body = {
            "seat_code": KNOWN_SEAT,
            "title": "Paper Finder",
            "description": "Students waste time finding past papers. My app uses an LLM to tag and search them. It runs on my laptop.",
            "link": "javascript:alert(1)",
        }
        assert requests.post(f"{API}/submit", json=body, timeout=10).status_code == 422


class TestLiveAdminAttendance:
    def test_attendance_requires_admin(self):
        r = requests.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 401

    def test_attendance_shape(self, admin_token):
        r = requests.get(
            f"{API}/admin/stats?include_demo=false",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        a = r.json()["attendance"]
        assert set(a.keys()) == {"checked_in", "registered", "submissions", "feedback_unavailable"}
        assert a["checked_in"] >= 1 and a["registered"] >= a["checked_in"]
        assert a["submissions"] >= 1
