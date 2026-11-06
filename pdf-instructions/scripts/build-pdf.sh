#!/usr/bin/env bash
# Build a PDF from an HTML file with headless Chrome.
#
#   build-pdf.sh instruction.html out.pdf
#
# Chrome is used instead of wkhtmltopdf/weasyprint because it is already present on the
# developer machine and renders modern CSS (flex, grid, @page margins) correctly.
set -euo pipefail

HTML="${1:?usage: build-pdf.sh instruction.html out.pdf}"
PDF="${2:?usage: build-pdf.sh instruction.html out.pdf}"

CHROME="${CHROME_BIN:-}"
if [[ -z "$CHROME" ]]; then
    for candidate in \
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        "/Applications/Chromium.app/Contents/MacOS/Chromium" \
        "$(command -v google-chrome || true)" \
        "$(command -v chromium || true)" \
        "$(command -v chromium-browser || true)"
    do
        if [[ -n "$candidate" && -x "$candidate" ]]; then
            CHROME="$candidate"
            break
        fi
    done
fi

if [[ -z "$CHROME" ]]; then
    echo "Chrome not found. Set CHROME_BIN=/path/to/chrome" >&2
    exit 1
fi

HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
PDF_ABS="$(cd "$(dirname "$PDF")" 2>/dev/null && pwd || pwd)/$(basename "$PDF")"

"$CHROME" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --no-pdf-header-footer \
    --virtual-time-budget=15000 \
    --print-to-pdf="$PDF_ABS" \
    "file://$HTML_ABS" 2>&1 | grep -vE "CVDisplayLink|allocator|GPU|Skia|Fontconfig" || true

if [[ ! -s "$PDF_ABS" ]]; then
    echo "PDF was not created: $PDF_ABS" >&2
    exit 1
fi

SIZE="$(wc -c < "$PDF_ABS" | tr -d ' ')"
echo "PDF: $PDF_ABS ($SIZE bytes)"
