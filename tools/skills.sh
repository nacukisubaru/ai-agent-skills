#!/usr/bin/env bash
# Общий инструмент для скиллов во всех проектах.
#
#   tools/skills.sh update [root]     обновить скиллы во всех проектах
#   tools/skills.sh status [root]     показать версию скиллов в каждом проекте
#   tools/skills.sh init <path>       подключить новый проект
#
# root по умолчанию — ~/projects. Для поиска проектов не нужен .gitmodules:
# берётся любой каталог, где .github/skills — git-репозиторий с origin этого
# репозитория скиллов. Поэтому одинаково работают и сабмодуль, и обычный клон.
set -uo pipefail

SKILLS_REPO="$(cd "$(dirname "$0")/.." && pwd)"
URL_PATTERN="ai-agent-skills"
DEFAULT_ROOT="$HOME/projects"

info() { printf '%s\n' "$*"; }
err()  { printf '%s\n' "$*" >&2; }

# Проект ли это со скиллами: <dir>/.github/skills — git с нужным origin.
is_skills_project() {
    local dir="$1/.github/skills"
    [[ -d "$dir/.git" || -f "$dir/.git" ]] || return 1
    git -C "$dir" remote get-url origin 2>/dev/null | grep -q "$URL_PATTERN" || return 1
    return 0
}

# Версия скиллов в проекте.
skills_sha() {
    git -C "$1/.github/skills" rev-parse --short HEAD 2>/dev/null || echo '-'
}

# Обновить одну папку. Возвращает 0, если всё хорошо.
update_one() {
    local project="$1"
    local dir="$project/.github/skills"
    local before after
    before="$(skills_sha "$project")"

    if [[ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]]; then
        err "$(basename "$project"): в .github/skills есть незакоммиченные правки — пропущен"
        return 1
    fi

    # fetch + merge --ff-only, а не pull: у сабмодуля HEAD может быть detached.
    if ! git -C "$dir" fetch --quiet origin >/dev/null 2>&1; then
        err "$(basename "$project"): не удалось сделать fetch"
        return 1
    fi
    local branch
    branch="$(git -C "$dir" symbolic-ref -q --short HEAD || echo main)"
    if ! git -C "$dir" merge --ff-only --quiet "origin/$branch" >/dev/null 2>&1; then
        err "$(basename "$project"): не удалось обновить (возможны расхождения с origin)"
        return 1
    fi

    after="$(skills_sha "$project")"
    if [[ "$before" == "$after" ]]; then
        info "$(basename "$project"): $after (без изменений)"
    else
        info "$(basename "$project"): $before → $after"
    fi
    return 0
}

# Все проекты под root, где есть скиллы.
find_projects() {
    local root="$1"
    local candidate
    for candidate in "$root"/*/ "$root"/*/*/; do
        local dir="${candidate%/}"
        [[ "$dir" == "$SKILLS_REPO" ]] && continue
        [[ "$(dirname "$dir")" == "$SKILLS_REPO" ]] && continue
        is_skills_project "$dir" && printf '%s\n' "$dir"
    done
}

cmd_status() {
    local root="${1:-$DEFAULT_ROOT}"
    [[ -d "$root" ]] || { err "нет каталога: $root"; return 1; }
    local found=0 project
    while IFS= read -r project; do
        found=$((found + 1))
        local branch
        branch="$(git -C "$project/.github/skills" symbolic-ref -q --short HEAD || echo detached)"
        printf '%-28s %s  (%s)\n' "$(basename "$project")" "$(skills_sha "$project")" "$branch"
    done < <(find_projects "$root")
    [[ $found -eq 0 ]] && info "проектов со скиллами не найдено в $root"
    return 0
}

cmd_update() {
    local root="${1:-$DEFAULT_ROOT}"
    [[ -d "$root" ]] || { err "нет каталога: $root"; return 1; }
    local found=0 failed=0 project
    while IFS= read -r project; do
        found=$((found + 1))
        update_one "$project" || failed=$((failed + 1))
    done < <(find_projects "$root")
    info ""
    info "проектов: $found, ошибок: $failed"
    [[ $found -eq 0 ]] && err "подключите проект: tools/skills.sh init <path>"
    [[ $failed -eq 0 ]]
}

cmd_init() {
    local path="${1:-}"
    [[ -n "$path" ]] || { err "usage: tools/skills.sh init <path>"; return 2; }
    mkdir -p "$path" || return 1
    path="$(cd "$path" && pwd)"

    # 1. git в папке, если его ещё нет
    if [[ ! -d "$path/.git" ]]; then
        git -C "$path" init -q -b main && info "git init: $path"
    fi

    # 2. .gitignore: .github целиком локальный
    local gi="$path/.gitignore"
    if [[ ! -f "$gi" ]] || ! grep -q '^\.github/$' "$gi"; then
        {
            [[ -s "$gi" ]] && printf '\n'
            printf '# Локальные данные агента: .github не версионируется.\n'
            printf '# Скиллы: https://github.com/nacukisubaru/ai-agent-skills (клон в .github/skills).\n'
            printf '.github/\n'
        } >> "$gi"
        info ".gitignore: добавлено .github/"
    fi

    # 3. скиллы в .github/skills
    local dir="$path/.github/skills"
    mkdir -p "$path/.github"
    if [[ -d "$dir/.git" || -f "$dir/.git" ]]; then
        update_one "$path" || true
    else
        if git clone -q "git@github.com:nacukisubaru/ai-agent-skills.git" "$dir"; then
            info "skills: $(git -C "$dir" rev-parse --short HEAD)"
        else
            err "не удалось клонировать скиллы в $dir"
            return 1
        fi
    fi

    # 4. указатель для VS Code
    local ptr="$path/.github/copilot-instructions.md"
    if [[ ! -f "$ptr" ]]; then
        cat > "$ptr" <<'EOF'
# Правила работы

Все инструкции проекта лежат в одном файле:

**`.github/skills/copilot-instructions.md`**

Прочитать этот файл целиком **до начала любой задачи** и следовать ему как
always-on правилам: карта скиллов, доступы, обязательный цикл, запреты.

Если файла нет (не склонирован репозиторий со скиллами) — сообщить об этом
пользователю и работать по общим правилам, а не выдумывать содержимое.
EOF
        info "указатель: .github/copilot-instructions.md"
    fi

    # 5. локальные данные проекта (в git не идут, .github/ уже игнорируется)
    info ""
    info "готово. Дальше:"
    info "  доступы:   .github/.env.local (см. .github/skills/templates/env.example)"
    info "  заметки:   .github/project-features.md (см. templates/project-features.example.md)"
    return 0
}

case "${1:-}" in
    update) shift; cmd_update "${1:-$DEFAULT_ROOT}" ;;
    status) shift; cmd_status "${1:-$DEFAULT_ROOT}" ;;
    init)   shift; cmd_init "${1:-}" ;;
    *)      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
