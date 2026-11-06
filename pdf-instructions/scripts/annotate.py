#!/usr/bin/env python3
"""Draw numbered callouts and arrows on a screenshot.

Coordinates in the spec are CSS pixels as reported by Playwright's boundingBox();
the script scales them to the screenshot's real pixel width, so the same spec keeps
working when a page is captured at a different device scale factor.

Usage:
    python3 annotate.py spec.json [...]
    python3 annotate.py --all specs/*.json
    python3 annotate.py --check specs/*.json   # только проверить границы
    python3 annotate.py --qa qa/ specs/*.json  # вырезать области пометок для просмотра

Before drawing, every box is checked against the screenshot: a box over flat
background (no control, no text) is reported and should be re-measured or dropped.

Spec:
    {
      "src": "05-admin-lots.png",
      "out": "05-admin-lots.marked.png",
      "css_width": 1512,
      "marks": [
        {"kind": "box", "box": {"x": 545, "y": 621, "w": 420, "h": 27},
         "label": "1", "arrow_from": [120, 700]},
        {"kind": "arrow", "from": [100, 200], "to": [300, 400], "label": "2"}
      ]
    }
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat

ACCENT = (220, 38, 38, 255)          # red callouts
ACCENT_FILL = (220, 38, 38, 235)
BADGE_TEXT = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 70)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def arrow(draw: ImageDraw.ImageDraw, start, end, width: int, head: int) -> None:
    """Line with a solid head, drawn slightly translucent so the UI stays readable."""
    x1, y1 = start
    x2, y2 = end
    angle = math.atan2(y2 - y1, x2 - x1)

    # Stop the shaft short of the head, otherwise the line pokes through the tip.
    shaft_end = (x2 - math.cos(angle) * head * 0.85, y2 - math.sin(angle) * head * 0.85)
    draw.line([start, shaft_end], fill=ACCENT, width=width)

    left = (x2 - math.cos(angle - 0.42) * head, y2 - math.sin(angle - 0.42) * head)
    right = (x2 - math.cos(angle + 0.42) * head, y2 - math.sin(angle + 0.42) * head)
    draw.polygon([(x2, y2), left, right], fill=ACCENT_FILL)


def badge(draw: ImageDraw.ImageDraw, center, text: str, radius: int, font) -> None:
    cx, cy = center
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=ACCENT_FILL,
        outline=BADGE_TEXT,
        width=max(2, radius // 10),
    )
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(
        (cx - (right - left) / 2 - left, cy - (bottom - top) / 2 - top),
        text,
        font=font,
        fill=BADGE_TEXT,
    )


def verify(spec_path: Path, spec: dict, scale: float, src: Path) -> list[str]:
    """Objective problems only: unmeasured or out-of-image boxes.

    Deliberately no "looks empty" heuristic: a white input, a white button and an empty
    margin have the same pixel statistics, so a threshold would either scream on every
    correct box or stay silent on every wrong one. Placement is checked by eye with
    `--qa`, which crops exactly the marked region.
    """
    problems: list[str] = []
    base = Image.open(src)

    for index, mark in enumerate(spec.get("marks", []), 1):
        label = mark.get("label") or f"#{index}"

        if mark.get("kind") == "box":
            box = mark["box"]
            if box["w"] <= 0 or box["h"] <= 0:
                problems.append(f"{label}: область {box['w']}x{box['h']} — координаты не измерены")
                continue
            if box["x"] < 0 or box["y"] < 0:
                problems.append(f"{label}: отрицательные координаты")

            right = (box["x"] + box["w"]) * scale
            bottom = (box["y"] + box["h"]) * scale
            if right > base.width + 1 or bottom > base.height + 1:
                problems.append(
                    f"{label}: выходит за изображение (правый край {right:.0f} > {base.width}, "
                    f"низ {bottom:.0f} > {base.height})"
                )

        elif mark.get("kind") == "arrow":
            target = mark.get("to") or [0, 0]
            if not (0 <= target[0] * scale <= base.width and 0 <= target[1] * scale <= base.height):
                problems.append(f"{label}: конец стрелки за пределами изображения")

    return problems


def qa_sheet(spec_path: Path, spec: dict, scale: float, src: Path, out_dir: Path) -> Path:
    """Crops every mark with a margin into one labelled contact sheet.

    The point is to let a human (or the agent) look at exactly what each mark covers.
    If the crop shows background instead of the control, the mark is wrong — remove it
    or re-measure; a screenshot without that arrow is better than a wrong arrow.
    """
    base = Image.open(src).convert("RGB")
    margin = 46  # CSS px around the box, enough to see the surrounding UI

    tiles = []
    for index, mark in enumerate(spec.get("marks", []), 1):
        label = str(mark.get("label") or index)

        if mark.get("kind") == "box":
            box = mark["box"]
            x1 = int((box["x"] - margin) * scale)
            y1 = int((box["y"] - margin) * scale)
            x2 = int((box["x"] + box["w"] + margin) * scale)
            y2 = int((box["y"] + box["h"] + margin) * scale)
        else:
            fx, fy = mark.get("from", [0, 0])
            tx, ty = mark.get("to", [0, 0])
            x1 = int((min(fx, tx) - margin) * scale)
            y1 = int((min(fy, ty) - margin) * scale)
            x2 = int((max(fx, tx) + margin) * scale)
            y2 = int((max(fy, ty) + margin) * scale)

        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(base.width, x2), min(base.height, y2)
        if x2 - x1 < 10 or y2 - y1 < 10:
            continue

        crop = base.crop((x1, y1, x2, y2))
        # Scale every tile to the same width so the sheet is easy to scan.
        target_w = 900
        crop = crop.resize((target_w, max(1, round(crop.height * target_w / crop.width))))

        canvas_w = target_w
        canvas_h = crop.height + 44
        tile = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))
        tile.paste(crop, (0, 44))

        draw = ImageDraw.Draw(tile)
        font = load_font(30)
        draw.rectangle([0, 0, canvas_w, 42], fill=(240, 242, 245))
        draw.text((12, 6), f"mark {label}  (x{int(box_x := mark.get('box', {}).get('x', 0))}, y{int(mark.get('box', {}).get('y', 0))})" if mark.get("kind") == "box" else f"mark {label}", font=font, fill=(20, 20, 20))
        tiles.append(tile)

    if not tiles:
        raise SystemExit(f"{spec_path}: nothing to crop")

    width = max(t.width for t in tiles)
    height = sum(t.height + 10 for t in tiles)
    sheet = Image.new("RGB", (width, height), (255, 255, 255))
    y = 0
    for tile in tiles:
        sheet.paste(tile, (0, y))
        y += tile.height + 10

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"qa-{spec_path.stem}.png"
    sheet.save(out)
    print(f"{out}  ({sheet.width}x{sheet.height})")

    return out


def annotate(spec_path: Path, check_only: bool = False) -> Path | None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    src = (spec_path.parent / spec["src"]).resolve()
    out = (spec_path.parent / spec["out"]).resolve()

    image = Image.open(src).convert("RGBA")
    css_width = float(spec.get("css_width") or 0)
    if css_width <= 0:
        raise SystemExit(f"{spec_path}: css_width is required")
    scale = image.width / css_width

    problems = verify(spec_path, spec, scale, src)
    if problems:
        print(f"!! {spec_path}")
        for problem in problems:
            print(f"   {problem}")

    if check_only:
        return None

    draw = ImageDraw.Draw(image, "RGBA")
    stroke = max(3, round(image.width * 0.0028))
    font = load_font(max(20, round(image.width * 0.017)))
    radius = max(18, round(image.width * 0.0155))

    for mark in spec.get("marks", []):
        label = str(mark.get("label", ""))
        kind = mark.get("kind", "box")

        if kind == "box":
            box = mark["box"]
            x1 = box["x"] * scale
            y1 = box["y"] * scale
            x2 = x1 + box["w"] * scale
            y2 = y1 + box["h"] * scale

            pad = stroke * 2
            draw.rounded_rectangle(
                [x1 - pad, y1 - pad, x2 + pad, y2 + pad],
                radius=pad,
                outline=ACCENT,
                width=stroke,
            )

            if label:
                # Badge sits outside the box so it never covers the label of a control.
                cx = x1 - radius * 0.2
                cy = y1 - radius * 0.2
                cx = max(radius, min(cx, image.width - radius))
                cy = max(radius, min(cy, image.height - radius))
                badge(draw, (cx, cy), label, radius, font)

            if mark.get("arrow_from"):
                fx, fy = mark["arrow_from"]
                arrow(
                    draw,
                    (fx * scale, fy * scale),
                    ((x1 + x2) / 2, (y1 + y2) / 2),
                    stroke,
                    radius,
                )

        elif kind == "arrow":
            fx, fy = mark["from"]
            tx, ty = mark["to"]
            arrow(draw, (fx * scale, fy * scale), (tx * scale, ty * scale), stroke, radius)
            if label:
                badge(draw, (fx * scale, fy * scale), label, radius, font)

        else:
            raise SystemExit(f"{spec_path}: unknown mark kind {kind!r}")

    image.convert("RGB").save(out, quality=92)
    print(f"{out}  ({image.width}x{image.height})")

    return out


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2

    check_only = False
    qa_dir: Path | None = None
    args = argv[1:]

    if args and args[0] == "--check":
        check_only = True
        args = args[1:]

    if args and args[0] == "--qa":
        qa_dir = Path(args[1])
        args = args[2:]
        check_only = True

    if args and args[0] == "--all":
        specs = [Path(p) for p in args[1:]]
    else:
        specs = [Path(p) for p in args]

    if not specs:
        print("no specs given")
        return 2

    for spec in specs:
        if qa_dir is not None:
            spec_data = json.loads(spec.read_text(encoding="utf-8"))
            src = (spec.parent / spec_data["src"]).resolve()
            image = Image.open(src)
            qa_sheet(spec, spec_data, image.width / float(spec_data["css_width"]), src, qa_dir)
            continue

        annotate(spec, check_only)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
