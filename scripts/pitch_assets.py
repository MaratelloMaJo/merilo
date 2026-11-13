"""Generate background plates and QR code for the NFC 2026 final deck.

Output: docs/assets/pitch_final/
Pure Pillow (no numpy / sharp) so it runs on this machine.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "docs" / "assets" / "pitch_final"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 2000, 1125
SS = (250, 141)  # low-res source, upscaled smoothly


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def radial_glow(color: str, cx: float, cy: float, rx: float, ry: float, power: float = 2.2) -> Image.Image:
    """Soft elliptical glow in normalized coordinates, additive-ready."""
    r, g, b = hex_rgb(color)
    img = Image.new("RGB", SS, (0, 0, 0))
    px = img.load()
    for y in range(SS[1]):
        ny = (y / SS[1] - cy) / ry
        for x in range(SS[0]):
            nx = (x / SS[0] - cx) / rx
            d = math.sqrt(nx * nx + ny * ny)
            f = max(0.0, 1.0 - d)
            f = f**power
            px[x, y] = (int(r * f), int(g * f), int(b * f))
    img = img.filter(ImageFilter.GaussianBlur(1.4))
    return img.resize((W, H), Image.BICUBIC)


def linear_gradient(c1: str, c2: str, angle: float = 135.0) -> Image.Image:
    a, b = hex_rgb(c1), hex_rgb(c2)
    img = Image.new("RGB", SS)
    px = img.load()
    rad = math.radians(angle)
    dx, dy = math.cos(rad), math.sin(rad)
    # project onto the diagonal, normalize 0..1
    pts = [0.0, abs(dx) + abs(dy)]
    for y in range(SS[1]):
        for x in range(SS[0]):
            t = ((x / SS[0]) * dx + (y / SS[1]) * dy) / pts[1] + 0.5
            t = min(1.0, max(0.0, t))
            px[x, y] = (
                int(a[0] + (b[0] - a[0]) * t),
                int(a[1] + (b[1] - a[1]) * t),
                int(a[2] + (b[2] - a[2]) * t),
            )
    return img.resize((W, H), Image.BICUBIC)


def vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    mask = Image.new("L", SS, 0)
    px = mask.load()
    for y in range(SS[1]):
        ny = (y / SS[1] - 0.5) * 2
        for x in range(SS[0]):
            nx = (x / SS[0] - 0.5) * 2
            d = min(1.0, math.sqrt(nx * nx + ny * ny) / 1.25)
            px[x, y] = int(255 * (1 - strength * d * d))
    mask = mask.resize((W, H), Image.BICUBIC)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.composite(img, black, mask)


def grain(img: Image.Image, amount: float = 0.035) -> Image.Image:
    random.seed(7)
    noise = Image.effect_noise((W, H), 18).convert("L")
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), amount)


def save(img: Image.Image, name: str) -> None:
    path = OUT / name
    img.save(path, "PNG", optimize=True)
    print(f"{name:18s} {path.stat().st_size // 1024:5d} KB")


# 1. hero — two glows, deep violet from bottom-left
hero = Image.new("RGB", (W, H), (0, 0, 0))
hero = ImageChops.add(hero, radial_glow("#4B3F8E", 0.18, 0.88, 0.95, 1.15, 2.0))
hero = ImageChops.add(hero, radial_glow("#3B3367", 0.92, 0.06, 0.75, 0.85, 2.4))
hero = vignette(hero, 0.45)
save(grain(hero), "bg_hero.png")

# 2. base — quiet page for content slides
base = Image.new("RGB", (W, H), (2, 1, 6))
base = ImageChops.add(base, radial_glow("#3B3367", 0.86, 0.02, 0.85, 0.75, 2.8))
base = ImageChops.add(base, radial_glow("#4B3F8E", 0.05, 1.02, 0.70, 0.70, 3.0))
base = vignette(base, 0.60)
save(grain(base, 0.030), "bg_base.png")

# 3. dark — almost pure black, one faint bloom
dark = Image.new("RGB", (W, H), (0, 0, 0))
dark = ImageChops.add(dark, radial_glow("#3B3367", 0.50, 1.05, 1.10, 0.80, 3.0))
dark = vignette(dark, 0.35)
save(grain(dark, 0.025), "bg_dark.png")

# 4. section — diagonal split for the NEXT / roadmap moment
section = linear_gradient("#3B3367", "#000000", 118.0)
section = ImageChops.add(section, radial_glow("#4B3F8E", 0.15, 0.20, 0.70, 0.80, 2.6))
section = vignette(section, 0.40)
save(grain(section, 0.030), "bg_section.png")

# 5. panel — right-hand column shading for split layouts
panel = Image.new("RGB", (W, H), (0, 0, 0))
panel = ImageChops.add(panel, radial_glow("#4B3F8E", 0.72, 0.55, 0.62, 0.95, 2.2))
panel = vignette(panel, 0.60)
save(grain(panel, 0.028), "bg_panel.png")

# 6. QR to the live demo
try:
    import qrcode  # type: ignore

    qr = qrcode.QRCode(box_size=12, border=1, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data("https://merilo-nfc.fly.dev")
    qr.make(fit=True)
    img = qr.make_image(fill_color="#000000", back_color="#FFFFFF").convert("RGB")
    img = img.resize((760, 760), Image.NEAREST)
    img.save(OUT / "qr_demo.png", "PNG", optimize=True)
    print("qr_demo.png        ok")
except Exception as exc:  # pragma: no cover - fallback so the deck still builds
    print(f"qrcode unavailable ({exc}); drawing placeholder")
    img = Image.new("RGB", (760, 760), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 740, 740], outline="black", width=12)
    img.save(OUT / "qr_demo.png")

print("done ->", OUT)