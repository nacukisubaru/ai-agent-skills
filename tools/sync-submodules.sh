#!/usr/bin/env bash
# Point the .github/skills submodule of every project at the latest skills commit.
#
#   tools/sync-submodules.sh [projects-root] [--dry-run]
#
# Only projects whose .gitmodules registers .github/skills with the ai-agent-skills
# URL are touched. Nothing is committed or pushed: the pointer change stays in the
# project working tree for a normal commit.
set -uo pipefail

ROOT="/Users/aleksandrkrestinskij/projects"
DRY=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY=1 ;;
        *) ROOT="$arg" ;;
    esac
done

SKILLS_REPO="$(cd "$(dirname "$0")/.." && pwd)"
URL_PATTERN="ai-agent-skills"

if [[ ! -d "$ROOT" ]]; then
    echo "нет каталога: $ROOT" >&2
    exit 1
fi

found=0
failed=0

for project in "$ROOT"/*/; do
    project="${project%/}"
    [[ "$project" == "$SKILLS_REPO" ]] && continue
    [[ -f "$project/.gitmodules" ]] || continue
    grep -q "path = .github/skills" "$project/.gitmodules" 2>/dev/null || continue
    grep -q "$URL_PATTERN" "$project/.gitmodules" 2>/dev/null || continue

    found=$((found + 1))
    name="$(basename "$project")"
    sha() { git -C "$project" submodule status .github/skills 2>/dev/null | awk '{print $1}' | head -1; }
    before="$(sha)"; before="${before:--}"

    if [[ $DRY -eq 1 ]]; then
        echo "$name: $before (dry-run, не обновляли)"
        continue
    fi

    if ! git -C "$project" submodule update --remote --merge .github/skills >/dev/null 2>&1; then
        echo "$name: ОШИБКА обновления сабмодуля" >&2
        failed=$((failed + 1))
        continue
    fi

    after="$(sha)"; after="${after:--}"
    if [[ "$before" == "$after" ]]; then
        echo "$name: $before (без изменений)"
    else
        echo "$name: $before → $after  указатель изменён, нужен коммит"
    fi
done

echo
echo "проектов с сабмодулем: $found, ошибок: $failed"
[[ $found -eq 0 ]] && echo "сабмодулей не найдено — проверьте каталог: $ROOT"
[[ $failed -eq 0 ]]
