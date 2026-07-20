#!/usr/bin/env python3
"""Generate transparent PNG variants from the locked Prism mark."""

from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parent
# Prefer white-bg source if present (for clean re-extraction); else master PNG
_SRC_WHITE = BASE / "prism-mark-source-white.png"
SRC = _SRC_WHITE if _SRC_WHITE.exists() else BASE / "prism-mark.png"
OUT = BASE / "exports"
OUT.mkdir(exist_ok=True)

# Brand colors
TEAL = (15, 118, 110, 255)      # #0F766E
INK = (15, 28, 36, 255)         # #0F1C24
LIGHT = (232, 238, 242, 255)    # #E8EEF2 — for dark UI chrome
WHITE = (255, 255, 255, 255)

SIZES = {
    "512": 512,
    "256": 256,
    "128": 128,
    "64": 64,
    "32": 32,
    "16": 16,
}


def whiten_to_alpha(im: Image.Image, threshold: int = 245) -> Image.Image:
    """Turn near-white background into transparency; keep teal facets."""
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Pure / near-white → transparent
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (0, 0, 0, 0)
            # Soft anti-alias fringe near white → proportional alpha
            elif r > 220 and g > 220 and b > 220:
                # Keep some of the teal-ish fringe if present
                darkness = 255 - min(r, g, b)
                if darkness < 20:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    # Likely AA edge of teal — recolor toward teal with alpha
                    alpha = min(255, darkness * 8)
                    pixels[x, y] = (TEAL[0], TEAL[1], TEAL[2], alpha)
    return im


def trim_transparent(im: Image.Image, pad_ratio: float = 0.12) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    cropped = im.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas = side + pad * 2
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(cropped, ((canvas - w) // 2, (canvas - h) // 2), cropped)
    return out


def recolor_opaque(im: Image.Image, rgba: tuple[int, int, int, int]) -> Image.Image:
    """Keep alpha, replace all opaque RGB with target color."""
    out = im.copy()
    pixels = out.load()
    w, h = out.size
    tr, tg, tb, _ = rgba
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            # Preserve AA alpha, force brand color
            pixels[x, y] = (tr, tg, tb, a)
    return out


def main() -> None:
    raw = Image.open(SRC)
    master = trim_transparent(whiten_to_alpha(raw))
    master_path = OUT / "prism-mark-transparent.png"
    master.save(master_path, optimize=True)
    print(f"Saved {master_path.name} ({master.size[0]}x{master.size[1]})")

    variants = {
        "teal": recolor_opaque(master, TEAL),
        "ink": recolor_opaque(master, INK),
        "light": recolor_opaque(master, LIGHT),
        "white": recolor_opaque(master, WHITE),
    }

    # Full-res masters per color
    for name, img in variants.items():
        path = OUT / f"prism-mark-{name}.png"
        img.save(path, optimize=True)
        print(f"Saved {path.name} ({img.size[0]}x{img.size[1]})")

    # Sized teal (primary app icons) + ink/light common sizes
    for color_name, img in variants.items():
        for label, px in SIZES.items():
            # Prefer teal for all sizes; ink/light skip 16 if tiny
            if color_name != "teal" and px < 32:
                continue
            scaled = img.resize((px, px), Image.Resampling.LANCZOS)
            path = OUT / f"prism-mark-{color_name}-{label}.png"
            scaled.save(path, optimize=True)
            print(f"Saved {path.name}")

    import shutil

    # Convenience copies at logo root for common icon names
    shutil.copy(OUT / "prism-mark-teal-256.png", BASE / "icon_scale_large.png")
    shutil.copy(OUT / "prism-mark-teal-128.png", BASE / "icon_scale_medium.png")
    shutil.copy(OUT / "prism-mark-teal-64.png", BASE / "icon_scale_64px.png")
    shutil.copy(OUT / "prism-mark-teal-32.png", BASE / "icon_scale_32px.png")
    shutil.copy(OUT / "prism-mark-teal-16.png", BASE / "icon_scale_16px.png")

    # Master locked mark = teal transparent
    variants["teal"].save(BASE / "prism-mark.png", optimize=True)
    print("Done. Master prism-mark.png is transparent teal. Sized variants in exports/.")


if __name__ == "__main__":
    main()
