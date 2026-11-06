# ai-agent-skills

Личные скиллы для GitHub Copilot в VS Code: процедуры, которые агент загружает
по триггеру. Один репозиторий — используется в разных проектах.

## Состав

| Папка | Что внутри |
|---|---|
| `bitrix-component/` | компоненты, шаблоны, ассеты, миграции Bitrix (D7, Controllerable, nginx) |
| `code-review/` | обязательное ревью диффа перед коммитом |
| `codebase-memory/` | порядок поиска по коду: граф → grep |
| `feature-workflow/` | план фаз, папка задачи, definition of done |
| `figma-layout/` | вёрстка по макету через Figma REST API |
| `git-commits/` | разбиение на коммиты, сообщения, пуш |
| `manual-testing/` | ручной сценарий проверки бэкенда |
| `pdf-instructions/` | PDF-инструкции со скриншотами, эталон в `example/` |
| `ui-testing-playwright/` | проверка интерфейса в браузере |
| `copilot-instructions.md` | копия `.github/copilot-instructions.md` проекта RAD Aggregator |
| `templates/` | шаблоны `.env.example` и `PROJECT-ACCESS.example.md` |
| `tools/` | служебные скрипты репозитория |

## Как подключить в проект

```bash
cd <project>/.github
git clone git@github.com:nacukisubaru/ai-agent-skills.git skills-tmp
rsync -a --exclude .git skills-tmp/ skills/
rm -rf skills-tmp
```

Скиллы читаются из `.github/skills/<name>/SKILL.md`. Папки без `SKILL.md`
(`templates`, `tools`, `example`) скиллами не считаются.

## Правило доступов

**В скиллах и в этом репозитории нет ни одного пароля, логина или адреса стенда.**
Скилл — общий для всех проектов, доступы — свойство проекта.

Порядок для агента:

1. `.github/PROJECT-ACCESS.md` — особенности проекта: адрес, как входить, имена
   переменных.
2. `.github/.env.local` — значения. Оба файла в `.gitignore` этого репозитория
   и в `.gitignore` проекта.
3. Нужного доступа нет → **спросить у пользователя**. Не подбирать, не заводить
   пользователя, не вставлять доступы в код, скриншоты и отчёты.

Стандартные переменные:

| Переменная | Назначение |
|---|---|
| `RAD_BASE_URL` | адрес стенда |
| `RAD_ADMIN_LOGIN` | технический логин администратора |
| `RAD_ADMIN_EMAIL` | почта администратора (мост сам найдёт логин) |
| `RAD_ADMIN_PASSWORD` | пароль |

Копируйте `templates/env.example` → `.github/.env.local` и
`templates/PROJECT-ACCESS.example.md` → `.github/PROJECT-ACCESS.md` при подключении
к новому проекту.

## copilot-instructions.md

Копия живёт здесь, но **рабочий файл обязан лежать в `.github/copilot-instructions.md`
в корне проекта** — из другой папки VS Code его не читает. Правки вносятся в проект,
затем синхронизируются сюда:

```bash
.github/skills/tools/sync-copilot-instructions.sh <project-root>
```

Без аргумента скрипт берёт `.github/copilot-instructions.md` из текущего каталога.

## Проверки перед коммитом

- `grep -rn "password\|Пароль" --include=SKILL.md .` — не осталось реальных доступов.
- В диффе нет `.env`, `PROJECT-ACCESS.md`, скриншотов с личными данными.
