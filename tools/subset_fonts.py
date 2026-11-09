"""
Обрізає шрифти до потрібних символів і ваг (менше байтів → швидший перший рендер).

Запуск (з папки site/):
    pip install fonttools brotli
    python tools/subset_fonts.py

Джерело: node_modules/@fontsource-variable/* (оригінальні підмножини Google Fonts).
Результат: static/fonts/*.woff2 з тими самими іменами (CSS не змінюється).
Набір символів: усе, що є в src/ і content/, плюс повна українська абетка,
ASCII, чеські літери й типографські знаки, тож нові тексти теж відобразяться.
"""
import io
import os
import pathlib

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "fonts"

FAMILIES = [
    # (папка fontsource, префікс файлу, стилі, діапазон ваг)
    ("cormorant-garamond", "cormorant-garamond", ["normal", "italic"], (400, 600)),
    ("manrope", "manrope", ["normal"], (400, 700)),
]
SUBSETS = ["cyrillic", "latin", "latin-ext"]


def codepoints():
    cps = set(range(0x20, 0x7F))  # ASCII
    cps |= set(range(0x0410, 0x0450)) | {0x0401, 0x0451, 0x0404, 0x0454, 0x0406, 0x0456, 0x0407, 0x0457, 0x0490, 0x0491}
    cps |= {0x2116, 0x0301, 0x02BC, 0x00A0, 0x00AB, 0x00BB, 0x00A9, 0x00B0, 0x00B7, 0x00D7, 0x20AC}
    cps |= {0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2190, 0x2191, 0x2192, 0x2193}
    czech = "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž"
    cps |= {ord(c) for c in czech}
    # усе, що реально є в текстах сайту
    for folder in ("src", "content"):
        for p in (ROOT / folder).rglob("*"):
            if p.suffix in {".html", ".js", ".json", ".css"}:
                cps |= {ord(c) for c in p.read_text(encoding="utf-8") if ord(c) >= 0x20}
    return cps


def main():
    cps = codepoints()
    OUT.mkdir(parents=True, exist_ok=True)
    total_before = total_after = 0
    for pkg, prefix, styles, (wmin, wmax) in FAMILIES:
        src_dir = ROOT / "node_modules" / "@fontsource-variable" / pkg / "files"
        for style in styles:
            for sub in SUBSETS:
                name = f"{prefix}-{sub}-wght-{style}.woff2"
                src = src_dir / name
                font = TTFont(src)
                axis = next(a for a in font["fvar"].axes if a.axisTag == "wght")
                lo, hi = max(wmin, axis.minValue), min(wmax, axis.maxValue)
                font = instancer.instantiateVariableFont(font, {"wght": (lo, hi)})
                buf = io.BytesIO()  # перезавантажуємо: subsetter не любить «ліниві» gvar після instancer
                font.save(buf)
                buf.seek(0)
                font = TTFont(buf)
                cmap = font.getBestCmap()
                keep = sorted(cp for cp in cps if cp in cmap)
                opts = subset.Options()
                opts.flavor = "woff2"
                opts.layout_features = ["*"]
                opts.name_IDs = ["*"]
                opts.notdef_outline = True
                sub_ = subset.Subsetter(opts)
                sub_.populate(unicodes=keep)
                sub_.subset(font)
                dst = OUT / name
                font.flavor = "woff2"
                font.save(dst)
                b, a = os.path.getsize(src), os.path.getsize(dst)
                total_before += b
                total_after += a
                print(f"{name:52} {b/1024:6.1f} KB -> {a/1024:6.1f} KB  ({len(keep)} glyphs, wght {lo:.0f}-{hi:.0f})")
    print(f"TOTAL {total_before/1024:.1f} KB -> {total_after/1024:.1f} KB")


if __name__ == "__main__":
    main()
