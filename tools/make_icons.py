#!/usr/bin/env python3
"""Generate the PWA icon set. Run once; re-run only if the mark changes.

    python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BG = (13, 15, 18)
ACCENT = (255, 107, 53)
OUT = Path(__file__).resolve().parent.parent / "icons"


def barbell(size: int, pad_ratio: float, rounded: bool) -> Image.Image:
    """A loaded bar, viewed from the front."""
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)

    if rounded:
        # Rounded square plate of colour behind the mark, for the plain icon.
        r = int(size * 0.22)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)

    pad = int(size * pad_ratio)
    cy = size // 2
    bar_h = max(2, int(size * 0.055))
    plate_w = max(3, int(size * 0.085))
    inner_h = int(size * 0.36)
    outer_h = int(size * 0.24)
    gap = max(2, int(size * 0.028))

    # Bar shaft.
    d.rounded_rectangle(
        [pad, cy - bar_h // 2, size - pad, cy + bar_h // 2],
        radius=bar_h // 2, fill=ACCENT,
    )

    # Two plates a side: the taller one inboard.
    for sign in (-1, 1):
        x_in = cy + sign * (int(size * 0.13))
        x_out = cy + sign * (int(size * 0.13) + plate_w + gap)
        for x, h in ((x_in, inner_h), (x_out, outer_h)):
            left = min(x, x + sign * plate_w)
            right = max(x, x + sign * plate_w)
            d.rounded_rectangle(
                [left, cy - h // 2, right, cy + h // 2],
                radius=max(2, plate_w // 3), fill=ACCENT,
            )
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        ("icon-180.png", 180, 0.16, True),
        ("icon-192.png", 192, 0.16, True),
        ("icon-512.png", 512, 0.16, True),
        # Maskable icons get a much larger safe margin — Android crops to a
        # circle and anything near the edge is lost.
        ("icon-maskable-512.png", 512, 0.28, False),
    ]
    for name, size, pad, rounded in specs:
        img = barbell(size, pad, rounded)
        img.save(OUT / name, "PNG", optimize=True)
        print(f"wrote {OUT / name} ({size}×{size})")


if __name__ == "__main__":
    main()
