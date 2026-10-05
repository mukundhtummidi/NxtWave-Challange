"""Single place to edit workshop details. Everything else reads from here."""

WORKSHOP = {
    "title": "Build Your First AI Project in 60 Minutes",
    # <-- EDIT THIS ONE LINE to change the date/time shown everywhere (ticket, OG image, share text)
    "datetime_label": "Sat, 17 Oct 2026 · 6:00 PM IST",
    # Machine-readable workshop start (IST, ISO-8601 with offset). Keep it in sync with datetime_label.
    # Powers the countdown on the landing page and the Add-to-calendar (.ics + Google Calendar) links.
    "start_iso": "2026-10-17T18:00:00+05:30",
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
