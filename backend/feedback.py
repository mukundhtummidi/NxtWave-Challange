"""Automated rubric feedback for project submissions (platform LLM key via emergentintegrations).

Honesty rules: scores come only from the model. If the call fails, times out, or returns anything
that does not match the rubric exactly, we return None and the caller reports "feedback unavailable".
We never fill in, guess or default a score.
"""
import asyncio
import json
import logging
import os
import re
import uuid
from typing import Optional

logger = logging.getLogger("hallticket.feedback")

MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-5-5"
TIMEOUT_SECONDS = 45

CRITERIA = [
    ("clear_problem", "Clear problem"),
    ("uses_ai", "Uses AI meaningfully"),
    ("working_demo", "Working demo"),
    ("originality", "Originality"),
]
SCORE_MIN, SCORE_MAX = 1, 4
NOTE = "Automated feedback, may be wrong"

SYSTEM = (
    "You are a fair, encouraging reviewer for a 60-minute beginner AI workshop for engineering students. "
    "Score a student's project on four criteria, each an integer from 1 (weak) to 4 (strong): "
    "clear_problem (is a real problem clearly stated), uses_ai (does AI do meaningful work, not decoration), "
    "working_demo (does the description or link suggest something that actually runs; you cannot open links, "
    "so judge only from what is written and never assume a link works), originality. "
    "Then write exactly 2 short lines of feedback: line 1 the strongest point, line 2 the single most useful next step. "
    'Reply with JSON only, no prose, no code fences: {"scores":{"clear_problem":n,"uses_ai":n,"working_demo":n,"originality":n},"feedback":["line 1","line 2"]}'
)


def parse_feedback(raw: str) -> Optional[dict]:
    """Strictly validate the model output. Anything off-spec -> None (never a made-up score)."""
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except (ValueError, TypeError):
        return None
    scores = data.get("scores") if isinstance(data, dict) else None
    lines = data.get("feedback") if isinstance(data, dict) else None
    if not isinstance(scores, dict) or not isinstance(lines, list):
        return None
    out_scores = []
    for key, label in CRITERIA:
        v = scores.get(key)
        if isinstance(v, bool) or not isinstance(v, int) or not (SCORE_MIN <= v <= SCORE_MAX):
            return None
        out_scores.append({"key": key, "label": label, "score": v, "max": SCORE_MAX})
    lines = [str(x).strip() for x in lines if isinstance(x, str) and str(x).strip()]
    if len(lines) != 2:
        return None
    return {
        "scores": out_scores,
        "total": sum(s["score"] for s in out_scores),
        "max_total": SCORE_MAX * len(CRITERIA),
        "lines": [line[:240] for line in lines],
        "note": NOTE,
        "model": MODEL_NAME,
    }


async def _ask(prompt: str) -> str:
    # Imported lazily: the package only exists on the Emergent platform. Elsewhere this raises,
    # score_submission catches it, and the app reports "feedback unavailable".
    from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"submit-{uuid.uuid4().hex}", system_message=SYSTEM).with_model(MODEL_PROVIDER, MODEL_NAME)
    parts: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(parts)


async def score_submission(title: str, description: str, link: Optional[str]) -> Optional[dict]:
    prompt = f"Project title: {title}\nDescription: {description}\nLink: {link or '(none given)'}"
    try:
        raw = await asyncio.wait_for(_ask(prompt), timeout=TIMEOUT_SECONDS)
    except Exception as exc:  # network, auth, budget, timeout: all mean "feedback unavailable"
        logger.warning("LLM feedback failed: %s", exc.__class__.__name__)
        return None
    result = parse_feedback(raw)
    if result is None:
        logger.warning("LLM feedback was not valid rubric JSON; reporting unavailable")
    return result
