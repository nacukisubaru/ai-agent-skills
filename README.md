# ai-agent-skills

Личные скиллы для OpenCode: процедуры, которые агент загружает по триггеру.
Один репозиторий — используется во всех проектах через глобальный каталог OpenCode.

## Состав

| Папка | Что внутри |
|---|---|
| `architecture/` | куда положить новый класс: слои, папки модуля, src/Shared, зависимости, новый модуль |
| `bitrix-component/` | компоненты, шаблоны, ассеты, миграции Bitrix (D7, Controllerable, nginx) |
| `bitrix-login/` | вход в Bitrix под администратором: мост вместо формы, LOGIN или EMAIL |
| `code-review/` | обязательное ревью диффа перед коммитом |
| `codebase-memory/` | порядок поиска по коду: граф → grep |
| `feature-workflow/` | план фаз, папка задачи, definition of done |
| `figma-layout/` | вёрстка по макету через Figma REST API |
| `git-commits/` | разбиение на коммиты, сообщения, пуш |
| `manual-testing/` | ручной сценарий проверки бэкенда |
| `merge-request/` | пуш ветки и MR в `dev` с саммари изменений |
| `pdf-instructions/` | PDF-инструкции со скриншотами, эталон в `example/` |
| `skill-maintenance/` | как править скиллы: коммит → подтверждение → пуш → обновление глобальной копии |
| `ui-testing-playwright/` | проверка интерфейса в браузере |
| `AGENTS.md` | always-on правила для всех проектов — источник истины |
| `templates/` | `env.example`, `project-config.example.md`, `project-rules.example.md` |
| `tools/` | `skills.sh` — `init`, `update`, `status` глобальной копии OpenCode |

## Установка в OpenCode (глобально)

Скиллы живут в `~/.config/opencode/skills` и подключаются как **git submodule**
каталога конфигурации OpenCode. Отдельных копий скиллов в проектах нет.

```bash
# каталог конфигурации OpenCode — git-репозиторий
git init -b main ~/.config/opencode

# скиллы — submodule этого репозитория
git -C ~/.config/opencode submodule add \
  git@github.com:nacukisubaru/ai-agent-skills.git skills
```

В `~/.config/opencode/.gitignore`:

```gitignore
service.json
.DS_Store
```

В `~/.config/opencode/opencode.json` — указатель на общие правила:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/.config/opencode/skills/AGENTS.md"]
}
```

OpenCode автоматически находит скиллы в `~/.config/opencode/skills` и загружает
`AGENTS.md` из этого же каталога через `instructions`. В проектах ничего
дополнительно подключать не нужно.

Всё то же самое делает `tools/skills.sh init`; повторный запуск безопасен.

### Обновление

```bash
~/projects/skills/tools/skills.sh update     # git submodule update --remote --merge
~/projects/skills/tools/skills.sh status     # версия глобальной копии
```

`update` обновляет submodule `skills` в `~/.config/opencode`. Отдельных
сабмодулей и клонов скиллов в проектах больше нет; старые копии нужно один раз
удалить.

## Проект: `project-config.md` и `project-rules.md`

В каждом проекте локальные данные агента лежат в `.opencode/`:

```
.opencode/
├── project-config.md   # только доступы: переменные, адрес стенда, id, вход
├── project-rules.md    # правила и особенности проекта, команды, архитектура
├── .env.local          # значения переменных
├── tasks/<slug>/       # планы и артефакты задач
├── docs/               # документация фичи
├── tests/<slug>/       # ручные сценарии
└── playwright-mcp/     # скриншоты и логи браузерных проверок
```

**`project-config.md`** — только то, что относится к доступам:

- какие переменные нужны;
- адрес стенда;
- ожидаемый id пользователя;
- чем именно входить в этом проекте;
- ограничения входа.

Всё остальное — стек, стенд, команды, архитектура, структура кода, тесты,
особенности и запреты — в **`project-rules.md`**. Этот файл агент обязан
учитывать постоянно при работе над проектом.

Скопировать шаблоны:

```bash
cp ~/.config/opencode/skills/templates/env.example .opencode/.env.local
cp ~/.config/opencode/skills/templates/project-config.example.md .opencode/project-config.md
cp ~/.config/opencode/skills/templates/project-rules.example.md .opencode/project-rules.md
```

Каталог `.opencode/` в проекте целиком локальный и должен быть в `.gitignore`.
Скиллов внутри `.opencode` быть не должно: скиллы теперь только глобальные.

## Доступы: где что лежит

**В скиллах нет ни одного пароля, логина или адреса стенда.** Скилл — общий для всех
проектов, доступы — свойство проекта. Два локальных файла, оба в `.gitignore`:

```
.opencode/project-config.md   # имена переменных, адрес, id, способ входа
.opencode/.env.local          # значения этих переменных
```

Порядок для агента:

1. `project-config.md` — какие переменные нужны, адрес, как входить, ожидаемый id.
2. `.env.local` — значения.
3. Нужной переменной нет → **спросить у пользователя**. Не подбирать, не заводить
   пользователя, не вставлять доступы в код, скриншоты и отчёты.

Токены внешних API — там же: `FIGMA_TOKEN` в `.opencode/.env.local`, в скилле
`figma-layout` только имя переменной.

Вход на платформу — отдельный скилл: для Bitrix это `bitrix-login`. Для другой
платформы добавляется свой скилл, а `project-config.md` указывает, какой именно.

Скрипты скиллов читают `.env.local` сами (`pdf-instructions/scripts/shot.mjs`:
окружение → `.opencode/.env.local` → `.env.local` → `.env`).

## AGENTS.md

Полные always-on правила лежат в глобальной копии:
`~/.config/opencode/skills/AGENTS.md`. Они загружаются через `instructions` в
`~/.config/opencode/opencode.json`.

В корне проекта `AGENTS.md` — короткий указатель на глобальные правила и на
проектные файлы:

```markdown
# <Проект> — правила

Общие правила: `~/.config/opencode/skills/AGENTS.md`.

Всегда учитывай `.opencode/project-rules.md`: там правила и особенности этого
проекта. Доступы — `.opencode/project-config.md`, значения — `.opencode/.env.local`.
```

Так общие правила правятся в одном месте и не расходятся между проектами, а
проектные особенности лежат рядом с проектом.

## Проверки перед коммитом

- `grep -rniE "password|пароль" --include=SKILL.md .` — только описания, не значения.
- `git status --ignored` — `project-config.md`, `project-rules.md` и `.env.local` в игноре.
- В диффе нет скриншотов с личными данными.
