# ai-agent-skills

Личные скиллы для GitHub Copilot в VS Code: процедуры, которые агент загружает
по триггеру. Один репозиторий — используется в разных проектах.

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
| `pdf-instructions/` | PDF-инструкции со скриншотами, эталон в `example/` |
| `skill-maintenance/` | как править скиллы: коммит → подтверждение → пуш → обновление сабмодулей |
| `ui-testing-playwright/` | проверка интерфейса в браузере |
| `copilot-instructions.md` | always-on правила проекта RAD Aggregator — источник истины |
| `templates/` | `env.example` и `project-features.example.md` для нового проекта |
| `tools/` | `sync-submodules.sh` — обновить сабмодуль скиллов во всех проектах |

## Как подключить в проект (сабмодуль)

Скиллы подключаются **сабмодулем**, чтобы обновлять их одной командой во всех
проектах:

```bash
cd <project>
git submodule add git@github.com:nacukisubaru/ai-agent-skills.git .github/skills
git commit -m "Add agent skills as a submodule"
```

Если каталог `.github/` в проекте целиком в `.gitignore`, разрешить только нужные пути:

```gitignore
/.github/*
!/.github/skills
!/.github/copilot-instructions.md
```

Обновление после правок в скиллах:

```bash
git submodule update --remote --merge .github/skills   # в одном проекте
/path/to/skills/tools/sync-submodules.sh               # во всех сразу
```

Указатель сабмодуля меняется в индексе проекта — это обычное изменение, его
коммитят в ветку проекта.

Скиллы читаются из `.github/skills/<name>/SKILL.md`. Папки без `SKILL.md`
(`templates`, `tools`, `example`) скиллами не считаются.

Затем один раз создать в проекте `.github/copilot-instructions.md` — указатель
на `skills/copilot-instructions.md` (шаблон в разделе ниже).

## Доступы: где что лежит

**В скиллах нет ни одного пароля, логина или адреса стенда.** Скилл — общий для всех
проектов, доступы — свойство проекта. Два локальных файла, оба в `.gitignore`:

```
.github/project-features.md   # имена переменных + особенности стенда
.github/.env.local            # значения этих переменных
```

Оба пути уже покрыты `.github/*` в `.gitignore` проекта — отдельная папка для них
не нужна. Держать их **внутри** `.github/skills` нельзя: это сабмодуль, файл в нём
попал бы в общий репозиторий скиллов.

Порядок для агента:

1. `project-features.md` — какие переменные нужны, адрес, как входить, ожидаемый id.
2. `.env.local` — значения.
3. Нужной переменной нет → **спросить у пользователя**. Не подбирать, не заводить
   пользователя, не вставлять доступы в код, скриншоты и отчёты.

Токены внешних API — там же: `FIGMA_TOKEN` в `.env.local`, в скилле `figma-layout`
только имя переменной.

Вход на платформу — отдельный скилл: для Bitrix это `bitrix-login`. Для другой
платформы добавляется свой скилл, а `project-features.md` указывает, какой именно.

Скрипты скиллов читают `.env.local` сами (`pdf-instructions/scripts/shot.mjs`:
окружение → `.github/.env.local` → `.env.local` → `.env`).

Копируйте при подключении к новому проекту:

```bash
cp .github/skills/templates/env.example .github/.env.local
cp .github/skills/templates/project-features.example.md .github/project-features.md
```

## copilot-instructions.md

Полные always-on правила лежат здесь: `skills/copilot-instructions.md`.
В проекте корневой `.github/copilot-instructions.md` — только указатель на этот
файл, собственных правил в нём нет:

```markdown
Все инструкции проекта лежат в одном файле:
**`.github/skills/copilot-instructions.md`**
Прочитать этот файл целиком до начала любой задачи и следовать ему.
```

Так правила правятся в одном месте и не расходятся между копиями. VS Code
автоматически читает только корневой файл, поэтому в нём обязательна фраза
«прочитать указанный файл целиком» — иначе агент его не откроет. В новом проекте
этот указатель создаётся один раз и больше не меняется.

## Проверки перед коммитом

- `grep -rniE "password|пароль" --include=SKILL.md .` — только описания, не значения.
- `git status --ignored` — `project-features.md` и `.env.local` в игноре.
- В диффе нет скриншотов с личными данными.
