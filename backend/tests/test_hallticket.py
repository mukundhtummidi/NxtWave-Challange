"""Backend tests for 'Your Hall Ticket' API."""
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://workshop-seat-code.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SEAT_RE = re.compile(r"^NW-[A-Z0-9]{4}$")


def _uniq_email(tag="qa"):
    return f"{tag}+{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- /api/config, /api/colleges, /api/projects ----------
class TestConfig:
    def test_config(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200
        data = r.json()
        assert "workshop" in data and "datetime_label" in data["workshop"]
        assert isinstance(data.get("branches"), list) and len(data["branches"]) >= 3
        assert isinstance(data.get("years"), list) and len(data["years"]) >= 2
        assert isinstance(data.get("interests"), list) and len(data["interests"]) >= 3

    def test_colleges(self, s):
        r = s.get(f"{API}/colleges")
        assert r.status_code == 200
        assert isinstance(r.json().get("colleges"), list)

    def test_projects(self, s):
        r = s.get(f"{API}/projects")
        assert r.status_code == 200
        assert isinstance(r.json().get("projects"), list)


# ---------- POST /api/register ----------
class TestRegister:
    def test_happy_path(self, s):
        payload = {
            "name": "Ravi Kumar", "email": _uniq_email("hp"),
            "college": "VIT-AP Amaravati", "branch": "CSE/IT", "year": "3rd", "interest": "Placements",
        }
        r = s.post(f"{API}/register", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert SEAT_RE.match(d["seat_code"]), d["seat_code"]
        assert d["project"]["title"] and d["project"]["pitch"] and d["project"]["variation"]
        assert isinstance(d["project"]["steps"], list) and len(d["project"]["steps"]) == 3
        assert d["share_url"].endswith(f"/api/share/{d['seat_code']}")
        assert d["ref_link"].endswith(f"/?ref={d['seat_code']}")
        assert d["story_url"].endswith(f"/api/tickets/{d['seat_code']}/story.png")

    def test_duplicate_email_409(self, s):
        email = _uniq_email("dup")
        p = {"name": "Dup User", "email": email, "college": "VIT Vellore", "branch": "CSE/IT", "year": "4th", "interest": "Startups"}
        r1 = s.post(f"{API}/register", json=p)
        assert r1.status_code == 201
        code1 = r1.json()["seat_code"]
        # Same email with different case
        p2 = {**p, "email": email.upper(), "name": "Dup User2"}
        r2 = s.post(f"{API}/register", json=p2)
        assert r2.status_code == 409, r2.text
        detail = r2.json()["detail"]
        assert isinstance(detail, dict) and detail.get("seat_code") == code1

    def test_invalid_branch_422(self, s):
        r = s.post(f"{API}/register", json={
            "name": "Bad Branch", "email": _uniq_email("badb"),
            "college": "VIT Vellore", "branch": "XYZ", "year": "3rd", "interest": "Placements",
        })
        assert r.status_code == 422

    def test_invalid_interest_422(self, s):
        r = s.post(f"{API}/register", json={
            "name": "Bad Int", "email": _uniq_email("badi"),
            "college": "VIT Vellore", "branch": "CSE/IT", "year": "3rd", "interest": "Partying",
        })
        assert r.status_code == 422

    def test_html_name_sanitized(self, s):
        r = s.post(f"{API}/register", json={
            "name": "Ravi <b>K</b>", "email": _uniq_email("san"),
            "college": "VIT Vellore", "branch": "CSE/IT", "year": "3rd", "interest": "Placements",
        })
        assert r.status_code == 201
        assert r.json()["name"] == "Ravi K"


# ---------- Referral + College normalization ----------
class TestReferralAndCollege:
    def test_referral_count_increments(self, s):
        a = s.post(f"{API}/register", json={
            "name": "Referrer A", "email": _uniq_email("rA"),
            "college": "VIT Vellore", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"}).json()
        code_a = a["seat_code"]
        b = s.post(f"{API}/register", json={
            "name": "Invitee B", "email": _uniq_email("rB"),
            "college": "VIT Vellore", "branch": "CSE/IT", "year": "3rd", "interest": "Placements",
            "ref": code_a}).json()
        assert b.get("referred_by") == code_a
        r = s.get(f"{API}/tickets/{code_a}")
        assert r.status_code == 200
        assert r.json().get("referral_count") == 1

    def test_ref_nonexistent_code(self, s):
        r = s.post(f"{API}/register", json={
            "name": "No Ref", "email": _uniq_email("nr"),
            "college": "VIT Vellore", "branch": "CSE/IT", "year": "3rd", "interest": "Placements",
            "ref": "NW-ZZZZ"}).json()
        assert r.get("referred_by") in (None, "")

    def test_college_normalization(self, s):
        a = s.post(f"{API}/register", json={
            "name": "C One", "email": _uniq_email("c1"),
            "college": "Amrita Amaravati", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"}).json()
        b = s.post(f"{API}/register", json={
            "name": "C Two", "email": _uniq_email("c2"),
            "college": "amrita vishwa vidyapeetham amaravati", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"}).json()
        assert a["college"] == "Amrita Vishwa Vidyapeetham, Amaravati"
        assert b["college"] == "Amrita Vishwa Vidyapeetham, Amaravati"
        # Board should have only one row for that key
        board = s.get(f"{API}/board").json()
        matching = [it for it in board["items"] if it["college"] == "Amrita Vishwa Vidyapeetham, Amaravati"]
        assert len(matching) == 1


# ---------- Tickets endpoints ----------
@pytest.fixture(scope="module")
def shared_ticket(s):
    """Create one ticket for png/share tests; retry/skip if rate-limited."""
    for i in range(3):
        r = s.post(f"{API}/register", json={
            "name": "Shareable User", "email": _uniq_email(f"sh{i}"),
            "college": "KL University", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"})
        if r.status_code == 201:
            return r.json()
    pytest.skip("Rate limited — cannot create shared ticket")


class TestTickets:
    def test_not_found(self, s):
        r = s.get(f"{API}/tickets/NW-ZZZZ")
        assert r.status_code == 404

    def test_og_and_story_png(self, s, shared_ticket):
        code = shared_ticket["seat_code"]
        og = s.get(f"{API}/tickets/{code}/og.png")
        assert og.status_code == 200
        assert og.headers.get("content-type", "").startswith("image/png")
        assert len(og.content) > 500
        story = s.get(f"{API}/tickets/{code}/story.png")
        assert story.status_code == 200
        assert story.headers.get("content-type", "").startswith("image/png")

    def test_share_html(self, s, shared_ticket):
        code = shared_ticket["seat_code"]
        r = s.get(f"{API}/share/{code}")
        assert r.status_code == 200
        html = r.text
        assert 'property="og:title"' in html
        assert "Shareable User" in html
        assert "KL University" in html
        assert "og:image" in html and f"/api/tickets/{code}/og.png" in html
        assert f"/?ref={code}" in html  # humans land on the registration form carrying the referral
        assert f"/ticket/{code}" not in html  # no longer sent to the ticket page
        assert "refresh" in html.lower()


# ---------- Board + Admin ----------
class TestBoard:
    def test_board_default(self, s):
        r = s.get(f"{API}/board")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["items"], list)
        counts = [i["count"] for i in d["items"]]
        assert counts == sorted(counts, reverse=True)
        for i, item in enumerate(d["items"]):
            assert item["rank"] == i + 1
            assert 0 <= item["pct"] <= 100
            assert "unlocked" in item and "demo_count" in item
        assert d["has_demo"] is True

    def test_admin_wrong_pin(self, s):
        r = s.post(f"{API}/admin/demo-visibility", json={"pin": "0000", "hidden": True})
        assert r.status_code == 401

    def test_admin_hide_and_restore(self, s):
        r = s.post(f"{API}/admin/demo-visibility", json={"pin": os.environ.get("ADMIN_PIN", ""), "hidden": True})
        assert r.status_code == 200 and r.json()["demo_hidden"] is True
        board = s.get(f"{API}/board").json()
        assert board["demo_hidden"] is True
        assert all(it["demo_count"] == 0 for it in board["items"])
        # Restore
        r2 = s.post(f"{API}/admin/demo-visibility", json={"pin": os.environ.get("ADMIN_PIN", ""), "hidden": False})
        assert r2.status_code == 200 and r2.json()["demo_hidden"] is False
        board2 = s.get(f"{API}/board").json()
        assert board2["demo_hidden"] is False
