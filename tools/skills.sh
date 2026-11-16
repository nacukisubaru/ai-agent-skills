#!/usr/bin/env bash
# Глобальная копия скиллов для OpenCode.
#
#   tools/skills.sh update     обновить ~/.config/opencode/skills из git
#   tools/skills.sh status     показать версию глобальной копии
#   tools/skills.sh init       создать конфиг-репозиторий и submodule скиллов
#
# Скиллы живут в ~/.config/opencode/skills и подключены как git submodule
# каталога ~/.config/opencode. Отдельных копий в проектах нет.
set -uo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
SKILLS_DIR="$CONFIG_DIR/skills"
SKILLS_URL="git@github.com:nacukisubaru/ai-agent-skills.git"

info() { printf '%s\n' "$*"; }
err()  { printf '%s\n' "$*" >&2; }

config_is_git() { [[ -d "$CONFIG_DIR/.git" ]]; }
skills_is_git() { [[ -d "$SKILLS_DIR/.git" || -f "$SKILLS_DIR/.git" ]]; }

cmd_status() {
    if ! skills_is_git; then
        err "скиллы не установлены: $SKILLS_DIR"
        err "запустите: $0 init"
        return 1
    fi
    local sha branch
    sha="$(git -C "$SKILLS_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"
    branch="$(git -C "$SKILLS_DIR" symbolic-ref -q --short HEAD || echo detached)"
    printf '%-38s %s  (%s)\n' "$SKILLS_DIR" "$sha" "$branch"
    return 0
}

cmd_update() {
    if ! config_is_git; then
        err "нет git-репозитория конфига: $CONFIG_DIR"
        err "запустите: $0 init"
        return 1
    fi
    if ! skills_is_git; then
        err "нет submodule скиллов: $SKILLS_DIR"
        err "запустите: $0 init"
        return 1
    fi
    if [[ -n "$(git -C "$SKILLS_DIR" status --porcelain 2>/dev/null)" ]]; then
        err "в $SKILLS_DIR есть незакоммиченные правки — пропущен"
        return 1
    fi
    if ! git -C "$CONFIG_DIR" submodule update --remote --merge --init skills; then
        err "не удалось обновить submodule skills в $CONFIG_DIR"
        return 1
    fi
    cmd_status
}

cmd_init() {
    mkdir -p "$CONFIG_DIR" || return 1

    if ! config_is_git; then
        git init -q -b main "$CONFIG_DIR" && info "git init: $CONFIG_DIR"
    fi

    local gi="$CONFIG_DIR/.gitignore"
    if [[ ! -f "$gi" ]] || ! grep -q '^service\.json$' "$gi"; then
        {
            [[ -s "$gi" ]] && printf '\n'
            printf '# Локальное состояние OpenCode, не для git.\n'
            printf 'service.json\n.DS_Store\n'
        } >> "$gi"
        info ".gitignore: service.json"
    fi

    if skills_is_git; then
        info "skills уже установлены: $SKILLS_DIR"
    else
        if [[ -e "$SKILLS_DIR" ]]; then
            err "$SKILLS_DIR уже существует и не является git-репозиторием"
            err "уберите его или подключите вручную как submodule"
            return 1
        fi
        git -C "$CONFIG_DIR" submodule add "$SKILLS_URL" skills || return 1
    fi

    info ""
    info "Проверьте, что в $CONFIG_DIR/opencode.json есть:"
    info '  "instructions": ["~/.config/opencode/skills/AGENTS.md"]'
    info ""
    info "Дальше:"
    info "  $0 status"
    info "  $0 update"
    return 0
}

case "${1:-}" in
    update) cmd_update ;;
    status) cmd_status ;;
    init)   cmd_init ;;
    *)      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
