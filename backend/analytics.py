"""Pure analytics helpers over in-memory registration dicts (prototype scale)."""
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

TREND_DAYS = 14

SOURCE_LABELS = ["rep", "student referral", "instagram", "club", "direct"]


def source_bucket(reg: dict) -> str:
    src = reg.get("source") or {}
    utm = (src.get("utm_source") or "").lower()
    if utm in ("instagram", "insta", "ig"):
        return "instagram"
    if utm == "club":
        return "club"
    kind = src.get("kind")
    if kind == "rep":
        return "rep"
    if kind == "student":
        return "student referral"
    if utm:
        return utm
    return "direct"


def _children(regs: list[dict]) -> dict[str, list[str]]:
    ch: dict[str, list[str]] = defaultdict(list)
    for r in regs:
        if r.get("referred_by"):
            ch[r["referred_by"]].append(r["seat_code"])
    return ch


def descendants(seeds: list[str], children: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    q = deque(seeds)
    while q:
        cur = q.popleft()
        for c in children.get(cur, []):
            if c not in seen:
                seen.add(c)
                q.append(c)
    return seen


def daily_series(regs: list[dict], days: int = TREND_DAYS) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    counts: dict = defaultdict(lambda: {"real": 0, "demo": 0})
    for r in regs:
        d = r["created_at"].date() if isinstance(r["created_at"], datetime) else None
        if d and start <= d <= today:
            counts[d]["demo" if r.get("is_demo") else "real"] += 1
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        c = counts.get(d, {"real": 0, "demo": 0})
        out.append({"date": d.isoformat(), "label": d.strftime("%d %b"), "real": c["real"], "demo": c["demo"], "total": c["real"] + c["demo"]})
    return out


def rep_breakdown(regs: list[dict], rep_code: str) -> dict:
    children = _children(regs)
    by_code = {r["seat_code"]: r for r in regs}
    direct_codes = [r["seat_code"] for r in regs if ((r.get("source") or {}).get("rep") or "").upper() == rep_code.upper()]
    chain_codes = descendants(direct_codes, children) - set(direct_codes)
    all_codes = set(direct_codes) | chain_codes
    members = [by_code[c] for c in all_codes if c in by_code]
    return {
        "direct": len(direct_codes),
        "via_chain": len(chain_codes),
        "total": len(all_codes),
        "members": members,
    }


def longest_chain(regs: list[dict]) -> dict:
    """Longest referral path length (edges) and the seat codes along it."""
    children = _children(regs)
    by_code = {r["seat_code"]: r for r in regs}
    roots = [r["seat_code"] for r in regs if not r.get("referred_by") or r["referred_by"] not in by_code]
    best_len, best_path = 0, []

    def dfs(node: str, path: list[str]):
        nonlocal best_len, best_path
        if len(path) - 1 > best_len:
            best_len, best_path = len(path) - 1, list(path)
        for c in children.get(node, []):
            if c not in path:
                path.append(c)
                dfs(c, path)
                path.pop()

    for root in roots:
        dfs(root, [root])
    return {"length": best_len, "path": best_path}


def viral_coefficient(regs: list[dict]) -> dict:
    total = len(regs)
    referred = sum(1 for r in regs if r.get("referred_by"))
    referrers = len({r["referred_by"] for r in regs if r.get("referred_by")})
    return {
        "total": total,
        "referred": referred,
        "referrers": referrers,
        "k": round(referred / total, 3) if total else 0.0,  # avg referrals per registrant
        "avg_per_referrer": round(referred / referrers, 2) if referrers else 0.0,
    }
