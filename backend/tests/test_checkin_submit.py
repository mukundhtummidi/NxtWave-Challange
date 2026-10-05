"""/api/checkin and /api/submit: validation, attendance count, and the LLM failure path.

The failure path runs the app in-process (TestClient) with feedback.score_submission patched to fail,
so it never spends LLM credits and is deterministic. It asserts the submission is saved and that no
score is invented.
"""
import json
import os
import uuid

import pytest
import requests
from fastapi.testclient import TestClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
GOOD_DESC = "Students waste time finding past papers. My app uses an LLM to tag and search them. It runs on my laptop."


@pytest.fixture(scope="module")
def app_client():
    import server

    with TestClient(server.app) as c:
        yield c, server


@pytest.fixture(scope="module")
def seat(app_client):
    c, _ = app_client
    r = c.post("/api/register", json={"name": "Checkin Tester", "email": f"ci-{uuid.uuid4().hex[:10]}@example.com", "college": "KL University", "branch": "CSE/IT", "year": "3rd", "interest": "Placements"})
    assert r.status_code == 201, r.text
    return r.json()["seat_code"]


def _submit(c, seat, **over):
    body = {"seat_code": seat, "title": "Paper Finder", "description": GOOD_DESC, "link": None, **over}
    return c.post("/api/submit", json=body)


class TestCheckin:
    def test_bad_format_422(self, app_client):
        c, _ = app_client
        assert c.post("/api/checkin", json={"seat_code": "hello"}).status_code == 422

    def test_unknown_seat_404(self, app_client):
        c, _ = app_client
        assert c.post("/api/checkin", json={"seat_code": "NW-0000"}).status_code == 404

    def test_checkin_once_then_already(self, app_client, seat):
        c, _ = app_client
        r1 = c.post("/api/checkin", json={"seat_code": seat.lower()})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["seat_code"] == seat and d1["already_checked_in"] is False and d1["first_name"] == "Checkin"
        assert "Tester" not in r1.text and "@" not in r1.text
        r2 = c.post("/api/checkin", json={"seat_code": seat})
        assert r2.json()["already_checked_in"] is True
        assert r2.json()["checked_in_at"] == d1["checked_in_at"]

    def test_admin_attendance_count(self, app_client, seat):
        c, server = app_client
        token = server.create_admin_token()
        r = c.get("/api/admin/stats?include_demo=false", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        a = r.json()["attendance"]
        assert set(a) == {"checked_in", "registered", "submissions", "feedback_unavailable"}
        assert a["checked_in"] >= 1 and a["registered"] >= a["checked_in"]

    def test_attendance_requires_admin(self, app_client):
        c, _ = app_client
        assert c.get("/api/admin/stats").status_code == 401


class TestSubmitValidation:
    @pytest.mark.parametrize(
        "over,needle",
        [
            ({"seat_code": "bad"}, "Seat codes"),
            ({"title": "ab"}, "title"),
            ({"title": "x" * 101}, "title"),
            ({"description": "Too short."}, "too short"),
            ({"description": ("A" * 300 + ". ") * 2 + "B" * 10 + "."}, "600"),
            ({"description": "One is here. Two is here. Three is here. Four is here."}, "3 sentences"),
            ({"link": "javascript:alert(1)"}, "http"),
            ({"link": "not a url"}, "http"),
        ],
    )
    def test_rejects(self, app_client, seat, over, needle, monkeypatch):
        c, server = app_client
        called = []

        async def spy(*a, **k):
            called.append(1)
            return None

        monkeypatch.setattr(server, "score_submission", spy)
        r = _submit(c, seat, **over)
        assert r.status_code == 422, r.text
        assert needle.lower() in json.dumps(r.json()).lower()
        assert not called, "LLM must not be called for invalid input"

    def test_unknown_seat_404(self, app_client, monkeypatch):
        c, server = app_client
        monkeypatch.setattr(server, "score_submission", lambda *a, **k: None)
        assert _submit(c, "NW-0000").status_code == 404


class TestSubmitFailurePath:
    def test_llm_failure_saves_and_reports_unavailable(self, app_client, seat, monkeypatch):
        c, server = app_client

        async def boom(*a, **k):
            return None  # what score_submission returns on any failure

        monkeypatch.setattr(server, "score_submission", boom)
        r = _submit(c, seat, link="https://example.com/demo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["saved"] is True and d["feedback_status"] == "unavailable" and d["feedback"] is None
        assert "unavailable" in d["message"].lower()
        assert d["title"] == "Paper Finder" and d["link"] == "https://example.com/demo"
        # Persisted (verified through the admin count, which reads the submissions collection)
        token = server.create_admin_token()
        a = c.get("/api/admin/stats?include_demo=false", headers={"Authorization": f"Bearer {token}"}).json()["attendance"]
        assert a["submissions"] >= 1 and a["feedback_unavailable"] >= 1

    def test_real_score_submission_handles_exception(self, monkeypatch):
        import asyncio

        import feedback

        async def raise_it(prompt):
            raise RuntimeError("network down")

        monkeypatch.setattr(feedback, "_ask", raise_it)
        assert asyncio.run(feedback.score_submission("t", "d", None)) is None

    def test_success_shape_when_model_ok(self, app_client, seat, monkeypatch):
        c, server = app_client
        import feedback

        fake = feedback.parse_feedback('{"scores":{"clear_problem":3,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["Good problem.","Show a demo."]}')

        async def ok(*a, **k):
            return fake

        monkeypatch.setattr(server, "score_submission", ok)
        d = _submit(c, seat).json()
        assert d["feedback_status"] == "ok"
        assert d["feedback"]["total"] == 10 and d["feedback"]["max_total"] == 16
        assert d["note"] == "Automated feedback, may be wrong"


class TestParseFeedbackNeverInvents:
    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "sorry, I can't",
            "{not json}",
            '{"scores":{"clear_problem":3,"uses_ai":2,"working_demo":1},"feedback":["a","b"]}',  # missing criterion
            '{"scores":{"clear_problem":5,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["a","b"]}',  # out of range
            '{"scores":{"clear_problem":0,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["a","b"]}',
            '{"scores":{"clear_problem":"3","uses_ai":2,"working_demo":1,"originality":4},"feedback":["a","b"]}',  # string
            '{"scores":{"clear_problem":2.5,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["a","b"]}',  # float
            '{"scores":{"clear_problem":true,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["a","b"]}',  # bool
            '{"scores":{"clear_problem":3,"uses_ai":2,"working_demo":1,"originality":4},"feedback":["only one"]}',
        ],
    )
    def test_invalid_returns_none(self, raw):
        import feedback

        assert feedback.parse_feedback(raw) is None

    def test_valid_with_code_fence(self):
        import feedback

        r = feedback.parse_feedback('```json\n{"scores":{"clear_problem":4,"uses_ai":4,"working_demo":3,"originality":2},"feedback":["x","y"]}\n```')
        assert r and r["total"] == 13 and [s["key"] for s in r["scores"]] == ["clear_problem", "uses_ai", "working_demo", "originality"]


class TestLiveEndpointsReachable:
    """Light checks against the running server (no LLM call: invalid inputs only)."""

    def test_live_checkin_validation(self):
        assert requests.post(f"{API}/checkin", json={"seat_code": "zzz"}).status_code == 422

    def test_live_submit_validation(self):
        r = requests.post(f"{API}/submit", json={"seat_code": "NW-0000", "title": "ok title", "description": "short", "link": None})
        assert r.status_code in (404, 422)
