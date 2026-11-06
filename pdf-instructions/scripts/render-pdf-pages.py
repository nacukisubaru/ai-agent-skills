#!/usr/bin/env python3
"""Render PDF pages to PNG so they can be looked at (vision) page by page.

    python3 render-pdf-pages.py example/footer-links-admin-guide.pdf /tmp/guide
    python3 render-pdf-pages.py out/instruction.pdf /tmp/check --dpi 140

Writes <out>/page-01.png, page-02.png, … and prints page sizes.
Used for two things: study the reference guide before building a new one, and
check the assembled PDF page by page afterwards.
"""

import argparse
import pathlib
import sys

import fitz


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("outdir")
    ap.add_argument("--dpi", type=int, default=110)
    args = ap.parse_args()

    pdf = pathlib.Path(args.pdf)
    out = pathlib.Path(args.outdir)
    if not pdf.exists():
        print(f"нет файла: {pdf}", file=sys.stderr)
        return 1
    out.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf)
    for i, page in enumerate(doc, 1):
        path = out / f"page-{i:02d}.png"
        page.get_pixmap(dpi=args.dpi).save(path)
        print(f"{path}  {page.rect.width:.0f}x{page.rect.height:.0f}pt")
    print(f"страниц: {len(doc)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
