"""Single place to edit workshop details. Everything else reads from here."""
from datetime import datetime

# <-- EDIT THIS ONE LINE to change the workshop start everywhere (IST, ISO-8601 with +05:30 offset).
# Powers the date label (ticket, OG image, share text), the landing countdown and Add-to-calendar.
START_ISO = "2026-10-17T18:00:00+05:30"


def _ist_label(iso: str) -> str:
    d = datetime.fromisoformat(iso)
    hour = d.hour % 12 or 12
    return f"{d:%a}, {d.day} {d:%b %Y} · {hour}:{d:%M} {'AM' if d.hour < 12 else 'PM'} IST"


WORKSHOP = {
    "title": "Build Your First AI Project in 60 Minutes",
    "datetime_label": _ist_label(START_ISO),  # derived from START_ISO so they can never drift
    "start_iso": START_ISO,
    "duration_label": "60 minutes · Online (joining link shared before the session)",
    "duration_minutes": 60,
    "mode": "Online",
    "audience": "3rd & 4th year engineering students",
    "campus_goal": 25,  # registrations a college needs to unlock the template pack
    "unlock_label": "Unlocked: free project template pack",
    "footer": "Concept prototype built for a growth challenge",
}

BRANCHES = ["CSE/IT", "ECE/EEE", "Mech/Civil/Other"]
YEARS = ["3rd", "4th"]
INTERESTS = ["Placements", "Startups", "Health", "Fun & games"]
