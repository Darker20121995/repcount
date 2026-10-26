"""Generate the GitHub banner (1280x640) for RepCount."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)

W, H = 1280, 640
BG_TOP = (13, 17, 24)
BG_BOT = (5, 7, 10)
WHITE = (241, 244, 248)
MUTED = (150, 161, 175)
DIM = (108, 119, 133)
ACCENT = (255, 90, 54)
MINT = (53, 224, 161)
CARD = (24, 30, 40)

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def glow(size, center, radius, color, strength):
    yy, xx = np.mgrid[0:size[1], 0:size[0]].astype(np.float32)
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / radius
    alpha = np.clip(1.0 - dist, 0.0, 1.0) ** 3 * strength
    layer = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    layer[..., 0], layer[..., 1], layer[..., 2] = color
    layer[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(layer, "RGBA")


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def main() -> None:
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))

    # vertical gradient
    ramp = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    grad = (np.array(BG_TOP)[None, None, :] * (1 - ramp) + np.array(BG_BOT)[None, None, :] * ramp).astype(np.uint8)
    grad = np.repeat(grad, W, axis=1)
    canvas.paste(Image.fromarray(grad, "RGB"), (0, 0))

    canvas.alpha_composite(glow((W, H), (180, 40), 680, ACCENT, 0.20))
    canvas.alpha_composite(glow((W, H), (1120, 640), 560, MINT, 0.14))

    draw = ImageDraw.Draw(canvas)

    # brand row
    icon = Image.open(ROOT / "icons" / "icon-192.png").convert("RGBA").resize((92, 92), Image.LANCZOS)
    canvas.alpha_composite(icon, (72, 58))

    draw.text((186, 78), "RepCount", font=font(FONT_BOLD, 52), fill=WHITE)
    draw.text((188, 136), "interval rep trainer", font=font(FONT_REG, 19), fill=DIM)

    # headline
    draw.text((72, 214), "Count reps.", font=font(FONT_BOLD, 66), fill=WHITE)
    draw.text((72, 292), "Own the clock.", font=font(FONT_BOLD, 66), fill=(154, 165, 179))

    draw.text((74, 392), "Work 30 s or 1 min. Tap every rep. Rest 10–30 s. Repeat.",
              font=font(FONT_REG, 23), fill=MUTED)
    draw.text((74, 428), "Installable on iPhone and Android — works offline.",
              font=font(FONT_REG, 23), fill=MUTED)

    # feature chips
    chips = ["30 s / 1 min work", "10–30 s rest", "rep target 1–30+"]
    x = 74
    y = 492
    f_chip = font(FONT_REG, 18)
    for text in chips:
        tw = draw.textlength(text, font=f_chip)
        box = (x, y, x + tw + 34, y + 38)
        draw.rounded_rectangle(box, radius=19, fill=(23, 29, 38), outline=(40, 49, 62), width=1)
        draw.text((x + 17, y + 8), text, font=f_chip, fill=(196, 205, 217))
        x = box[2] + 12

    draw.text((74, 566), "PWA · no account · data stays on device", font=font(FONT_REG, 16), fill=DIM)

    # phone screenshot with shadow
    shot = Image.open(SHOTS / "workout.png").convert("RGBA")
    target_h = 556
    target_w = int(shot.width * target_h / shot.height)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    shot = rounded(shot, 34)

    ring = glow((target_w + 220, target_h + 220), ((target_w + 220) // 2, (target_h + 220) // 2), 320, ACCENT, 0.30)

    px = W - target_w - 96
    py = (H - target_h) // 2
    shadow = Image.new("RGBA", (target_w + 80, target_h + 80), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((40, 40, 40 + target_w, 40 + target_h), radius=34, fill=(0, 0, 0, 200))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))

    canvas.alpha_composite(shadow, (px - 40, py - 30))
    canvas.alpha_composite(ring, (px - 110, py - 110))
    canvas.alpha_composite(shot, (px, py))

    canvas.convert("RGB").save(SHOTS / "banner.png", optimize=True)
    print("wrote", SHOTS / "banner.png", canvas.size)


if __name__ == "__main__":
    main()
