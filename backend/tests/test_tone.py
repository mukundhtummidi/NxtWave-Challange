"""Tone tracking on share_clicked / message_copied events + 'Shares by tone' admin stats."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
TONES = ["casual", "placement", "funny"]
TONE_EVENTS = ["share_clicked", "message_copied"]
ROW_KEYS = {"tone", "label", "shares", "copies", "total", "pct"}


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


def _stats(s, token, include_demo=True):
    r = s.get(f"{API}/admin/stats?include_demo={'true' if include_demo else 'false'}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return r.json()["shares_by_tone"]


def _rows(block, side="real"):
    return {row["tone"]: row for row in block[side]}


def _sid(tag):
    return f"qa-{tag}-{uuid.uuid4().hex[:6]}"


class TestToneValidation:
    @pytest.mark.parametrize("ev_type", TONE_EVENTS)
    @pytest.mark.parametrize("tone", TONES)
    def test_valid_tone_204(self, s, ev_type, tone):
        r = s.post(f"{API}/events", json={"type": ev_type, "session_id": _sid("ok"), "path": "/ticket", "tone": tone})
        assert r.status_code == 204, r.text

    def test_tone_case_insensitive(self, s):
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": _sid("case"), "tone": "Casual"})
        assert r.status_code == 204, r.text

    @pytest.mark.parametrize("ev_type", TONE_EVENTS)
    def test_invalid_tone_422(self, s, ev_type):
        r = s.post(f"{API}/events", json={"type": ev_type, "session_id": _sid("bad"), "tone": "sarcastic"})
        assert r.status_code == 422
        assert "tone" in r.text.lower()

    @pytest.mark.parametrize("ev_type", TONE_EVENTS)
    def test_without_tone_still_accepted(self, s, ev_type):
        r = s.post(f"{API}/events", json={"type": ev_type, "session_id": _sid("none"), "path": "/ticket"})
        assert r.status_code == 204

    def test_tone_ignored_on_other_event_types(self, s):
        # Other event types are unchanged: a bogus tone must not make them fail.
        r = s.post(f"{API}/events", json={"type": "page_view", "session_id": _sid("pv"), "path": "/", "tone": "sarcastic"})
        assert r.status_code == 204, r.text
        r = s.post(f"{API}/events", json={"type": "form_started", "session_id": _sid("fs"), "path": "/", "tone": "casual"})
        assert r.status_code == 204, r.text

    def test_unknown_event_type_still_422(self, s):
        r = s.post(f"{API}/events", json={"type": "bogus_evt", "session_id": "qa1", "tone": "casual"})
        assert r.status_code == 422


class TestToneStats:
    def test_shape(self, s, admin_token):
        b = _stats(s, admin_token)
        for key in ["real", "real_total", "real_untagged", "demo", "demo_total", "note"]:
            assert key in b, f"missing {key}"
        assert b["note"] == "Counts only; not a conclusion about which tone works better."
        for block in (b["real"], b["demo"]):
            assert [row["tone"] for row in block] == TONES
            for row in block:
                assert set(row.keys()) == ROW_KEYS
                assert row["total"] == row["shares"] + row["copies"]
                assert row["shares"] >= 0 and row["copies"] >= 0 and 0 <= row["pct"] <= 100
        assert {row["label"] for row in b["real"]} == {"Casual", "Placement pressure", "Funny"}

    def test_totals_and_percentages_consistent(self, s, admin_token):
        b = _stats(s, admin_token)
        assert sum(r["total"] for r in b["real"]) == b["real_total"]
        assert sum(r["total"] for r in b["demo"]) == b["demo_total"]
        if b["real_total"]:
            assert abs(sum(r["pct"] for r in b["real"]) - 100) <= 2  # rounding
        if b["demo_total"]:
            assert abs(sum(r["pct"] for r in b["demo"]) - 100) <= 2

    def test_demo_events_are_even_and_cover_both_actions(self, s, admin_token):
        b = _stats(s, admin_token, include_demo=True)
        assert b["demo_total"] > 0, "demo tone events should be seeded"
        shares = [r["shares"] for r in b["demo"]]
        copies = [r["copies"] for r in b["demo"]]
        assert min(shares) > 0 and min(copies) > 0, "both share and copy demo events expected per tone"
        assert max(shares) - min(shares) <= 1, f"demo shares must not suggest a winner: {shares}"
        assert max(copies) - min(copies) <= 1, f"demo copies must not suggest a winner: {copies}"

    def test_demo_hidden_when_include_demo_false(self, s, admin_token):
        b = _stats(s, admin_token, include_demo=False)
        assert b["demo"] == [] and b["demo_total"] == 0
        assert isinstance(b["real_total"], int)

    def test_share_increments_only_shares_of_its_tone(self, s, admin_token):
        before = _stats(s, admin_token)
        r = s.post(f"{API}/events", json={"type": "share_clicked", "session_id": _sid("inc"), "path": "/ticket", "tone": "funny"})
        assert r.status_code == 204
        after = _stats(s, admin_token)
        br, ar = _rows(before), _rows(after)
        assert ar["funny"]["shares"] == br["funny"]["shares"] + 1
        assert ar["funny"]["copies"] == br["funny"]["copies"]
        for t in ("casual", "placement"):
            assert ar[t]["shares"] == br[t]["shares"] and ar[t]["copies"] == br[t]["copies"]
        assert after["real_total"] == before["real_total"] + 1
        assert after["demo_total"] == before["demo_total"]  # demo block untouched by real traffic

    def test_copy_increments_only_copies_of_its_tone(self, s, admin_token):
        before = _stats(s, admin_token)
        r = s.post(f"{API}/events", json={"type": "message_copied", "session_id": _sid("cp"), "path": "/ticket", "tone": "placement"})
        assert r.status_code == 204
        after = _stats(s, admin_token)
        br, ar = _rows(before), _rows(after)
        assert ar["placement"]["copies"] == br["placement"]["copies"] + 1
        assert ar["placement"]["shares"] == br["placement"]["shares"]
        for t in ("casual", "funny"):
            assert ar[t]["shares"] == br[t]["shares"] and ar[t]["copies"] == br[t]["copies"]
        assert after["real_total"] == before["real_total"] + 1

    def test_invalid_tone_not_counted(self, s, admin_token):
        before = _stats(s, admin_token)
        s.post(f"{API}/events", json={"type": "share_clicked", "session_id": _sid("bad2"), "tone": "nope"})
        s.post(f"{API}/events", json={"type": "message_copied", "session_id": _sid("bad3"), "tone": "nope"})
        after = _stats(s, admin_token)
        assert after["real_total"] == before["real_total"]
        assert after["real_untagged"] == before["real_untagged"]

    def test_funnel_unchanged_by_message_copied_and_excludes_demo(self, s, admin_token):
        r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        d = r.json()
        assert [f["key"] for f in d["funnel"]] == ["page_view", "form_started", "registered", "share_clicked"]
        share_step = next(f for f in d["funnel"] if f["key"] == "share_clicked")
        tones = d["shares_by_tone"]
        real_shares = sum(row["shares"] for row in tones["real"])
        # Funnel is real traffic only and session-deduped over 30 days, so it can never exceed the number
        # of real share events (tagged or untagged). If demo-seeded shares leaked in, this would break.
        assert share_step["count"] <= real_shares + tones["real_untagged"]
