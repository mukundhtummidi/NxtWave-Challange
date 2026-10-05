import csv
import hashlib
import html
import io
import logging
import os
import random
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from analytics import SOURCE_LABELS, daily_series, longest_chain, rep_breakdown, source_bucket, viral_coefficient
from auth import check_admin_password, create_admin_token, require_admin, require_admin_header_or_query
from colleges import CANONICAL, normalize_college
from config import BRANCHES, INTERESTS, WORKSHOP, YEARS
from feedback import NOTE as FEEDBACK_NOTE
from feedback import score_submission
from projects import PROJECTS, get_project
from render import render_og, render_story

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hallticket")

client = AsyncIOMotorClient(os.environ["MONGO_URL"], tz_aware=True)
db = client[os.environ["DB_NAME"]]
ADMIN_PIN = os.environ["ADMIN_PIN"]

app = FastAPI(title="Your Hall Ticket API")
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)


class Registration(BaseDocument):
    name: str
    email: str
    email_norm: str
    college_raw: str
    college: str
    college_key: str
    branch: str
    year: str
    interest: str
    seat_code: str
    project: dict
    referred_by: Optional[str] = None
    source: dict
    share_channel: Optional[str] = None
    is_demo: bool = False
    ip_hash: Optional[str] = None
    created_at: datetime
    deleted_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Input sanitising
# ---------------------------------------------------------------------------
_TAG_RE = re.compile(r"<[^>]*>")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")
_WS_RE = re.compile(r"\s+")
_SEAT_RE = re.compile(r"^NW-[A-Z0-9]{4}$")
_CODE_RE = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
SEAT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# Sharing platforms. The "via" query param on the share link and the "channel" field on share events
# use these keys. Kept separate from source/utm bucketing (see analytics.source_bucket) on purpose.
SHARE_CHANNELS = {
    "whatsapp": "WhatsApp",
    "telegram": "Telegram",
    "linkedin": "LinkedIn",
    "x": "X",
    "facebook": "Facebook",
    "instagram": "Instagram",
    "email": "Email",
    "native": "More / native share",
    "copy": "Copy link",
}


def clean_channel(value: Optional[str]) -> Optional[str]:
    """Map an incoming platform value to an allowed channel key, else None. Lenient (no error)."""
    if not value:
        return None
    v = str(value).strip().lower()
    return v if v in SHARE_CHANNELS else None


def clean_text(value: str, max_len: int) -> str:
    value = _TAG_RE.sub("", value or "")
    value = _CTRL_RE.sub("", value)
    value = _WS_RE.sub(" ", value).strip()
    return value[:max_len]


def clean_code(value: Optional[str], max_len: int = 40) -> Optional[str]:
    if not value:
        return None
    value = clean_text(value, max_len)
    return value if _CODE_RE.match(value) else None


def public_base(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme or "https").split(",")[0].strip()
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc)).split(",")[0].strip()
    return f"{proto}://{host}"


import ipaddress

# Proxies in front of the app (Cloudflare, Google LB, cluster-internal). Each appends to X-Forwarded-For,
# so the real client is the right-most entry that is NOT one of these; anything left of it is spoofable.
TRUSTED_PROXY_NETS = [ipaddress.ip_network(c.strip()) for c in os.environ["TRUSTED_PROXY_CIDRS"].split(",") if c.strip()]


def _is_trusted_proxy(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return any(ip in net for net in TRUSTED_PROXY_NETS)


def client_ip(request: Request) -> str:
    """Real client IP for rate limiting (walks X-Forwarded-For from the right, skipping trusted proxies)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        for p in reversed(parts):
            if not _is_trusted_proxy(p):
                return p
        if parts:
            return parts[0]
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per IP)
# ---------------------------------------------------------------------------
_buckets: dict[str, deque] = defaultdict(deque)
REGISTER_LIMIT = 12  # registration attempts per IP per window
REGISTER_WINDOW = 600  # seconds


def check_rate_limit(ip: str, bucket: str = "register", limit: int = REGISTER_LIMIT, window: int = REGISTER_WINDOW, message: str = "Too many registrations from this network. Try again in a few minutes."):
    now = time.time()
    q = _buckets[f"{bucket}:{ip}"]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail=message)
    q.append(now)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    college: str = Field(min_length=2, max_length=120)
    branch: str
    year: str
    interest: str
    ref: Optional[str] = None
    rep: Optional[str] = None
    via: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None


class AdminToggleIn(BaseModel):
    pin: str = Field(max_length=32)
    hidden: bool


def ticket_view(doc: dict, base: str, referral_count: int = 0) -> dict:
    code = doc["seat_code"]
    return {
        "name": doc["name"],
        "college": doc["college"],
        "branch": doc["branch"],
        "year": doc["year"],
        "interest": doc["interest"],
        "seat_code": code,
        "project": doc["project"],
        "referred_by": doc.get("referred_by"),
        "is_demo": doc.get("is_demo", False),
        "created_at": doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else doc["created_at"],
        "referral_count": referral_count,
        "share_url": f"{base}/api/share/{code}",
        "ref_link": f"{base}/?ref={code}",
        "story_url": f"{base}/api/tickets/{code}/story.png",
        "og_url": f"{base}/api/tickets/{code}/og.png",
    }


async def find_ticket(code: str) -> dict:
    code = code.upper().strip()
    if not _SEAT_RE.match(code):
        raise HTTPException(status_code=404, detail="Ticket not found")
    doc = await db.registrations.find_one({"seat_code": code, "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return doc


async def new_seat_code() -> str:
    for _ in range(25):
        code = "NW-" + "".join(random.choice(SEAT_ALPHABET) for _ in range(4))
        if not await db.registrations.find_one({"seat_code": code}, {"_id": 1}):
            return code
    raise HTTPException(status_code=503, detail="Could not allocate a seat code, please retry")


async def demo_hidden() -> bool:
    s = await db.settings.find_one({"key": "demo_hidden"})
    return bool(s and s.get("value"))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"ok": True, "app": "Your Hall Ticket"}


@api.get("/config")
async def get_config():
    return {"workshop": WORKSHOP, "branches": BRANCHES, "years": YEARS, "interests": INTERESTS}


@api.get("/colleges")
async def get_colleges():
    return {"colleges": CANONICAL}


@api.get("/projects")
async def get_projects():
    return {"projects": [{"interest": i, "branch": b, **p} for (i, b), p in PROJECTS.items()]}


@api.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request):
    ip = client_ip(request)
    check_rate_limit(ip)

    name = clean_text(body.name, 60)
    if len(name) < 2 or not re.search(r"[A-Za-z]", name):
        raise HTTPException(status_code=422, detail="Please enter your real name")
    if body.branch not in BRANCHES or body.year not in YEARS or body.interest not in INTERESTS:
        raise HTTPException(status_code=422, detail="Invalid branch, year or interest")
    email = str(body.email).strip()
    email_norm = email.lower()
    college_raw = clean_text(body.college, 120)
    if len(college_raw) < 2:
        raise HTTPException(status_code=422, detail="Please pick or type your college")
    college, college_key = normalize_college(college_raw)

    existing = await db.registrations.find_one({"email_norm": email_norm, "deleted_at": None})
    if existing:
        raise HTTPException(status_code=409, detail={"message": "This email already has a hall ticket.", "seat_code": existing["seat_code"]})

    # referral attribution
    referred_by = None
    ref = clean_code(body.ref, 12)
    if ref:
        ref = ref.upper()
        if _SEAT_RE.match(ref):
            referrer = await db.registrations.find_one({"seat_code": ref, "deleted_at": None}, {"email_norm": 1, "seat_code": 1})
            if referrer and referrer["email_norm"] != email_norm:  # no self-referral
                referred_by = referrer["seat_code"]
    rep = clean_code(body.rep)
    if rep:
        rep = rep.upper()
    utm_source = clean_code(body.utm_source)
    source: dict[str, Any] = {
        "kind": "rep" if rep else ("student" if referred_by else ("channel" if utm_source else "direct")),
        "rep": rep,
        "utm_source": utm_source,
        "utm_medium": clean_code(body.utm_medium),
        "utm_campaign": clean_code(body.utm_campaign),
    }

    project = get_project(body.interest, body.branch)
    seat_code = await new_seat_code()
    reg = Registration(
        name=name,
        email=email,
        email_norm=email_norm,
        college_raw=college_raw,
        college=college,
        college_key=college_key,
        branch=body.branch,
        year=body.year,
        interest=body.interest,
        seat_code=seat_code,
        project=project,
        referred_by=referred_by,
        source=source,
        share_channel=clean_channel(body.via),
        is_demo=False,
        ip_hash=hashlib.sha256(ip.encode()).hexdigest()[:16],
        created_at=datetime.now(timezone.utc),
    )
    try:
        await db.registrations.insert_one(reg.to_mongo())
    except Exception as exc:  # unique index race
        if "duplicate key" in str(exc).lower():
            raise HTTPException(status_code=409, detail={"message": "This email already has a hall ticket.", "seat_code": None})
        raise
    doc = await db.registrations.find_one({"seat_code": seat_code})
    await db.events.insert_one({"type": "registered", "seat_code": seat_code, "session_id": None, "path": "/", "is_demo": False, "created_at": datetime.now(timezone.utc)})
    return ticket_view(doc, public_base(request))


@api.get("/tickets/{code}")
async def get_ticket(code: str, request: Request):
    doc = await find_ticket(code)
    count = await db.registrations.count_documents({"referred_by": doc["seat_code"], "deleted_at": None})
    return ticket_view(doc, public_base(request), count)


@api.get("/tickets/{code}/referrals")
async def ticket_referrals(code: str):
    """Friends who registered with this seat code. First name + college + created_at only —
    never email, never surname — so the owner can see their referrals without exposing PII."""
    doc = await find_ticket(code)
    hidden = await demo_hidden()
    match: dict[str, Any] = {"referred_by": doc["seat_code"], "deleted_at": None}
    if hidden:
        match["is_demo"] = False
    rows = await db.registrations.find(match, {"_id": 0, "name": 1, "college": 1, "created_at": 1}).sort("created_at", 1).to_list(1000)
    college_match: dict[str, Any] = {"college_key": doc["college_key"], "deleted_at": None}
    if hidden:
        college_match["is_demo"] = False
    college_count = await db.registrations.count_documents(college_match)
    return {
        "seat_code": doc["seat_code"],
        "count": len(rows),
        "college": doc["college"],
        "college_count": college_count,
        "goal": WORKSHOP["campus_goal"],
        "referrals": [
            {
                "first_name": (r["name"].split(" ")[0] if r.get("name") else ""),
                "college": r["college"],
                "created_at": r["created_at"].isoformat() if isinstance(r["created_at"], datetime) else r["created_at"],
            }
            for r in rows
        ],
    }


@api.get("/tickets/{code}/og.png")
async def ticket_og(code: str):
    doc = await find_ticket(code)
    png = render_og({**doc, "project_title": doc["project"]["title"]})
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@api.get("/tickets/{code}/story.png")
async def ticket_story(code: str, request: Request):
    doc = await find_ticket(code)
    png = render_story(
        {**doc, "project_title": doc["project"]["title"], "project_pitch": doc["project"]["pitch"]},
        f"{public_base(request)}/?ref={doc['seat_code']}",
    )
    return Response(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="hall-ticket-{doc["seat_code"]}.png"', "Cache-Control": "public, max-age=3600"},
    )


@api.get("/share/{code}", response_class=HTMLResponse)
async def share_page(code: str, request: Request, via: Optional[str] = None):
    base = public_base(request)
    channel = clean_channel(via)
    try:
        doc = await find_ticket(code)
    except HTTPException:
        return HTMLResponse(f'<!doctype html><meta http-equiv="refresh" content="0; url={base}/"><title>Your Hall Ticket</title>', status_code=404)
    name = html.escape(doc["name"])
    college = html.escape(doc["college"])
    seat = html.escape(doc["seat_code"])
    title = f"{name} has a seat · {html.escape(WORKSHOP['title'])}"
    desc = f"{college} · Seat {seat} · {html.escape(WORKSHOP['datetime_label'])}. Free online workshop for 3rd & 4th year engineering students. Grab your own hall ticket."
    # Humans land on the registration form carrying the referral (and the platform it came via),
    # NOT on /ticket/, so a friend who opens the link can register right away.
    target = f"{base}/?ref={seat}" + (f"&via={channel}" if channel else "")
    img = f"{base}/api/tickets/{seat}/og.png"
    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Your Hall Ticket">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{target}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0; url={target}">
<link rel="canonical" href="{target}">
<style>body{{font-family:system-ui,sans-serif;background:#0A1128;color:#F4F4F0;display:grid;place-items:center;min-height:100vh;margin:0}}a{{color:#FCE83A}}</style>
</head><body>
<p>Opening {name}'s hall ticket… <a href="{target}">Tap here if nothing happens</a>.</p>
<script>location.replace({target!r});</script>
</body></html>"""
    return HTMLResponse(page)


@api.get("/board")
async def board():
    hidden = await demo_hidden()
    match: dict[str, Any] = {"deleted_at": None}
    if hidden:
        match["is_demo"] = False
    pipeline = [
        {"$match": match},
        {"$group": {"_id": {"college_key": "$college_key", "email": "$email_norm"}, "college": {"$first": "$college"}, "is_demo": {"$max": {"$cond": ["$is_demo", 1, 0]}}}},
        {"$group": {"_id": "$_id.college_key", "college": {"$first": "$college"}, "count": {"$sum": 1}, "demo_count": {"$sum": "$is_demo"}}},
        {"$sort": {"count": -1, "college": 1}},
        {"$limit": 100},
    ]
    rows = await db.registrations.aggregate(pipeline).to_list(100)
    goal = WORKSHOP["campus_goal"]
    items = []
    for i, r in enumerate(rows):
        items.append(
            {
                "rank": i + 1,
                "college_key": r["_id"],
                "college": r["college"],
                "count": r["count"],
                "demo_count": r["demo_count"],
                "goal": goal,
                "pct": min(100, round(r["count"] * 100 / goal)),
                "unlocked": r["count"] >= goal,
            }
        )
    total = sum(x["count"] for x in items)
    demo_total = sum(x["demo_count"] for x in items)

    # Top referrers: seat codes ranked by friends registered with them. Real data always; demo rows
    # are included and labelled only when the hide-demo toggle is off.
    ref_match: dict[str, Any] = {"referred_by": {"$ne": None}, "deleted_at": None}
    if hidden:
        ref_match["is_demo"] = False
    grouped = await db.registrations.aggregate(
        [{"$match": ref_match}, {"$group": {"_id": "$referred_by", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 50}]
    ).to_list(50)
    codes = [g["_id"] for g in grouped]
    refdocs = {
        d["seat_code"]: d
        for d in await db.registrations.find({"seat_code": {"$in": codes}, "deleted_at": None}, {"_id": 0, "seat_code": 1, "name": 1, "college": 1, "is_demo": 1}).to_list(1000)
    }
    top_referrers = []
    for g in grouped:
        d = refdocs.get(g["_id"])
        if not d or (hidden and d.get("is_demo")):
            continue
        top_referrers.append(
            {
                "seat_code": g["_id"],
                "first_name": (d["name"].split(" ")[0] if d.get("name") else ""),
                "college": d["college"],
                "count": g["count"],
                "is_demo": d.get("is_demo", False),
            }
        )
        if len(top_referrers) >= 10:
            break

    return {
        "items": items,
        "goal": goal,
        "unlock_label": WORKSHOP["unlock_label"],
        "demo_hidden": hidden,
        "total": total,
        "demo_total": demo_total,
        "has_demo": demo_total > 0,
        "top_referrers": top_referrers,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@api.post("/admin/demo-visibility")
async def set_demo_visibility(body: AdminToggleIn):
    if body.pin != ADMIN_PIN:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    await db.settings.update_one({"key": "demo_hidden"}, {"$set": {"value": body.hidden, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    return {"demo_hidden": body.hidden}


@api.post("/admin/verify")
async def verify_pin(body: AdminToggleIn):
    if body.pin != ADMIN_PIN:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    return {"ok": True, "demo_hidden": await demo_hidden()}


# ---------------------------------------------------------------------------
# Lightweight funnel events
# ---------------------------------------------------------------------------
EVENT_TYPES = {"page_view", "form_started", "share_clicked", "message_copied"}
# WhatsApp message tones (keys match frontend `src/share.ts` TONES). Stored only on the two tone events below.
SHARE_TONES = {"casual": "Casual", "placement": "Placement pressure", "funny": "Funny"}
TONE_EVENT_TYPES = {"share_clicked", "message_copied"}


class EventIn(BaseModel):
    type: str = Field(max_length=32)
    session_id: Optional[str] = Field(default=None, max_length=64)
    path: Optional[str] = Field(default=None, max_length=120)
    seat_code: Optional[str] = Field(default=None, max_length=12)
    tone: Optional[str] = Field(default=None, max_length=24)
    channel: Optional[str] = Field(default=None, max_length=24)


@api.post("/events", status_code=204)
async def track_event(body: EventIn, request: Request):
    if body.type not in EVENT_TYPES:
        raise HTTPException(status_code=422, detail="Unknown event type")
    doc = {
        "type": body.type,
        "session_id": clean_code(body.session_id, 64),
        "path": clean_text(body.path or "", 120) or None,
        "seat_code": (clean_code(body.seat_code, 12) or "").upper() or None,
        "is_demo": False,
        "created_at": datetime.now(timezone.utc),
    }
    if body.type in TONE_EVENT_TYPES:
        tone = (body.tone or "").strip().lower() or None
        if tone is not None and tone not in SHARE_TONES:
            raise HTTPException(status_code=422, detail="Unknown share tone")
        doc["tone"] = tone
    # Optional sharing platform on share events. Unknown values are rejected (not silently dropped).
    channel = (body.channel or "").strip().lower() or None
    if channel is not None:
        if channel not in SHARE_CHANNELS:
            raise HTTPException(status_code=422, detail="Unknown share channel")
        doc["channel"] = channel
    check_rate_limit(client_ip(request), bucket="events", limit=120, window=60, message="Too many events")
    await db.events.insert_one(doc)
    return Response(status_code=204)


def tone_rows(shares: dict[str, int], copies: dict[str, int]) -> list[dict]:
    """One row per tone: WhatsApp shares, message copies, their sum, and that sum as % of all tones' sums."""
    totals = {t: shares.get(t, 0) + copies.get(t, 0) for t in SHARE_TONES}
    grand = sum(totals.values())
    return [
        {"tone": t, "label": label, "shares": shares.get(t, 0), "copies": copies.get(t, 0), "total": totals[t], "pct": round(totals[t] * 100 / grand) if grand else 0}
        for t, label in SHARE_TONES.items()
    ]


async def shares_by_tone(include_demo: bool, demo_only: bool = False) -> dict:
    """share_clicked / message_copied counts per tone, real and demo kept apart. Counts only, no ranking.
    demo_only drops the real side entirely (public demo page)."""
    rows = await db.events.aggregate(
        [
            {"$match": {"type": {"$in": list(TONE_EVENT_TYPES)}, "tone": {"$in": list(SHARE_TONES)}}},
            {"$group": {"_id": {"type": "$type", "tone": "$tone", "is_demo": {"$eq": ["$is_demo", True]}}, "count": {"$sum": 1}}},
        ]
    ).to_list(50)
    buckets: dict[tuple[bool, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        buckets[(r["_id"]["is_demo"], r["_id"]["type"])][r["_id"]["tone"]] += r["count"]
    real_shares, real_copies = buckets[(False, "share_clicked")], buckets[(False, "message_copied")]
    demo_shares, demo_copies = buckets[(True, "share_clicked")], buckets[(True, "message_copied")]
    if demo_only:
        real_shares, real_copies = defaultdict(int), defaultdict(int)
    untagged = 0 if demo_only else await db.events.count_documents({"type": {"$in": list(TONE_EVENT_TYPES)}, "is_demo": {"$ne": True}, "tone": {"$nin": list(SHARE_TONES)}})
    real = tone_rows(real_shares, real_copies)
    demo = tone_rows(demo_shares, demo_copies)
    return {
        "real": real,
        "real_total": sum(r["total"] for r in real),
        "real_untagged": untagged,
        "demo": demo if include_demo else [],
        "demo_total": sum(r["total"] for r in demo) if include_demo else 0,
        "note": "Counts only; not a conclusion about which tone works better.",
    }


async def shares_by_platform(regs_all: list[dict], include_demo: bool, demo_only: bool = False) -> dict:
    """Per-platform shares clicked (from share_clicked events) and registrations that arrived with a
    share_channel set. Real and demo kept apart. Counts only — a share click is not a sent message."""
    # Registrations carrying a share_channel, split real vs demo.
    real_regs: dict[str, int] = defaultdict(int)
    demo_regs: dict[str, int] = defaultdict(int)
    for r in regs_all:
        ch = clean_channel(r.get("share_channel"))
        if ch:
            (demo_regs if r.get("is_demo") else real_regs)[ch] += 1
    # share_clicked events tagged with a channel, split real vs demo.
    rows = await db.events.aggregate(
        [
            {"$match": {"type": "share_clicked", "channel": {"$in": list(SHARE_CHANNELS)}}},
            {"$group": {"_id": {"channel": "$channel", "is_demo": {"$eq": ["$is_demo", True]}}, "count": {"$sum": 1}}},
        ]
    ).to_list(200)
    real_sh: dict[str, int] = defaultdict(int)
    demo_sh: dict[str, int] = defaultdict(int)
    for row in rows:
        (demo_sh if row["_id"]["is_demo"] else real_sh)[row["_id"]["channel"]] += row["count"]

    platforms = []
    for ch, label in SHARE_CHANNELS.items():
        platforms.append(
            {
                "channel": ch,
                "label": label,
                "real_shares": 0 if demo_only else real_sh.get(ch, 0),
                "real_regs": 0 if demo_only else real_regs.get(ch, 0),
                "demo_shares": demo_sh.get(ch, 0) if include_demo else 0,
                "demo_regs": demo_regs.get(ch, 0) if include_demo else 0,
            }
        )
    return {"platforms": platforms, "note": "Counts only. A share click does not mean the message was sent."}


# ---------------------------------------------------------------------------
# Campus reps
# ---------------------------------------------------------------------------
async def load_regs(include_demo: bool = True) -> list[dict]:
    match: dict[str, Any] = {"deleted_at": None}
    if not include_demo:
        match["is_demo"] = False
    return await db.registrations.find(match, {"_id": 0, "seat_code": 1, "referred_by": 1, "source": 1, "share_channel": 1, "is_demo": 1, "created_at": 1, "college": 1, "college_key": 1, "name": 1, "email": 1, "branch": 1, "year": 1, "interest": 1, "project": 1}).to_list(100000)


def rep_link(base: str, code: str) -> str:
    return f"{base}/?rep={code}&utm_source=whatsapp"


@api.get("/reps/{code}")
async def get_rep(code: str, request: Request):
    code = (clean_code(code) or "").upper()
    rep = await db.reps.find_one({"rep_code": code, "deleted_at": None}, {"_id": 0})
    if not rep:
        raise HTTPException(status_code=404, detail="Rep not found")
    hidden = await demo_hidden()
    regs = await load_regs(include_demo=not hidden or rep.get("is_demo", False))
    mine = rep_breakdown(regs, code)
    # rank among all reps by total
    reps = await db.reps.find({"deleted_at": None}, {"_id": 0, "rep_code": 1}).to_list(1000)
    totals = sorted(((rep_breakdown(regs, r["rep_code"])["total"], r["rep_code"]) for r in reps), reverse=True)
    rank = next((i + 1 for i, (_, c) in enumerate(totals) if c == code), len(totals))
    base = public_base(request)
    return {
        "rep_code": code,
        "name": rep["name"],
        "college": rep["college"],
        "is_demo": rep.get("is_demo", False),
        "total": mine["total"],
        "direct": mine["direct"],
        "via_chain": mine["via_chain"],
        "rank": rank,
        "rep_count": len(totals),
        "trend": daily_series(mine["members"]),
        "link": rep_link(base, code),
        "recent": [
            {"name": m["name"].split(" ")[0], "college": m["college"], "seat_code": m["seat_code"], "created_at": m["created_at"].isoformat(), "is_demo": m.get("is_demo", False)}
            for m in sorted(mine["members"], key=lambda r: r["created_at"], reverse=True)[:5]
        ],
    }


# ---------------------------------------------------------------------------
# Check-in and project submission (seat code is the only identifier; no email involved)
# ---------------------------------------------------------------------------
_SENTENCE_RE = re.compile(r"[^.!?]+(?:[.!?]+|$)")
_URL_RE = re.compile(r"^https?://[^\s/$.?#][^\s]*$", re.I)
DESCRIPTION_MAX = 600
DESCRIPTION_MAX_SENTENCES = 3


class SeatIn(BaseModel):
    seat_code: str = Field(max_length=20)


class SubmitIn(BaseModel):
    seat_code: str = Field(max_length=20)
    title: str = Field(max_length=200)
    description: str = Field(max_length=2000)
    link: Optional[str] = Field(default=None, max_length=500)


def count_sentences(text: str) -> int:
    return len([s for s in _SENTENCE_RE.findall(text) if re.search(r"[A-Za-z0-9]", s)])


async def ticket_by_seat(code: str) -> dict:
    code = (code or "").strip().upper()
    if not _SEAT_RE.match(code):
        raise HTTPException(status_code=422, detail="Seat codes look like NW-7K2Q")
    return await find_ticket(code)


@api.post("/checkin")
async def checkin(body: SeatIn, request: Request):
    check_rate_limit(client_ip(request), bucket="checkin", limit=30, window=600, message="Too many check-ins from this network. Try again in a few minutes.")
    doc = await ticket_by_seat(body.seat_code)
    now = datetime.now(timezone.utc)
    res = await db.checkins.update_one(
        {"seat_code": doc["seat_code"]},
        {"$setOnInsert": {"seat_code": doc["seat_code"], "college_key": doc["college_key"], "is_demo": doc.get("is_demo", False), "checked_in_at": now}},
        upsert=True,
    )
    row = await db.checkins.find_one({"seat_code": doc["seat_code"]}, {"_id": 0, "checked_in_at": 1})
    return {
        "seat_code": doc["seat_code"],
        "first_name": doc["name"].split(" ")[0],
        "already_checked_in": res.upserted_id is None,
        "checked_in_at": row["checked_in_at"].isoformat(),
    }


@api.post("/submit")
async def submit_project(body: SubmitIn, request: Request):
    doc = await ticket_by_seat(body.seat_code)
    title = clean_text(body.title, 200)
    if not (3 <= len(title) <= 100):
        raise HTTPException(status_code=422, detail="Project title must be 3 to 100 characters")
    description = clean_text(body.description, 2000)
    if len(description) < 30:
        raise HTTPException(status_code=422, detail="Description is too short. Use up to 3 sentences, at least 30 characters.")
    if len(description) > DESCRIPTION_MAX:
        raise HTTPException(status_code=422, detail=f"Description must be {DESCRIPTION_MAX} characters or fewer")
    if count_sentences(description) > DESCRIPTION_MAX_SENTENCES:
        raise HTTPException(status_code=422, detail="Description must be 3 sentences or fewer")
    link = (body.link or "").strip() or None
    if link and not _URL_RE.match(link):
        raise HTTPException(status_code=422, detail="Link must start with http:// or https://")
    # Rate-limit only valid submissions (each one costs an LLM call).
    check_rate_limit(client_ip(request), bucket="submit", limit=6, window=600, message="Too many submissions from this network. Try again in a few minutes.")

    now = datetime.now(timezone.utc)
    # Save first, so the submission survives even if feedback fails.
    await db.submissions.update_one(
        {"seat_code": doc["seat_code"]},
        {
            "$set": {"title": title, "description": description, "link": link, "is_demo": doc.get("is_demo", False), "feedback": None, "feedback_status": "pending", "updated_at": now},
            "$setOnInsert": {"seat_code": doc["seat_code"], "created_at": now},
        },
        upsert=True,
    )
    feedback = await score_submission(title, description, link)
    status = "ok" if feedback else "unavailable"
    await db.submissions.update_one({"seat_code": doc["seat_code"]}, {"$set": {"feedback": feedback, "feedback_status": status}})
    return {
        "seat_code": doc["seat_code"],
        "saved": True,
        "title": title,
        "description": description,
        "link": link,
        "feedback_status": status,
        "feedback": feedback,
        "message": None if feedback else "Your project is saved. Automated feedback is unavailable right now.",
        "note": FEEDBACK_NOTE,
    }


async def attendance_stats(include_demo: bool) -> dict:
    match: dict[str, Any] = {} if include_demo else {"is_demo": False}
    reg_match: dict[str, Any] = {"deleted_at": None, **({} if include_demo else {"is_demo": False})}
    return {
        "checked_in": await db.checkins.count_documents(match),
        "registered": await db.registrations.count_documents(reg_match),
        "submissions": await db.submissions.count_documents(match),
        "feedback_unavailable": await db.submissions.count_documents({**match, "feedback_status": "unavailable"}),
    }


# ---------------------------------------------------------------------------
# Admin (password from ADMIN_PASSWORD, 7-day JWT)
# ---------------------------------------------------------------------------
class AdminLoginIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)


@api.post("/admin/login")
async def admin_login(body: AdminLoginIn, request: Request):
    check_rate_limit(client_ip(request), bucket="admin-login", limit=10, window=600, message="Too many sign-in attempts. Try again later.")
    if not check_admin_password(body.password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"access_token": create_admin_token(), "token_type": "bearer", "expires_in": 7 * 24 * 3600}


@api.get("/admin/me")
async def admin_me(_: Annotated[dict, Depends(require_admin)]):
    return {"ok": True}


@api.get("/admin/stats")
async def admin_stats(_: Annotated[dict, Depends(require_admin)], include_demo: bool = True):
    regs_all = await load_regs(include_demo=True)
    reps = await db.reps.find({"deleted_at": None}, {"_id": 0}).to_list(1000)
    stats = await compute_stats(regs_all, reps, include_demo=include_demo, demo_only=False)
    stats["attendance"] = await attendance_stats(include_demo)
    return stats


@api.get("/admin-demo/stats")
async def admin_demo_stats():
    """Public, read-only: the admin dashboards computed from demo data only (is_demo=True). No real registrations,
    names or emails can appear here because real rows are excluded before any aggregation."""
    regs_demo = [r for r in await load_regs(include_demo=True) if r.get("is_demo")]
    reps = await db.reps.find({"deleted_at": None, "is_demo": True}, {"_id": 0}).to_list(1000)
    return await compute_stats(regs_demo, reps, include_demo=True, demo_only=True)


async def compute_stats(regs_all: list[dict], reps: list[dict], include_demo: bool, demo_only: bool) -> dict:
    regs = regs_all if include_demo else [r for r in regs_all if not r.get("is_demo")]
    real = [r for r in regs_all if not r.get("is_demo")]
    demo = [r for r in regs_all if r.get("is_demo")]

    by_source: dict[str, int] = defaultdict(int)
    for r in regs:
        by_source[source_bucket(r)] += 1
    sources = [{"source": s, "count": by_source.get(s, 0)} for s in SOURCE_LABELS]
    for s, c in by_source.items():
        if s not in SOURCE_LABELS:
            sources.append({"source": s, "count": c})

    by_college: dict[str, dict] = {}
    for r in regs:
        row = by_college.setdefault(r["college_key"], {"college": r["college"], "count": 0, "demo_count": 0})
        row["count"] += 1
        row["demo_count"] += 1 if r.get("is_demo") else 0
    top_colleges = sorted(by_college.values(), key=lambda x: -x["count"])[:8]

    top_reps = sorted(
        ({"rep_code": rp["rep_code"], "name": rp["name"], "college": rp["college"], "is_demo": rp.get("is_demo", False), **{k: v for k, v in rep_breakdown(regs, rp["rep_code"]).items() if k != "members"}} for rp in reps),
        key=lambda x: -x["total"],
    )[:8]

    # funnel from events (real traffic only; demo registrations never emit events). Demo page: demo events only.
    since = datetime.now(timezone.utc) - timedelta(days=30)
    ev_match = {"created_at": {"$gte": since}, "is_demo": (True if demo_only else {"$ne": True})}
    pipeline = [{"$match": ev_match}, {"$group": {"_id": "$type", "count": {"$sum": 1}, "sessions": {"$addToSet": "$session_id"}}}]
    ev_rows = await db.events.aggregate(pipeline).to_list(20)
    ev = {row["_id"]: row for row in ev_rows}

    def ev_count(t: str) -> int:
        row = ev.get(t)
        if not row:
            return 0
        sess = [s for s in row["sessions"] if s]
        return len(sess) if sess else row["count"]

    registered_30d = sum(1 for r in (demo if demo_only else real) if r["created_at"] >= since)
    funnel = [
        {"step": "Page views", "key": "page_view", "count": ev_count("page_view")},
        {"step": "Form started", "key": "form_started", "count": ev_count("form_started")},
        {"step": "Registered", "key": "registered", "count": registered_30d},
        {"step": "WhatsApp share clicked", "key": "share_clicked", "count": ev_count("share_clicked")},
    ]

    return {
        "totals": {"real": len(real), "demo": len(demo), "all": len(regs_all)},
        "include_demo": include_demo,
        "sources": sources,
        "per_day": daily_series(regs),
        "top_colleges": top_colleges,
        "top_reps": top_reps,
        "funnel": funnel,
        "funnel_window_days": 30,
        "shares_by_tone": await shares_by_tone(include_demo, demo_only=demo_only),
        "by_platform": await shares_by_platform(regs_all, include_demo, demo_only=demo_only),
        "referrals": {**viral_coefficient(regs), "longest_chain": longest_chain(regs)},
        "demo_hidden": await demo_hidden(),
        "demo_only": demo_only,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/admin/export.csv")
async def admin_export(_: Annotated[dict, Depends(require_admin_header_or_query)], include_demo: bool = True):
    regs = await load_regs(include_demo=include_demo)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["seat_code", "name", "email", "college", "college_key", "branch", "year", "interest", "project", "source_bucket", "source_kind", "rep", "utm_source", "utm_medium", "utm_campaign", "share_channel", "referred_by", "is_demo", "created_at"])
    for r in sorted(regs, key=lambda x: x["created_at"]):
        s = r.get("source") or {}
        w.writerow([r["seat_code"], r["name"], r["email"], r["college"], r["college_key"], r["branch"], r["year"], r["interest"], (r.get("project") or {}).get("title", ""), source_bucket(r), s.get("kind"), s.get("rep"), s.get("utm_source"), s.get("utm_medium"), s.get("utm_campaign"), r.get("share_channel"), r.get("referred_by"), r.get("is_demo", False), r["created_at"].isoformat()])
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="registrations.csv"'})


# ---------------------------------------------------------------------------
# Demo seed (all flagged is_demo=True)
# ---------------------------------------------------------------------------
_DEMO_COLLEGES = [
    ("Amrita Vishwa Vidyapeetham, Amaravati", 14),
    ("VIT-AP Amaravati", 11),
    ("SRM University AP", 9),
    ("KL University", 8),
    ("GITAM Visakhapatnam", 6),
    ("CBIT Hyderabad", 5),
    ("RV College of Engineering", 4),
    ("PSG College of Technology", 3),
]
_FIRST = ["Aarav", "Ananya", "Rohan", "Priya", "Karthik", "Sneha", "Vikram", "Divya", "Arjun", "Meera", "Siddharth", "Nikhil", "Pooja", "Rahul", "Harini", "Aditya", "Kavya", "Manish", "Tanvi", "Varun"]
_LAST = ["Reddy", "Sharma", "Iyer", "Kumar", "Nair", "Patel", "Rao", "Gupta", "Menon", "Verma", "Naidu", "Das", "Pillai", "Joshi", "Chowdary"]


async def seed_demo():
    if await db.registrations.count_documents({"is_demo": True}) > 0:
        return
    rnd = random.Random(42)
    n = 0
    for college_raw, count in _DEMO_COLLEGES:
        college, key = normalize_college(college_raw)
        for _ in range(count):
            n += 1
            branch, interest, year = rnd.choice(BRANCHES), rnd.choice(INTERESTS), rnd.choice(YEARS)
            name = f"{rnd.choice(_FIRST)} {rnd.choice(_LAST)}"
            reg = Registration(
                name=name,
                email=f"demo{n}@example.com",
                email_norm=f"demo{n}@example.com",
                college_raw=college_raw,
                college=college,
                college_key=key,
                branch=branch,
                year=year,
                interest=interest,
                seat_code=await new_seat_code(),
                project=get_project(interest, branch),
                referred_by=None,
                source={"kind": "direct", "rep": None, "utm_source": None, "utm_medium": None, "utm_campaign": None},
                is_demo=True,
                created_at=datetime.now(timezone.utc),
            )
            await db.registrations.insert_one(reg.to_mongo())
    logger.info("Seeded %d demo registrations", n)


_DEMO_REPS = [
    ("ANANYA-AMR", "Ananya R.", "Amrita Vishwa Vidyapeetham, Amaravati"),
    ("ROHAN-VIT", "Rohan K.", "VIT-AP Amaravati"),
    ("PRIYA-SRM", "Priya N.", "SRM University AP"),
    ("KARTHIK-KLU", "Karthik V.", "KL University"),
    ("MEERA-GIT", "Meera D.", "GITAM Visakhapatnam"),
]


async def seed_reps():
    """Seed 5 demo reps and re-attribute part of the demo registrations to them (idempotent)."""
    if await db.reps.count_documents({}) > 0:
        return
    rnd = random.Random(7)
    now = datetime.now(timezone.utc)
    rep_by_college: dict[str, str] = {}
    for code, name, college_raw in _DEMO_REPS:
        college, key = normalize_college(college_raw)
        rep_by_college[key] = code
        await db.reps.insert_one({"rep_code": code, "name": name, "college": college, "college_key": key, "is_demo": True, "created_at": now, "deleted_at": None})

    demos = await db.registrations.find({"is_demo": True}).sort("_id", 1).to_list(1000)
    by_college: dict[str, list[dict]] = defaultdict(list)
    for d in demos:
        by_college[d["college_key"]].append(d)

    for key, rows in by_college.items():
        rep = rep_by_college.get(key)
        rows.sort(key=lambda r: r["_id"])
        prev_codes: list[str] = []
        for i, d in enumerate(rows):
            created = now - timedelta(days=rnd.randint(0, 11), hours=rnd.randint(0, 23), minutes=rnd.randint(0, 59))
            update: dict[str, Any] = {"created_at": created}
            roll = rnd.random()
            if rep and roll < 0.45:
                utm = "instagram" if rnd.random() < 0.25 else None
                update["source"] = {"kind": "rep", "rep": rep, "utm_source": utm, "utm_medium": None, "utm_campaign": None}
                update["referred_by"] = None
            elif prev_codes and roll < 0.75:
                parent = prev_codes[-1] if rnd.random() < 0.5 else rnd.choice(prev_codes)
                update["source"] = {"kind": "student", "rep": None, "utm_source": "whatsapp", "utm_medium": None, "utm_campaign": None}
                update["referred_by"] = parent
            elif roll < 0.85:
                update["source"] = {"kind": "channel", "rep": None, "utm_source": rnd.choice(["instagram", "club"]), "utm_medium": None, "utm_campaign": None}
                update["referred_by"] = None
            else:
                update["source"] = {"kind": "direct", "rep": None, "utm_source": None, "utm_medium": None, "utm_campaign": None}
                update["referred_by"] = None
            await db.registrations.update_one({"_id": d["_id"]}, {"$set": update})
            prev_codes.append(d["seat_code"])
    # referred_by must point to an earlier registration: fix ordering by created_at where needed
    demos = await db.registrations.find({"is_demo": True, "referred_by": {"$ne": None}}).to_list(1000)
    by_code = {d["seat_code"]: d for d in await db.registrations.find({"is_demo": True}).to_list(1000)}
    for d in demos:
        parent = by_code.get(d["referred_by"])
        if parent and parent["created_at"] > d["created_at"]:
            await db.registrations.update_one({"_id": d["_id"]}, {"$set": {"created_at": parent["created_at"] + timedelta(hours=rnd.randint(1, 20))}})
    logger.info("Seeded %d demo reps and re-attributed demo registrations", len(_DEMO_REPS))


_DEMO_TONE_EVENTS_PER_TONE = {"share_clicked": 6, "message_copied": 4}  # equal per tone: demo data must not suggest a winner


async def seed_demo_shares():
    """Seed share_clicked / message_copied events with a tone, flagged is_demo=True, spread evenly across tones.
    Idempotent per event type so an existing DB picks up newly added types."""
    rnd = random.Random(11)
    now = datetime.now(timezone.utc)
    seats = [d["seat_code"] for d in await db.registrations.find({"is_demo": True}, {"seat_code": 1}).to_list(1000)]
    if not seats:
        return
    for ev_type, per_tone in _DEMO_TONE_EVENTS_PER_TONE.items():
        if await db.events.count_documents({"is_demo": True, "type": ev_type}) > 0:
            continue
        docs = []
        for tone in SHARE_TONES:
            for i in range(per_tone):
                docs.append(
                    {
                        "type": ev_type,
                        "session_id": f"demo-{ev_type}-{tone}-{i}",
                        "path": "/ticket",
                        "seat_code": rnd.choice(seats),
                        "tone": tone,
                        "is_demo": True,
                        "created_at": now - timedelta(days=rnd.randint(0, 11), hours=rnd.randint(0, 23), minutes=rnd.randint(0, 59)),
                    }
                )
        await db.events.insert_many(docs)
        logger.info("Seeded %d demo %s events (%d per tone)", len(docs), ev_type, per_tone)


async def seed_demo_platforms():
    """Seed per-platform demo data, spread evenly across SHARE_CHANNELS and labelled Demo data:
    - share_clicked events tagged with a `channel` (no tone, so tone stats stay untouched)
    - a share_channel on a slice of demo registrations
    Idempotent: each half is skipped once its demo data already exists."""
    channels = list(SHARE_CHANNELS)
    now = datetime.now(timezone.utc)

    if await db.events.count_documents({"is_demo": True, "type": "share_clicked", "channel": {"$in": channels}}) == 0:
        seats = [d["seat_code"] for d in await db.registrations.find({"is_demo": True}, {"seat_code": 1}).to_list(1000)]
        if seats:
            rnd = random.Random(23)
            docs = []
            per_channel = 2  # even across platforms: demo must not suggest a winning platform
            for ch in channels:
                for i in range(per_channel):
                    docs.append(
                        {
                            "type": "share_clicked",
                            "session_id": f"demo-plat-{ch}-{i}",
                            "path": "/ticket",
                            "seat_code": rnd.choice(seats),
                            "channel": ch,
                            "is_demo": True,
                            "created_at": now - timedelta(days=rnd.randint(0, 11), hours=rnd.randint(0, 23)),
                        }
                    )
            await db.events.insert_many(docs)
            logger.info("Seeded %d demo platform share events (%d per channel)", len(docs), per_channel)

    if await db.registrations.count_documents({"is_demo": True, "share_channel": {"$ne": None}}) == 0:
        demos = await db.registrations.find({"is_demo": True}, {"_id": 1}).sort("_id", 1).to_list(1000)
        tagged = 0
        for i, d in enumerate(demos[: len(channels) * 2]):  # 2 demo registrations per channel
            await db.registrations.update_one({"_id": d["_id"]}, {"$set": {"share_channel": channels[i % len(channels)]}})
            tagged += 1
        if tagged:
            logger.info("Tagged %d demo registrations with a share_channel", tagged)


@app.on_event("startup")
async def on_startup():
    await db.registrations.create_index("seat_code", unique=True)
    await db.registrations.create_index("email_norm", unique=True)
    await db.registrations.create_index([("college_key", 1), ("is_demo", 1)])
    await db.registrations.create_index("referred_by")
    await db.reps.create_index("rep_code", unique=True)
    await db.events.create_index([("type", 1), ("created_at", -1)])
    await db.checkins.create_index("seat_code", unique=True)
    await db.submissions.create_index("seat_code", unique=True)
    await seed_demo()
    await seed_reps()
    await seed_demo_shares()
    await seed_demo_platforms()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
