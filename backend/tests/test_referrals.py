"""Referral features: GET /api/tickets/{code}/referrals and board top_referrers.
Core guarantee under test: email and surname never leave these APIs.
"""
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
SEAT_RE = re.compile(r"^NW-[A-Z0-9]{4}$")

OWNER_SURNAME = "Zqvxsurname"
FRIEND_SURNAME = "Wbqxsurname"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _email(tag):
    return f"{tag}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def owner_with_referral(s):
    """Register an owner + one friend referred by them, using unmistakable emails/surnames."""
    owner_email = _email("refowner")
    r = s.post(f"{API}/register", json={"name": f"Owneronly {OWNER_SURNAME}", "email": owner_email, "college": "KL University", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"})
    assert r.status_code == 201, r.text
    seat = r.json()["seat_code"]
    friend_email = _email("reffriend")
    r2 = s.post(f"{API}/register", json={"name": f"Friendfirst {FRIEND_SURNAME}", "email": friend_email, "college": "KL University", "branch": "ECE/EEE", "year": "4th", "interest": "Startups", "ref": seat})
    assert r2.status_code == 201, r2.text
    assert r2.json().get("referred_by") == seat
    return {"seat": seat, "owner_email": owner_email, "friend_email": friend_email}


class TestReferralsEndpoint:
    def test_shape_and_count(self, s, owner_with_referral):
        seat = owner_with_referral["seat"]
        r = s.get(f"{API}/tickets/{seat}/referrals")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["seat_code"] == seat
        assert d["count"] >= 1
        assert d["goal"] == 25
        assert d["college_count"] >= 2  # owner + friend at KL University
        assert isinstance(d["referrals"], list) and len(d["referrals"]) == d["count"]
        for row in d["referrals"]:
            assert set(row.keys()) == {"first_name", "college", "created_at"}

    def test_only_first_name_no_surname(self, s, owner_with_referral):
        seat = owner_with_referral["seat"]
        d = s.get(f"{API}/tickets/{seat}/referrals").json()
        names = [row["first_name"] for row in d["referrals"]]
        assert "Friendfirst" in names
        assert all(FRIEND_SURNAME not in n for n in names), f"surname leaked: {names}"

    def test_no_email_or_surname_in_payload(self, s, owner_with_referral):
        seat = owner_with_referral["seat"]
        body = s.get(f"{API}/tickets/{seat}/referrals").text
        assert "@" not in body, "an email address leaked from the referrals API"
        assert owner_with_referral["friend_email"] not in body
        assert owner_with_referral["owner_email"] not in body
        assert FRIEND_SURNAME not in body and OWNER_SURNAME not in body
        assert '"email"' not in body.lower()

    def test_unknown_seat_404(self, s):
        r = s.get(f"{API}/tickets/NW-0000/referrals")
        assert r.status_code == 404


class TestBoardTopReferrers:
    def test_present_and_shape(self, s, owner_with_referral):
        r = s.get(f"{API}/board")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "top_referrers" in d
        tr = d["top_referrers"]
        assert isinstance(tr, list) and len(tr) <= 10
        for row in tr:
            assert set(row.keys()) == {"seat_code", "first_name", "college", "count", "is_demo"}
            assert SEAT_RE.match(row["seat_code"])
            assert row["count"] >= 1

    def test_no_email_or_surname_in_board(self, s, owner_with_referral):
        body = s.get(f"{API}/board").text
        assert "@" not in body, "an email address leaked from the board API"
        assert owner_with_referral["owner_email"] not in body
        assert FRIEND_SURNAME not in body and OWNER_SURNAME not in body

    def test_our_owner_appears(self, s, owner_with_referral):
        seat = owner_with_referral["seat"]
        tr = s.get(f"{API}/board").json()["top_referrers"]
        mine = [row for row in tr if row["seat_code"] == seat]
        # The owner may or may not be in the TOP 10 depending on demo data, but if present
        # it must show only the first name and be real (not demo).
        for row in mine:
            assert row["first_name"] == "Owneronly"
            assert row["is_demo"] is False


class TestConfigStartIso:
    def test_start_iso_exposed(self, s):
        w = s.get(f"{API}/config").json()["workshop"]
        assert "start_iso" in w and w["start_iso"].startswith("2026-10-17T18:00:00")
        assert w["duration_minutes"] == 60

    def test_label_matches_start_iso(self, s):
        from datetime import datetime, timedelta

        w = s.get(f"{API}/config").json()["workshop"]
        d = datetime.fromisoformat(w["start_iso"])
        assert d.utcoffset() == timedelta(hours=5, minutes=30), "start_iso must be in IST"
        assert w["datetime_label"] == "Sat, 17 Oct 2026 · 6:00 PM IST"


class TestTicketReferralsPrivacy:
    def test_ticket_endpoint_has_no_email(self, s, owner_with_referral):
        body = s.get(f"{API}/tickets/{owner_with_referral['seat']}").text
        assert "@" not in body and '"email' not in body.lower()

    def test_demo_rows_respect_hide_toggle(self, s):
        pin = os.environ.get("ADMIN_PIN")
        if not pin:
            pytest.skip("ADMIN_PIN not set")
        try:
            assert s.post(f"{API}/admin/demo-visibility", json={"pin": pin, "hidden": True}).status_code == 200
            tr = s.get(f"{API}/board").json()["top_referrers"]
            assert all(row["is_demo"] is False for row in tr)
        finally:
            s.post(f"{API}/admin/demo-visibility", json={"pin": pin, "hidden": False})
        tr = s.get(f"{API}/board").json()["top_referrers"]
        assert any(row["is_demo"] for row in tr), "demo referrers should be back when toggle is off"
