"""Pillow renderers for the shareable ticket images (OG preview + 1080x1920 story)."""
import io
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from config import WORKSHOP

FONT_DIR = Path(__file__).parent / "fonts"
INK = (10, 17, 40)
PAPER = (244, 244, 240)
PAPER_DARK = (229, 229, 224)
RED = (217, 45, 32)
YELLOW = (252, 232, 58)
MUTED = (75, 85, 99)
WHITE = (255, 255, 255)


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / f"{name}.ttf"), size)


def _paper(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), PAPER)
    px = img.load()
    rnd = random.Random(7)
    # light speckle texture
    for _ in range(w * h // 60):
        x, y = rnd.randrange(w), rnd.randrange(h)
        d = rnd.randrange(-10, 6)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))
    return img


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int, max_lines: int = 2) -> list[str]:
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and len(" ".join(lines)) < len(text):
        last = lines[-1]
        while draw.textlength(last + "…", font=font) > max_w and len(last) > 1:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def _stamp(img: Image.Image, cx: int, cy: int, text: str, size: int, angle: float = -12):
    f = _font("SpaceGrotesk-Bold", size)
    tmp = Image.new("RGBA", (size * 8, size * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    tw = d.textlength(text, font=f)
    pad = size // 2
    box = (int(tmp.width / 2 - tw / 2 - pad), int(tmp.height / 2 - size * 0.75), int(tmp.width / 2 + tw / 2 + pad), int(tmp.height / 2 + size * 0.75))
    d.rounded_rectangle(box, radius=size // 5, outline=RED + (235,), width=max(4, size // 9))
    d.text((tmp.width / 2 - tw / 2, tmp.height / 2 - size * 0.62), text, font=f, fill=RED + (235,))
    tmp = tmp.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.paste(tmp, (int(cx - tmp.width / 2), int(cy - tmp.height / 2)), tmp)


def _dashed_line(draw, x0, x1, y, dash=18, gap=12, fill=INK, width=3):
    x = x0
    while x < x1:
        draw.line([(x, y), (min(x + dash, x1), y)], fill=fill, width=width)
        x += dash + gap


def render_og(t: dict) -> bytes:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    # ticket card
    card = (60, 60, W - 60, H - 60)
    paper = _paper(card[2] - card[0], card[3] - card[1])
    img.paste(paper, (card[0], card[1]))
    d.rectangle(card, outline=INK, width=6)
    x = card[0] + 48
    y = card[1] + 40
    d.text((x, y), "HALL TICKET", font=_font("SpaceGrotesk-Bold", 26), fill=RED)
    d.text((x + 230, y + 2), WORKSHOP["title"].upper(), font=_font("SpaceGrotesk-Medium", 22), fill=MUTED)
    y += 56
    _dashed_line(d, x, card[2] - 48, y)
    y += 36
    name_font = _font("SpaceGrotesk-Bold", 64)
    for line in _wrap(d, t["name"], name_font, 760, 1):
        d.text((x, y), line, font=name_font, fill=INK)
    y += 84
    col_font = _font("SpaceGrotesk-Medium", 32)
    for line in _wrap(d, t["college"], col_font, 760, 2):
        d.text((x, y), line, font=col_font, fill=MUTED)
        y += 40
    y += 18
    # project highlight
    pf = _font("SpaceGrotesk-Bold", 30)
    label = "Your project: " + t["project_title"]
    tw = d.textlength(label, font=pf)
    d.rectangle((x - 8, y - 4, x + min(tw, 760) + 8, y + 40), fill=YELLOW)
    d.text((x, y), label[:60], font=pf, fill=INK)
    # seat code block on right
    bx = card[2] - 300
    by = card[1] + 120
    d.rectangle((bx, by, bx + 240, by + 150), fill=WHITE, outline=INK, width=4)
    d.text((bx + 20, by + 16), "SEAT", font=_font("SpaceGrotesk-Medium", 22), fill=MUTED)
    d.text((bx + 20, by + 52), t["seat_code"], font=_font("JetBrainsMono-Bold", 56), fill=INK)
    d.text((bx, by + 170), WORKSHOP["datetime_label"], font=_font("SpaceGrotesk-Medium", 22), fill=INK)
    d.text((x, card[3] - 56), WORKSHOP["footer"], font=_font("SpaceGrotesk-Regular", 18), fill=MUTED)
    _stamp(img, card[2] - 200, card[3] - 120, "REGISTERED", 34)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def render_story(t: dict, share_url: str) -> bytes:
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    d.text((80, 140), "I GOT MY SEAT.", font=_font("SpaceGrotesk-Bold", 64), fill=WHITE)
    d.text((80, 220), "Free online workshop · " + WORKSHOP["datetime_label"], font=_font("SpaceGrotesk-Medium", 28), fill=(200, 205, 220))
    card = (70, 320, W - 70, 1600)
    paper = _paper(card[2] - card[0], card[3] - card[1])
    img.paste(paper, (card[0], card[1]))
    d.rectangle(card, outline=PAPER_DARK, width=8)
    # punch holes
    for hy in range(card[1] + 40, card[3] - 20, 60):
        d.ellipse((card[0] - 12, hy, card[0] + 12, hy + 24), fill=INK)
        d.ellipse((card[2] - 12, hy, card[2] + 12, hy + 24), fill=INK)
    x = card[0] + 64
    y = card[1] + 56
    d.text((x, y), "HALL TICKET", font=_font("SpaceGrotesk-Bold", 34), fill=RED)
    y += 50
    tf = _font("SpaceGrotesk-Medium", 30)
    for line in _wrap(d, WORKSHOP["title"], tf, 860, 2):
        d.text((x, y), line, font=tf, fill=MUTED)
        y += 38
    y += 20
    _dashed_line(d, x, card[2] - 64, y)
    y += 40
    d.text((x, y), "CANDIDATE", font=_font("SpaceGrotesk-Medium", 24), fill=MUTED)
    y += 34
    nf = _font("SpaceGrotesk-Bold", 72)
    for line in _wrap(d, t["name"], nf, 860, 2):
        d.text((x, y), line, font=nf, fill=INK)
        y += 84
    y += 12
    d.text((x, y), "COLLEGE", font=_font("SpaceGrotesk-Medium", 24), fill=MUTED)
    y += 34
    cf = _font("SpaceGrotesk-Medium", 40)
    for line in _wrap(d, t["college"], cf, 860, 2):
        d.text((x, y), line, font=cf, fill=INK)
        y += 50
    y += 20
    # branch + seat row
    d.text((x, y), "BRANCH", font=_font("SpaceGrotesk-Medium", 24), fill=MUTED)
    d.text((x, y + 34), t["branch"] + " · " + t["year"] + " year", font=_font("SpaceGrotesk-Medium", 36), fill=INK)
    bx = card[2] - 64 - 400
    d.rectangle((bx, y - 10, bx + 400, y + 120), fill=WHITE, outline=INK, width=5)
    d.text((bx + 24, y + 6), "SEAT", font=_font("SpaceGrotesk-Medium", 24), fill=MUTED)
    d.text((bx + 24, y + 40), t["seat_code"], font=_font("JetBrainsMono-Bold", 64), fill=INK)
    y += 160
    _dashed_line(d, x, card[2] - 64, y)
    y += 40
    # project card
    pbox = (x, y, card[2] - 64, y + 260)
    d.rectangle(pbox, fill=YELLOW, outline=INK, width=5)
    d.text((x + 28, y + 24), "YOUR PROJECT", font=_font("SpaceGrotesk-Bold", 24), fill=INK)
    pf = _font("SpaceGrotesk-Bold", 50)
    yy = y + 64
    for line in _wrap(d, t["project_title"], pf, 820, 2):
        d.text((x + 28, yy), line, font=pf, fill=INK)
        yy += 58
    pp = _font("SpaceGrotesk-Regular", 28)
    for line in _wrap(d, t["project_pitch"], pp, 780, 2):
        if yy > y + 215:
            break
        d.text((x + 28, yy), line, font=pp, fill=INK)
        yy += 34
    y += 300
    d.text((x, y), WORKSHOP["datetime_label"], font=_font("SpaceGrotesk-Bold", 32), fill=INK)
    d.text((x, y + 44), WORKSHOP["duration_label"], font=_font("SpaceGrotesk-Regular", 26), fill=MUTED)
    _stamp(img, card[2] - 260, card[3] - 170, "REGISTERED", 48)
    d.text((80, 1680), "Get your own seat:", font=_font("SpaceGrotesk-Medium", 30), fill=(200, 205, 220))
    uf = _font("JetBrainsMono-Regular", 30)
    url_lines = _wrap(d, share_url.replace("https://", ""), uf, 920, 2)
    uy = 1724
    for line in url_lines:
        d.text((80, uy), line, font=uf, fill=WHITE)
        uy += 38
    d.text((80, 1840), WORKSHOP["footer"], font=_font("SpaceGrotesk-Regular", 22), fill=(160, 170, 190))
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()
