#!/usr/bin/env bash
# Update the shared skills in every project under the projects root.
#
#   tools/sync-skills.sh [projects-root] [--dry-run]
#
# Handles both ways a project can carry the skills:
#   1. submodule  — .gitmodules registers .github/skills with the ai-agent-skills URL
#                   -> git submodule update --remote --merge
#   2. plain clone — .github/skills/.git exists and its origin is ai-agent-skills
#                   -> git pull --ff-only inside that clone
#
# Nothing is committed or pushed. A submodule update leaves a pointer change in the
# project working tree; commit it separately (see skill-maintenance).
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

[[ -d "$ROOT" ]] || { echo "нет каталога: $ROOT" >&2; exit 1; }

submodules=0
clones=0
failed=0

report() { # name before after mode
    local name="$1" before="$2" after="$3" mode="$4"
    if [[ "$before" == "$after" ]]; then
        echo "$name [$mode]: $before (без изменений)"
    elif [[ "$mode" == "submodule" ]]; then
        echo "$name [$mode]: $before → $after  указатель изменён, нужен коммит"
    else
        echo "$name [$mode]: $before → $after"
    fi
}

submodule_branch() { # project -> path of .github/skills
    [[ -f "$1/.gitmodules" ]] || return 1
    grep -q "path = .github/skills" "$1/.gitmodules" 2>/dev/null || return 1
    grep -q "$URL_PATTERN" "$1/.gitmodules" 2>/dev/null || return 1
    return 0
}

clone_branch() { # project -> path of .github/skills
    local dir="$1/.github/skills"
    [[ -d "$dir/.git" || -f "$dir/.git" ]] || return 1
    git -C "$dir" remote get-url origin 2>/dev/null | grep -q "$URL_PATTERN" || return 1
    return 0
}

for project in "$ROOT"/*/; do
    project="${project%/}"
    [[ "$project" == "$SKILLS_REPO" ]] && continue
    name="$(basename "$project")"

    if submodule_branch "$project"; then
        submodules=$((submodules + 1))
        sha() { git -C "$project" submodule status .github/skills 2>/dev/null | awk '{print substr($1, 1, 7)}' | head -1; }
        before="$(sha)"; before="${before:--}"

        if [[ $DRY -eq 1 ]]; then
            echo "$name [submodule]: $before (dry-run, не обновляли)"
            continue
        fi
        if ! git -C "$project" submodule update --remote --merge .github/skills >/dev/null 2>&1; then
            echo "$name [submodule]: ОШИБКА обновления" >&2
            failed=$((failed + 1))
            continue
        fi
        after="$(sha)"; after="${after:--}"
        report "$name" "$before" "$after" submodule
        continue
    fi

    if clone_branch "$project"; then
        clones=$((clones + 1))
        dir="$project/.github/skills"
        before="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo -)"

        if [[ $DRY -eq 1 ]]; then
            echo "$name [clone]: $before (dry-run, не обновляли)"
            continue
        fi
        if [[ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]]; then
            echo "$name [clone]: есть незакоммиченные правки в .github/skills — пропущен" >&2
            failed=$((failed + 1))
            continue
        fi
        # fetch + merge, а не pull: HEAD может быть detached (checkout сабмодуля
        # на ветке, где .gitmodules уже нет), pull в таком состоянии ругается.
        if ! git -C "$dir" fetch --quiet origin >/dev/null 2>&1 \
            || ! git -C "$dir" merge --ff-only --quiet origin/main >/dev/null 2>&1; then
            echo "$name [clone]: ОШИБКА обновления (возможны расхождения с origin)" >&2
            failed=$((failed + 1))
            continue
        fi
        after="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo -)"
        report "$name" "$before" "$after" clone
        continue
    fi
done

echo
echo "сабмодулей: $submodules, клонов: $clones, ошибок: $failed"
[[ $((submodules + clones)) -eq 0 ]] && echo "проектов со скиллами не найдено — проверьте каталог: $ROOT"
[[ $failed -eq 0 ]]
