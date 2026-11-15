# ai-agent-skills

Личные скиллы для OpenCode: процедуры, которые агент загружает по триггеру.
Один репозиторий — используется в разных проектах.

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
| `skill-maintenance/` | как править скиллы: коммит → подтверждение → пуш → обновление `.opencode/skills` |
| `ui-testing-playwright/` | проверка интерфейса в браузере |
| `AGENTS.md` | always-on правила проекта RAD Aggregator — источник истины |
| `templates/` | `env.example` и `project-features.example.md` для нового проекта |
| `tools/` | `skills.sh` — `init` новый проект, `update` все проекты, `status` версии |

## Как подключить в проект (сабмодуль)

Скиллы подключаются **сабмодулем**, чтобы обновлять их одной командой во всех
проектах:

```bash
cd <project>
git submodule add git@github.com:nacukisubaru/ai-agent-skills.git .opencode/skills
git commit -m "Add agent skills as a submodule"
```

Если `.opencode/` в проекте игнорируется целиком, замените правило на такое,
чтобы версионировать только скиллы:

```gitignore
/.opencode/*
!/.opencode/skills
```

Обновление после правок в скиллах:

```bash
git submodule update --remote --merge .opencode/skills   # в одном проекте
/Users/aleksandrkrestinskij/projects/skills/tools/skills.sh update   # во всех сразу
```

Указатель сабмодуля меняется в индексе проекта — это обычное изменение, его
коммитят в ветку проекта.

Если проект не хочет держать сабмодуль, работает и обычный клон
(`git clone ... .opencode/skills` с `.opencode/` в `.gitignore`): `skills.sh update`
находит такие проекты по `origin` внутри `.opencode/skills` и делает
`fetch` + `merge --ff-only`.

### Одна команда на всё

```bash
~/projects/skills/tools/skills.sh update     # обновить во всех проектах ~/projects
~/projects/skills/tools/skills.sh status     # показать версию в каждом
~/projects/skills/tools/skills.sh init ~/projects/new-project   # подключить новый
```

`update` не требует `.gitmodules` в текущей ветке проекта: он работает с
`.opencode/skills` как с обычным репозиторием, поэтому одинаково обновляет и
сабмодуль, и клон. `.opencode/skills` с незакоммиченными правками пропускается
с предупреждением. Проекты со старой раскладкой скиллов нужно один раз перевести
на `.opencode/skills` и корневой `AGENTS.md` вручную — `update` ищет только новую.

Скиллы читаются из `.opencode/skills/<name>/SKILL.md`. Папки без `SKILL.md`
(`templates`, `tools`, `example`) скиллами не считаются.

Затем один раз создать в проекте `AGENTS.md` — указатель на
`.opencode/skills/AGENTS.md` (шаблон в разделе ниже).

## Доступы: где что лежит

**В скиллах нет ни одного пароля, логина или адреса стенда.** Скилл — общий для всех
проектов, доступы — свойство проекта. Два локальных файла, оба в `.gitignore`:

```
.opencode/project-features.md   # имена переменных + особенности стенда
.opencode/.env.local            # значения этих переменных
```

Оба пути уже покрыты `.opencode/*` в `.gitignore` проекта — отдельная папка для них
не нужна. Держать их **внутри** `.opencode/skills` нельзя: это сабмодуль, файл в нём
попал бы в общий репозиторий скиллов.

Порядок для агента:

1. `project-features.md` — какие переменные нужны, адрес, как входить, ожидаемый id.
2. `.env.local` — значения.
3. Нужной переменной нет → **спросить у пользователя**. Не подбирать, не заводить
   пользователя, не вставлять доступы в код, скриншоты и отчёты.

Токены внешних API — там же: `FIGMA_TOKEN` в `.opencode/.env.local`, в скилле
`figma-layout` только имя переменной.

Вход на платформу — отдельный скилл: для Bitrix это `bitrix-login`. Для другой
платформы добавляется свой скилл, а `project-features.md` указывает, какой именно.

Скрипты скиллов читают `.env.local` сами (`pdf-instructions/scripts/shot.mjs`:
окружение → `.opencode/.env.local` → `.env.local` → `.env`).

Копируйте при подключении к новому проекту:

```bash
cp .opencode/skills/templates/env.example .opencode/.env.local
cp .opencode/skills/templates/project-features.example.md .opencode/project-features.md
```

## AGENTS.md

Полные always-on правила лежат в корне этого репозитория: `AGENTS.md`.
В проекте корневой `AGENTS.md` — только указатель на
`.opencode/skills/AGENTS.md`, собственных правил в нём нет:

```markdown
Все инструкции проекта лежат в одном файле:
**`.opencode/skills/AGENTS.md`**
Прочитать этот файл целиком до начала любой задачи и следовать ему.
```

Так правила правятся в одном месте и не расходятся между копиями. OpenCode
автоматически читает корневой `AGENTS.md`, но не файл в `.opencode/skills`,
поэтому в указателе обязательна фраза «прочитать указанный файл целиком» — иначе
агент его не откроет. В новом проекте этот указатель создаётся один раз и больше
не меняется.

## Проверки перед коммитом

- `grep -rniE "password|пароль" --include=SKILL.md .` — только описания, не значения.
- `git status --ignored` — `project-features.md` и `.env.local` в игноре.
- В диффе нет скриншотов с личными данными.
