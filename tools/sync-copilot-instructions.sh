#!/usr/bin/env bash
# Copy the project's live Copilot instructions into this skills repo.
#
# VS Code reads .github/copilot-instructions.md only from that exact path, so the live
# file stays in the project and this repo keeps a copy for reuse in other projects.
#
#   tools/sync-copilot-instructions.sh [project-root]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$(cd "${1:-.}" && pwd)"
SRC="$PROJECT_ROOT/.github/copilot-instructions.md"
DST="$REPO_ROOT/copilot-instructions.md"

if [[ ! -f "$SRC" ]]; then
    echo "нет файла: $SRC" >&2
    echo "usage: $0 [project-root]   (где лежит .github/copilot-instructions.md)" >&2
    exit 1
fi

if [[ -f "$DST" ]] && cmp -s "$SRC" "$DST"; then
    echo "копия уже совпадает: $DST"
    exit 0
fi

cp "$SRC" "$DST"
echo "обновлено: $DST"
echo "проверьте дифф: git -C '$REPO_ROOT' diff --stat"
