---
name: skill-maintenance
description: 'Обновление самих скиллов: где лежит общий репозиторий скиллов, как править и коммитить, обязательное подтверждение перед пушем, пуш и затем синхронизация глобальной копии `~/.config/opencode/skills` во всех проектах. Use when the user asks to create, edit or fix a skill, when a skill is out of date with the project, after changing AGENTS.md, or when skills must be distributed to other projects.'
---

# Обслуживание скиллов

## Где что лежит

| Что | Путь |
|---|---|
| Общий репозиторий скиллов (рабочая копия) | `/Users/aleksandrkrestinskij/projects/skills` |
| Remote | `git@github.com:nacukisubaru/ai-agent-skills.git`, ветка `main` |
| Глобальная копия OpenCode | `~/.config/opencode/skills` — **git submodule** каталога `~/.config/opencode` |
| Конфиг OpenCode | `~/.config/opencode/opencode.json` — `instructions` на `~/.config/opencode/skills/AGENTS.md` |
| Локальные данные проекта (в git не идут) | `.opencode/project-config.md`, `.opencode/project-rules.md`, `.opencode/.env.local` |

```bash
cd /Users/aleksandrkrestinskij/projects/skills
git status                 # что меняем
git pull --ff-only         # перед правкой, если работали в другом проекте
```

**Править скиллы только в `/Users/aleksandrkrestinskij/projects/skills`.** Копия в
`~/.config/opencode/skills` — это checkout того же репозитория: правка там
потеряется при следующем обновлении. Отдельных копий скиллов в проектах нет.

## Порядок работы

1. **Правка.** Отдельный скилл — папка `<name>/SKILL.md` с frontmatter
   (`name` — display name; ID в OpenCode берётся из имени папки, поэтому держите
   их совпадающими, `description` с триггерами «Use when …»). Скрипты — в
   `<name>/scripts/`, эталоны — в `<name>/example/`.
2. **Регистрация.** Новый скилл добавить в таблицу «Карта скиллов» в
   `AGENTS.md` и в таблицу состава в `README.md`. Скилл без строки
   в карте не считается подключённым.
3. **Проверка.** Скилл, который что-то исполняет, проверить запуском, а не глазами:
   `node --check <script>`, `bash -n <script>`, реальный прогон на стенде.
   Мёртвые ссылки на пути и переменные — самая частая поломка после рефакторинга.
4. **Коммит.** Сообщение на английском, императив, до ~72 символов.
5. **Подтверждение пуша.** После коммита **не пушить сразу**: спросить у
   пользователя разрешение (правило проекта «не пушить без подтверждения»).
   Один вопрос, варианты: «запушить и обновить глобальные скиллы», «только коммит».
6. **Пуш** (после подтверждения):

   ```bash
   cd /Users/aleksandrkrestinskij/projects/skills
   git push origin main
   ```

7. **Синхронизация OpenCode.** Обновить глобальный submodule:

   ```bash
   /Users/aleksandrkrestinskij/projects/skills/tools/skills.sh update
   ```

   Скрипт делает `git submodule update --remote --merge skills` в
   `~/.config/opencode` и печатает новый SHA. В проектах ничего обновлять не нужно.

8. **Проверка.** `tools/skills.sh status` должен показать новый SHA. OpenCode
   подхватывает обновлённые скиллы из `~/.config/opencode/skills` автоматически.

## Скрипт синхронизации

`tools/skills.sh`:

- `update` — обновляет submodule `skills` в `~/.config/opencode` из `origin/main`;
- `status` — показывает SHA и ветку глобальной копии;
- `init` — создаёт git-репозиторий конфига, добавляет submodule и подсказывает
  строку `instructions`; повторный запуск безопасен;
- не сканирует проекты: скиллы теперь только глобальные;
- ничего не коммитит и не пушит в репозитории скиллов.

## Что запрещено

- Пушить без явного подтверждения пользователя.
- Пушить в `stage` и `dev` (это не касается репозитория скиллов, у него только `main`).
- Править `~/.config/opencode/skills/*` вместо `/Users/aleksandrkrestinskij/projects/skills`.
- Коммитить `.opencode/**` — там доступы; эти пути в `.gitignore`.
- Оставлять скилл без строки в карте скиллов и без записи в `README.md`.
- Вставлять в скилл доступы, адреса стендов и названия конкретных проектов:
  скилл общий, данные проекта — в `.opencode/project-config.md` и
  `.opencode/project-rules.md`.
