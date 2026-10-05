"""Multi-platform sharing + per-platform referral tracking:
- share page redirect target (form with ref+via, never /ticket/)
- `via` capture on register -> stored as share_channel (unknown -> null)
- `channel` validation on share_clicked events (unknown -> 422)
- "Shares and registrations by platform" admin panel + CSV column.
"""
import csv
import io
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SEAT_RE = re.compile(r"^NW-[A-Z0-9]{4}$")

CHANNELS = ["whatsapp", "telegram", "linkedin", "x", "facebook", "instagram", "email", "native", "copy"]
PLATFORM_ROW_KEYS = {"channel", "label", "real_shares", "real_regs", "demo_shares", "demo_regs"}


def _uniq_email(tag="chan"):
    return f"{tag}+{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register(s, **extra):
    payload = {
        "name": "Via Tester",
        "email": _uniq_email(),
        "college": "VIT-AP Amaravati",
        "branch": "CSE/IT",
        "year": "3rd",
        "interest": "Placements",
    }
    payload.update(extra)
    r = s.post(f"{API}/register", json=payload)
    assert r.status_code == 201, r.text
    seat = r.json()["seat_code"]
    assert SEAT_RE.match(seat)
    return seat


def _platforms(s, token, include_demo=True):
    r = s.get(f"{API}/admin/stats?include_demo={'true' if include_demo else 'false'}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return {p["channel"]: p for p in r.json()["by_platform"]["platforms"]}


def _csv_rows(s, token):
    r = s.get(f"{API}/admin/export.csv", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return list(csv.DictReader(io.StringIO(r.text)))


# ---------- Share page redirect target ----------
class TestShareRedirect:
    @pytest.fixture(scope="class")
    def seat(self, s):
        return _register(s)

    def test_redirect_to_form_with_via(self, s, seat):
        r = s.get(f"{API}/share/{seat}?via=whatsapp")
        assert r.status_code == 200, r.text
        assert f"/?ref={seat}&via=whatsapp" in r.text, r.text[:400]
        assert f"/ticket/{seat}" not in r.text  # must NOT send humans to the ticket page

    def test_redirect_without_via(self, s, seat):
        r = s.get(f"{API}/share/{seat}")
        assert r.status_code == 200
        assert f"/?ref={seat}" in r.text
        assert "&via=" not in r.text
        assert f"/ticket/{seat}" not in r.text

    def test_unknown_via_dropped(self, s, seat):
        r = s.get(f"{API}/share/{seat}?via=sarcastic")
        assert r.status_code == 200
        assert f"/?ref={seat}" in r.text
        assert "via=" not in r.text  # invalid platform must not leak into the redirect

    def test_unknown_seat_404_to_home(self, s):
        r = s.get(f"{API}/share/NW-0000")
        assert r.status_code == 404
        assert "url=" in r.text and "/ticket/" not in r.text


# ---------- Channel validation on events ----------
class TestChannelValidation:
    @pytest.mark.parametrize("channel", CHANNELS)
    def test_valid_channel_204(self, s, channel):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"ch-{uuid.uuid4().hex[:6]}", "path": "/ticket", "channel": channel})
        assert r.status_code == 204, r.text

    def test_channel_case_insensitive(self, s):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"ch-{uuid.uuid4().hex[:6]}", "channel": "WhatsApp"})
        assert r.status_code == 204, r.text

    def test_invalid_channel_422(self, s):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"ch-{uuid.uuid4().hex[:6]}", "channel": "pigeon"})
        assert r.status_code == 422
        assert "channel" in r.text.lower()

    def test_channel_optional(self, s):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"ch-{uuid.uuid4().hex[:6]}", "path": "/ticket"})
        assert r.status_code == 204

    def test_channel_with_tone_together(self, s):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"ch-{uuid.uuid4().hex[:6]}", "tone": "casual", "channel": "telegram"})
        assert r.status_code == 204, r.text


# ---------- via capture on register -> share_channel ----------
class TestViaCapture:
    def test_via_stored_in_csv_and_platform_regs(self, s, admin_token):
        before = _platforms(s, admin_token)["telegram"]["real_regs"]
        seat = _register(s, via="telegram")
        rows = {row["seat_code"]: row for row in _csv_rows(s, admin_token)}
        assert "share_channel" in next(iter(rows.values())), "CSV must have a share_channel column"
        assert rows[seat]["share_channel"] == "telegram"
        after = _platforms(s, admin_token)["telegram"]["real_regs"]
        assert after == before + 1, f"telegram real_regs {before} -> {after}"

    def test_unknown_via_stored_as_null(self, s, admin_token):
        seat = _register(s, via="pigeon")
        rows = {row["seat_code"]: row for row in _csv_rows(s, admin_token)}
        assert rows[seat]["share_channel"] in ("", None), f"unknown via should be null, got {rows[seat]['share_channel']!r}"

    def test_share_event_increments_platform_shares(self, s, admin_token):
        before = _platforms(s, admin_token)["facebook"]["real_shares"]
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": f"fb-{uuid.uuid4().hex[:6]}", "path": "/ticket", "channel": "facebook"})
        assert r.status_code == 204
        after = _platforms(s, admin_token)["facebook"]["real_shares"]
        assert after == before + 1, f"facebook real_shares {before} -> {after}"


# ---------- by_platform panel shape ----------
class TestByPlatformShape:
    def test_shape_and_note(self, s, admin_token):
        r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        bp = r.json()["by_platform"]
        assert bp["note"] == "Counts only. A share click does not mean the message was sent."
        channels = {p["channel"] for p in bp["platforms"]}
        assert channels == set(CHANNELS)
        for p in bp["platforms"]:
            assert set(p.keys()) == PLATFORM_ROW_KEYS
            for k in ("real_shares", "real_regs", "demo_shares", "demo_regs"):
                assert isinstance(p[k], int) and p[k] >= 0

    def test_exclude_demo_zeros_demo_side(self, s, admin_token):
        r = s.get(f"{API}/admin/stats?include_demo=false", headers={"Authorization": f"Bearer {admin_token}"})
        bp = {p["channel"]: p for p in r.json()["by_platform"]["platforms"]}
        assert sum(p["demo_shares"] + p["demo_regs"] for p in bp.values()) == 0

    def test_admin_demo_has_demo_platform_data(self, s):
        r = s.get(f"{API}/admin-demo/stats")
        assert r.status_code == 200, r.text
        platforms = r.json()["by_platform"]["platforms"]
        # demo side is seeded evenly across channels
        assert sum(p["demo_shares"] for p in platforms) > 0, "demo platform shares should be seeded"
        assert sum(p["demo_regs"] for p in platforms) > 0, "demo registrations with a channel should be seeded"
        # public demo page never exposes real data
        assert sum(p["real_shares"] + p["real_regs"] for p in platforms) == 0
