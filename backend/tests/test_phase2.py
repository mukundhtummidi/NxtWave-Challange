"""Phase 2 backend tests: campus reps, events, admin JWT, CSV export."""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://workshop-seat-code.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SEAT_RE = re.compile(r"^NW-[A-Z0-9]{4}$")


def _uniq_email(tag="qa"):
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
    tok = r.json().get("access_token")
    assert tok
    return tok


# ---------- Public endpoints still public ----------
class TestPublicStillPublic:
    def test_board_public(self, s):
        assert s.get(f"{API}/board").status_code == 200

    def test_config_public(self, s):
        assert s.get(f"{API}/config").status_code == 200

    def test_ticket_public_for_known_demo(self, s):
        # Grab any demo ticket from board indirectly via a seeded rep
        rep = s.get(f"{API}/reps/ANANYA-AMR").json()
        if rep.get("recent"):
            code = rep["recent"][0]["seat_code"]
            assert s.get(f"{API}/tickets/{code}").status_code == 200


# ---------- Reps ----------
class TestReps:
    def test_rep_not_found(self, s):
        r = s.get(f"{API}/reps/NOPE")
        assert r.status_code == 404

    def test_rep_ananya_shape(self, s):
        r = s.get(f"{API}/reps/ANANYA-AMR")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rep_code"] == "ANANYA-AMR"
        assert d["name"] and d["college"]
        assert d["is_demo"] is True
        assert d["total"] == d["direct"] + d["via_chain"]
        assert 1 <= d["rank"] <= d["rep_count"]
        assert d["rep_count"] == 5
        assert isinstance(d["trend"], list) and len(d["trend"]) == 14
        assert "?rep=ANANYA-AMR" in d["link"] and "utm_source=whatsapp" in d["link"]
        assert isinstance(d["recent"], list)

    def test_rep_lowercase_input_normalises(self, s):
        before = s.get(f"{API}/reps/ROHAN-VIT").json()
        p1 = {"name": "Rep Direct", "email": _uniq_email("rep1"),
              "college": "VIT-AP Amaravati", "branch": "CSE/IT", "year": "3rd",
              "interest": "Placements", "rep": "rohan-vit"}
        r1 = s.post(f"{API}/register", json=p1)
        assert r1.status_code == 201, r1.text
        seat = r1.json()["seat_code"]
        after = s.get(f"{API}/reps/ROHAN-VIT").json()
        assert after["direct"] == before["direct"] + 1, f"direct did not increase: {before['direct']} -> {after['direct']}"

        # Chain: register second person referred by first
        p2 = {"name": "Chain Person", "email": _uniq_email("rep2"),
              "college": "VIT-AP Amaravati", "branch": "CSE/IT", "year": "3rd",
              "interest": "Placements", "ref": seat}
        r2 = s.post(f"{API}/register", json=p2)
        assert r2.status_code == 201, r2.text
        assert r2.json().get("referred_by") == seat
        after2 = s.get(f"{API}/reps/ROHAN-VIT").json()
        assert after2["via_chain"] == before["via_chain"] + 1, f"via_chain did not increase: {before['via_chain']} -> {after2['via_chain']}"


# ---------- Events ----------
class TestEvents:
    def test_event_page_view_204(self, s):
        r = s.post(f"{API}/events", json={"type": "page_view", "session_id": "qa1", "path": "/"})
        assert r.status_code == 204, r.text

    def test_event_form_started_204(self, s):
        r = s.post(f"{API}/events", json={"type": "form_started", "session_id": "qa1", "path": "/"})
        assert r.status_code == 204

    def test_event_invalid_type_422(self, s):
        r = s.post(f"{API}/events", json={"type": "bogus_evt", "session_id": "qa1"})
        assert r.status_code == 422


# ---------- Admin login & auth ----------
class TestAdminAuth:
    def test_login_wrong_password_401(self, s):
        r = s.post(f"{API}/admin/login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_login_right_password_token(self, s, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_admin_stats_no_token_401(self, s):
        r = s.get(f"{API}/admin/stats")
        assert r.status_code == 401

    def test_admin_stats_with_token_shape(self, s, admin_token):
        r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d["totals"].keys()) == {"real", "demo", "all"}
        assert d["totals"]["all"] == d["totals"]["real"] + d["totals"]["demo"]
        src_names = {x["source"] for x in d["sources"]}
        for want in ["rep", "student referral", "instagram", "club", "direct"]:
            assert want in src_names, f"source bucket missing: {want}"
        assert len(d["per_day"]) == 14
        assert isinstance(d["top_colleges"], list)
        assert isinstance(d["top_reps"], list)
        # top_reps should include demo reps when include_demo=true (default)
        rep_codes = {rp["rep_code"] for rp in d["top_reps"]}
        for want_rep in ["ANANYA-AMR", "ROHAN-VIT", "PRIYA-SRM", "KARTHIK-KLU", "MEERA-GIT"]:
            assert want_rep in rep_codes, f"rep missing: {want_rep}"
        for rp in d["top_reps"]:
            if rp["rep_code"] in {"ANANYA-AMR", "ROHAN-VIT", "PRIYA-SRM", "KARTHIK-KLU", "MEERA-GIT"}:
                assert rp["is_demo"] is True
        # funnel 4 steps
        funnel_keys = [f["key"] for f in d["funnel"]]
        assert funnel_keys == ["page_view", "form_started", "registered", "share_clicked"]
        # referrals
        assert "k" in d["referrals"]
        assert "longest_chain" in d["referrals"] and "path" in d["referrals"]["longest_chain"]

    def test_admin_stats_exclude_demo(self, s, admin_token):
        r = s.get(f"{API}/admin/stats?include_demo=false",
                  headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        d = r.json()
        # totals.demo still reported
        assert d["totals"]["demo"] > 0
        # top_reps should be real-only — demo reps should have total 0 or be absent
        demo_rep_codes = {"ANANYA-AMR", "PRIYA-SRM", "KARTHIK-KLU", "MEERA-GIT"}
        for rp in d["top_reps"]:
            if rp["rep_code"] in demo_rep_codes:
                assert rp["total"] == 0, f"demo rep {rp['rep_code']} should have 0 real: {rp}"

    def test_admin_stats_tampered_token_401(self, s, admin_token):
        bad = admin_token[:-3] + "zzz"
        r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401


# ---------- CSV export ----------
class TestCsvExport:
    def test_csv_no_token_401(self, s):
        assert s.get(f"{API}/admin/export.csv").status_code == 401

    def test_csv_bad_token_401(self, s):
        r = s.get(f"{API}/admin/export.csv?token=garbage.jwt.here")
        assert r.status_code == 401

    def test_csv_with_header_token(self, s, admin_token):
        r = s.get(f"{API}/admin/export.csv", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("text/csv")
        first_line = r.text.split("\n", 1)[0]
        for want in ["seat_code", "name", "email", "college", "is_demo", "created_at"]:
            assert want in first_line, f"CSV header missing: {want}"

    def test_csv_with_query_token(self, s, admin_token):
        r = s.get(f"{API}/admin/export.csv?token={admin_token}")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
