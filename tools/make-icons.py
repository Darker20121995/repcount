"""Generate RepCount PWA icons (any + maskable + apple touch + favicon)."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(parents=True, exist_ok=True)

MASTER = 1024
SS = 2  # supersample factor
S = MASTER * SS

BG_TOP = (17, 22, 30)
BG_BOTTOM = (7, 9, 13)
ACCENT = (255, 90, 54)
MINT = (53, 224, 161)
WHITE = (241, 244, 248)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def radial_glow(size: int, center, radius: float, color, strength: float = 1.0) -> Image.Image:
    """Soft radial gradient layer in RGBA."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / radius
    alpha = np.clip(1.0 - dist, 0.0, 1.0) ** 3 * strength
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = color[0]
    rgba[..., 1] = color[1]
    rgba[..., 2] = color[2]
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def build(size: int, inset_scale: float, radius_scale: float) -> Image.Image:
    """Render the icon at `size`; inset_scale shrinks art for maskable safe zone."""
    s = size
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # vertical gradient background
    top = np.array(BG_TOP, dtype=np.float32)
    bot = np.array(BG_BOTTOM, dtype=np.float32)
    ramp = np.linspace(0, 1, s, dtype=np.float32)[:, None, None]
    grad = (top[None, None, :] * (1 - ramp) + bot[None, None, :] * ramp).astype(np.uint8)
    grad = np.repeat(grad, s, axis=1)
    bg = Image.fromarray(grad, "RGB").convert("RGBA")
    bg.alpha_composite(radial_glow(s, (s * 0.2, s * 0.05), s * 0.62, (255, 90, 54), strength=0.22), (0, 0))
    bg.alpha_composite(radial_glow(s, (s * 0.95, s * 1.05), s * 0.55, (53, 224, 161), strength=0.16), (0, 0))

    mask = rounded_mask(s, int(s * radius_scale))
    canvas.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)

    # layout
    pad = s * (1 - inset_scale) / 2
    box = (pad + s * 0.095 * inset_scale, pad + s * 0.095 * inset_scale,
           s - pad - s * 0.095 * inset_scale, s - pad - s * 0.095 * inset_scale)
    width = int(s * 0.072 * inset_scale)

    start, end = -62, 238  # gap in the top-right quadrant
    draw.arc(box, start=start, end=end, fill=ACCENT, width=width)

    # round caps
    cx = cy = s / 2
    r = (box[2] - box[0]) / 2
    for ang in (start, end):
        px = cx + r * math.cos(math.radians(ang))
        py = cy + r * math.sin(math.radians(ang))
        draw.ellipse((px - width / 2, py - width / 2, px + width / 2, py + width / 2), fill=ACCENT)

    # mint pip at the gap midpoint
    gap_ang = -35
    gx = cx + r * math.cos(math.radians(gap_ang))
    gy = cy + r * math.sin(math.radians(gap_ang))
    pip = width * 0.62
    draw.ellipse((gx - pip, gy - pip, gx + pip, gy + pip), fill=MINT)

    # monogram
    f = font(int(s * 0.47 * inset_scale))
    draw.text((cx, cy + s * 0.012 * inset_scale), "R", font=f, fill=WHITE, anchor="mm")

    return canvas


def main() -> None:
    master = build(S, inset_scale=1.0, radius_scale=0.225)
    master.resize((MASTER, MASTER), Image.LANCZOS).save(OUT / "icon-1024.png")

    for px in (512, 192):
        img = master.resize((px, px), Image.LANCZOS)
        img.save(OUT / f"icon-{px}.png", optimize=True)

    # iOS applies its own mask and dislikes transparency: full-bleed square.
    apple = build(S, inset_scale=0.92, radius_scale=0.0)
    apple.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png", optimize=True)

    # maskable: art scaled into the 80% safe circle, full-bleed background
    maskable_master = build(S, inset_scale=0.78, radius_scale=0.0)
    maskable_master.resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)

    # favicon.svg
    (OUT / "favicon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a0c10"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="#ff5a36" stroke-width="6.5"
          stroke-linecap="round" stroke-dasharray="112 24" transform="rotate(-62 32 32)"/>
  <circle cx="32" cy="32" r="3" fill="#35e0a1" transform="rotate(-35 32 32) translate(0 -21)"/>
  <text x="32" y="43" font-family="Arial, Helvetica, sans-serif" font-size="27"
        font-weight="700" fill="#f1f4f8" text-anchor="middle">R</text>
</svg>
""",
        encoding="utf-8",
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
