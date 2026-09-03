"""Generate PWA icons from the Beacon logo source (`public/logo-source.png`).

Takes the high-res source, isolates the white mark on transparent, and
re-renders at every size the manifest + in-app UI need:

    public/logo.png            — 512x512 transparent (used inside the app)
    public/pwa-192.png         — 192x192 rounded square launcher
    public/pwa-512.png         — 512x512 rounded square launcher / splash source
    public/pwa-maskable.png    — 512x512 full-bleed for Android adaptive icons
    public/apple-touch-icon.png — 180x180 iOS home screen
    public/favicon.png         — 32x32 browser tab
"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent.parent
SRC = ROOT / "public" / "logo-source.png"
OUT = ROOT / "public"

BG = (11, 14, 19, 255)  # #0b0e13


def _load_mark() -> Image.Image:
    """Load source, threshold white-on-dark to opaque mark, trim to bbox."""
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            lum = (r + g + b) / 3
            if lum > 60:
                alpha = min(255, int((lum - 40) * 1.5))
                px[x, y] = (255, 255, 255, alpha)
            else:
                px[x, y] = (0, 0, 0, 0)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def _fit_mark(canvas: Image.Image, mark: Image.Image, safe_frac: float) -> None:
    cw, ch = canvas.size
    target = int(min(cw, ch) * safe_frac)
    scale = target / max(mark.size)
    new_size = (int(mark.size[0] * scale), int(mark.size[1] * scale))
    resized = mark.resize(new_size, Image.LANCZOS)
    ox = (cw - resized.size[0]) // 2
    oy = (ch - resized.size[1]) // 2
    canvas.paste(resized, (ox, oy), resized)


def make_rounded(
    size: int,
    path: Path,
    mark: Image.Image,
    safe_frac: float = 0.76,
    bg: tuple[int, int, int, int] = BG,
) -> None:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(icon).rounded_rectangle(
        [0, 0, size, size], radius=int(size * 0.22), fill=bg,
    )
    _fit_mark(icon, mark, safe_frac)
    icon.save(path, "PNG")


def make_transparent(size: int, path: Path, mark: Image.Image) -> None:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _fit_mark(icon, mark, safe_frac=0.94)
    icon.save(path, "PNG")


def make_maskable(size: int, path: Path, mark: Image.Image) -> None:
    icon = Image.new("RGBA", (size, size), BG)
    _fit_mark(icon, mark, safe_frac=0.62)
    icon.save(path, "PNG")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    mark = _load_mark()
    print(f"loaded logo: {mark.size[0]}x{mark.size[1]}")

    make_transparent(512, OUT / "logo.png", mark)
    make_rounded(192, OUT / "pwa-192.png", mark)
    make_rounded(512, OUT / "pwa-512.png", mark)
    make_maskable(512, OUT / "pwa-maskable.png", mark)
    make_rounded(180, OUT / "apple-touch-icon.png", mark)
    make_rounded(32, OUT / "favicon.png", mark, safe_frac=0.7)

    print("wrote:")
    for name in [
        "logo.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable.png",
        "apple-touch-icon.png",
        "favicon.png",
    ]:
        print(f"  public/{name}")


if __name__ == "__main__":
    main()
