"""/api/admin-demo/stats is public, read-only and must expose demo data only — never a real registration."""
import json
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
DEMO_REPS = {"ANANYA-AMR", "ROHAN-VIT", "PRIYA-SRM", "KARTHIK-KLU", "MEERA-GIT"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def demo_stats(s):
    r = s.get(f"{API}/admin-demo/stats")
    assert r.status_code == 200, r.text
    return r.json()


class TestAdminDemoPublic:
    def test_no_auth_needed(self, s):
        assert s.get(f"{API}/admin-demo/stats").status_code == 200

    def test_admin_still_locked(self, s):
        assert s.get(f"{API}/admin/stats").status_code == 401
        assert s.get(f"{API}/admin/export.csv").status_code == 401

    def test_same_shape_as_admin(self, demo_stats):
        for key in ["totals", "sources", "per_day", "top_colleges", "top_reps", "funnel", "funnel_window_days", "shares_by_tone", "referrals", "demo_only"]:
            assert key in demo_stats, f"missing {key}"
        assert demo_stats["demo_only"] is True
        assert len(demo_stats["per_day"]) == 14
        assert [f["key"] for f in demo_stats["funnel"]] == ["page_view", "form_started", "registered", "share_clicked"]

    def test_totals_are_demo_only(self, demo_stats):
        t = demo_stats["totals"]
        assert t["real"] == 0
        assert t["demo"] > 0 and t["all"] == t["demo"]

    def test_only_demo_reps(self, demo_stats):
        assert demo_stats["top_reps"], "demo reps expected"
        for rp in demo_stats["top_reps"]:
            assert rp["is_demo"] is True
            assert rp["rep_code"] in DEMO_REPS

    def test_tones_demo_only(self, demo_stats):
        tones = demo_stats["shares_by_tone"]
        assert tones["real_total"] == 0 and tones["real_untagged"] == 0
        assert all(r["total"] == 0 for r in tones["real"])
        assert tones["demo_total"] > 0

    def test_colleges_all_have_demo_rows_only(self, demo_stats):
        for c in demo_stats["top_colleges"]:
            assert c["count"] == c["demo_count"], f"real rows leaked into {c}"

    def test_no_pii_fields_anywhere(self, demo_stats):
        dump = json.dumps(demo_stats).lower()
        # The real guarantee: no email address or raw email field may leak. (The "email" share
        # channel is a platform name, not PII, so we check for actual addresses via "@".)
        assert "@" not in dump, "an email address leaked into the public demo stats"
        assert "@example.com" not in dump


class TestAdminDemoExposesNoRealRegistration:
    def test_fresh_real_registration_is_invisible(self, s):
        """Register a real student with unmistakable markers and prove none of them reach /admin-demo/stats."""
        marker = uuid.uuid4().hex[:8]
        name = f"Zqvx{marker} Realperson"
        email = f"real-{marker}@example.com"
        college = "IIT Bombay"  # not one of the demo colleges
        r = s.post(f"{API}/register", json={"name": name, "email": email, "college": college, "branch": "CSE/IT", "year": "4th", "interest": "Startups"})
        assert r.status_code == 201, r.text
        seat = r.json()["seat_code"]

        d = s.get(f"{API}/admin-demo/stats").json()
        dump = json.dumps(d)
        assert marker not in dump and name not in dump and email not in dump
        assert seat not in dump, "real seat code leaked (e.g. via longest referral chain)"
        assert all(c["college"] != college for c in d["top_colleges"])
        assert d["totals"]["real"] == 0
        # ... while the locked admin endpoint does count it
        assert s.get(f"{API}/admin/stats").status_code == 401
