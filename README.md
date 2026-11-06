# ai-agent-skills

Личные скиллы для GitHub Copilot в VS Code: процедуры, которые агент загружает
по триггеру. Один репозиторий — используется в разных проектах.

## Состав

| Папка | Что внутри |
|---|---|
| `bitrix-component/` | компоненты, шаблоны, ассеты, миграции Bitrix (D7, Controllerable, nginx) |
| `bitrix-login/` | вход в Bitrix под администратором: мост вместо формы, LOGIN или EMAIL |
| `code-review/` | обязательное ревью диффа перед коммитом |
| `codebase-memory/` | порядок поиска по коду: граф → grep |
| `feature-workflow/` | план фаз, папка задачи, definition of done |
| `figma-layout/` | вёрстка по макету через Figma REST API |
| `git-commits/` | разбиение на коммиты, сообщения, пуш |
| `manual-testing/` | ручной сценарий проверки бэкенда |
| `pdf-instructions/` | PDF-инструкции со скриншотами, эталон в `example/` |
| `ui-testing-playwright/` | проверка интерфейса в браузере |
| `copilot-instructions.md` | копия `.github/copilot-instructions.md` проекта RAD Aggregator |
| `templates/` | `env.example` и `project-features.example.md` для нового проекта |
| `tools/` | служебные скрипты репозитория |

## Как подключить в проект

```bash
cd <project>/.github
git clone git@github.com:nacukisubaru/ai-agent-skills.git skills
```

Скиллы читаются из `.github/skills/<name>/SKILL.md`. Папки без `SKILL.md`
(`templates`, `tools`, `example`) скиллами не считаются.

## Доступы: где что лежит

**В скиллах нет ни одного пароля, логина или адреса стенда.** Скилл — общий для всех
проектов, доступы — свойство проекта. Два локальных файла, оба в `.gitignore`:

```
.github/skills/project-features.md   # имена переменных + особенности стенда
.github/skills/.env.local            # значения этих переменных
```

Порядок для агента:

1. `project-features.md` — какие переменные нужны, адрес, как входить, ожидаемый id.
2. `.env.local` — значения.
3. Нужной переменной нет → **спросить у пользователя**. Не подбирать, не заводить
   пользователя, не вставлять доступы в код, скриншоты и отчёты.

Вход на платформу — отдельный скилл: для Bitrix это `bitrix-login`. Для другой
платформы добавляется свой скилл, а `project-features.md` указывает, какой именно.

Скрипты скиллов читают `.env.local` сами (`pdf-instructions/scripts/shot.mjs`:
окружение → `.github/skills/.env.local` → `.github/.env.local` → `.env.local` → `.env`).

Копируйте при подключении к новому проекту:

```bash
cp templates/env.example .env.local
cp templates/project-features.example.md project-features.md
```

## copilot-instructions.md

Копия живёт здесь, но **рабочий файл обязан лежать в `.github/copilot-instructions.md`
в корне проекта** — из другой папки VS Code его не читает. Правки вносятся в проект,
затем синхронизируются сюда:

```bash
tools/sync-copilot-instructions.sh <project-root>
```

Без аргумента скрипт берёт `.github/copilot-instructions.md` из текущего каталога.

## Проверки перед коммитом

- `grep -rniE "password|пароль" --include=SKILL.md .` — только описания, не значения.
- `git status --ignored` — `project-features.md` и `.env.local` в игноре.
- В диффе нет скриншотов с личными данными.
