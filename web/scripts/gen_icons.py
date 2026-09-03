"""Generate PWA icons from the Beacon logo.

Output:
    public/pwa-192.png       — standard 192x192 (transparent rounded background)
    public/pwa-512.png       — standard 512x512
    public/pwa-maskable.png  — 512x512 with full-bleed background (Android adaptive icon)
    public/apple-touch-icon.png — 180x180 for iOS home screen

Renders the radar/compass logo directly with Pillow — no external SVG tools required.
"""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent.parent / "public"
BG = (11, 14, 19, 255)         # #0b0e13
ACCENT = (59, 130, 246, 255)   # #3b82f6


def _draw_logo(img: Image.Image, size: int, safe_frac: float = 1.0) -> None:
    """Draw the radar/compass mark centered on `img`.

    `safe_frac` shrinks the logo (1.0 = fill, 0.7 = 70% of frame — used for
    maskable icons so the mark lives inside Android's inner "safe zone").
    """
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    logo_r = size * 0.32 * safe_frac       # outermost ring radius

    def _ring(r: float, opacity: float, width: int) -> None:
        d.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=ACCENT[:3] + (int(255 * opacity),),
            width=width,
        )

    stroke_w = max(2, int(size / 40))
    _ring(logo_r,          0.35, stroke_w)
    _ring(logo_r * 0.60,   0.55, stroke_w)

    dot_r = logo_r * 0.22
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=ACCENT)

    tick_inner = logo_r * 1.15
    tick_outer = logo_r * 1.35
    tick_w = max(2, int(size / 45))
    for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
        d.line(
            [
                (cx + dx * tick_inner, cy + dy * tick_inner),
                (cx + dx * tick_outer, cy + dy * tick_outer),
            ],
            fill=ACCENT[:3] + (200,),
            width=tick_w,
        )


def make_standard(size: int, path: Path) -> None:
    """Rounded-square icon on transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size, size], radius=radius, fill=BG)
    _draw_logo(img, size)
    img.save(path, "PNG")


def make_maskable(size: int, path: Path) -> None:
    """Full-bleed background, logo constrained to Android's safe zone (~80%)."""
    img = Image.new("RGBA", (size, size), BG)
    _draw_logo(img, size, safe_frac=0.78)
    img.save(path, "PNG")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    make_standard(192, OUT / "pwa-192.png")
    make_standard(512, OUT / "pwa-512.png")
    make_maskable(512, OUT / "pwa-maskable.png")
    make_standard(180, OUT / "apple-touch-icon.png")
    print("wrote:")
    for p in ["pwa-192.png", "pwa-512.png", "pwa-maskable.png", "apple-touch-icon.png"]:
        print(f"  public/{p}")


if __name__ == "__main__":
    main()
