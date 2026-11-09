"""
Готує фото для сайту: AVIF + WebP + JPEG у кількох ширинах і manifest.json
з розмірами (для srcset і width/height без стрибків верстки).

Запуск (з папки site/):
    pip install pillow pillow-heif
    python tools/optimize_images.py ..

Аргумент: папка з оригіналами фото. Результат: static/img/.
Щоб додати фото, допишіть його в список JOBS нижче.
"""
import json
import os
import sys

from PIL import Image, ImageOps

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # HEIC тоді не відкриються, решта працює
    pass

SRC = sys.argv[1] if len(sys.argv) > 1 else ".."
OUT = os.path.join(os.path.dirname(__file__), "..", "static", "img")

# (назва на сайті, файл-оригінал, обрізка (l, t, r, b) у частках або None, ширини)
JOBS = [
    ("hero", "IMG_0071.jpg", None, [480, 720, 933]),
    ("about", "IMG_0055.jpg", None, [480, 800, 1200]),
    ("portrait-1", "IMG_0035.jpg", None, [400, 700, 1000]),
    ("portrait-3", "IMG_0036.jpg", None, [400, 700, 1000]),
    ("portrait-4", "IMG_0001.jpg", None, [400, 700, 1000]),
    ("studio", "IMG_3037.JPG", (0, 0, 1, 0.37), [480, 960]),
    ("work-nude-long", "IMG_1827.JPG", None, [400, 700, 960]),
    ("work-glitter", "IMG_3019.JPG", None, [400, 700, 960]),
    ("work-nude-short", "IMG_3104.JPG", None, [400, 700, 960]),
    ("work-milky", "IMG_7552.JPG", None, [400, 700, 960]),
    ("work-pedicure", "IMG_8353.JPG", None, [400, 700, 960]),
    ("work-ombre", "IMG_9205.HEIC", None, [400, 700, 1200]),
    ("work-shimmer", "IMG_4317.PNG", (0.007, 0.0693, 0.993, 0.4765), [400, 700, 1100]),
    ("before-shimmer", "IMG_4317.PNG", (0.007, 0.4805, 0.993, 0.888), [400, 700, 1100]),
]


def save_all(im, name, widths, manifest):
    entry = {"w": im.width, "h": im.height, "widths": []}
    for w in widths:
        w = min(w, im.width)
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS) if w != im.width else im
        base = os.path.join(OUT, f"{name}-{w}")
        r.save(base + ".avif", quality=55, speed=4)
        r.save(base + ".webp", quality=78, method=6)
        r.save(base + ".jpg", quality=80, optimize=True, progressive=True)
        if w not in entry["widths"]:
            entry["widths"].append(w)
    manifest[name] = entry


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for name, file, crop, widths in JOBS:
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, file))).convert("RGB")
        if crop:
            W, H = im.size
            l, t, r, b = crop
            im = im.crop((round(l * W), round(t * H), round(r * W), round(b * H)))
        save_all(im, name, widths, manifest)
        print("ok", name, im.size)

    # Open Graph 1200x630 з hero-фото
    og = ImageOps.exif_transpose(Image.open(os.path.join(SRC, "IMG_0071.jpg"))).convert("RGB")
    og = ImageOps.fit(og, (1200, 630), Image.LANCZOS, centering=(0.5, 0.22))
    og.save(os.path.join(OUT, "og.jpg"), quality=82, optimize=True, progressive=True)

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("manifest", len(manifest))


if __name__ == "__main__":
    main()
