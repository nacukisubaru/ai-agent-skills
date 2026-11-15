---
name: skill-maintenance
description: 'Обновление самих скиллов: где лежит общий репозиторий скиллов, как править и коммитить, обязательное подтверждение перед пушем, пуш и затем синхронизация `.opencode/skills` во всех проектах. Use when the user asks to create, edit or fix a skill, when a skill is out of date with the project, after changing AGENTS.md, or when skills must be distributed to other projects.'
---

# Обслуживание скиллов

## Где что лежит

| Что | Путь |
|---|---|
| Общий репозиторий скиллов (рабочая копия) | `/Users/aleksandrkrestinskij/projects/skills` |
| Remote | `git@github.com:nacukisubaru/ai-agent-skills.git`, ветка `main` |
| В проекте | `.opencode/skills` — **git submodule** этого репозитория |
| Локальные данные проекта (в git не идут) | `.opencode/project-features.md`, `.opencode/.env.local` |

```bash
cd /Users/aleksandrkrestinskij/projects/skills
git status                 # что меняем
git pull --ff-only         # перед правкой, если работали в другом проекте
```

**Править скиллы только в `/Users/aleksandrkrestinskij/projects/skills`.** Копия в
`.opencode/skills` любого проекта — это checkout того же репозитория: правка там
попадёт в чужой проект и потеряется при следующем обновлении сабмодуля.

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
   Один вопрос, варианты: «запушить и обновить `.opencode/skills`», «только коммит».
6. **Пуш** (после подтверждения):

   ```bash
   cd /Users/aleksandrkrestinskij/projects/skills
   git push origin main
   ```

7. **Синхронизация проектов.** Обновить `.opencode/skills` во всех проектах, где он подключён:

   ```bash
   /Users/aleksandrkrestinskij/projects/skills/tools/skills.sh update            # все проекты
   /Users/aleksandrkrestinskij/projects/skills/tools/skills.sh update /path/to/projects
   ```

   Скрипт находит проекты с `.opencode/skills`, указывающим на этот репозиторий,
   и обновляет его через `fetch` + `merge --ff-only`, печатая, где изменился SHA.
8. **Коммит указателя в проекте** — отдельно и только по подтверждению: обновление
   сабмодуля меняет указатель `.opencode/skills` в индексе проекта, это изменение
   коммитится в ветку проекта как обычное.

## Скрипт синхронизации

`tools/skills.sh`:

- сканирует каталоги проектов (по умолчанию `/Users/aleksandrkrestinskij/projects`),
  сам репозиторий скиллов пропускает;
- ищет каталоги, где `.opencode/skills` — git-репозиторий с `origin` этого репозитория;
  `.gitmodules` не нужен, поэтому находятся и сабмодули, и обычные клоны;
- обновляет через `git -C <project>/.opencode/skills fetch` +
  `merge --ff-only origin/<ветка>`; ветка определяется по HEAD, при detached — `main`
  (обычный `pull` в detached состоянии ругается);
- подкоманда `init <path>`: `git init`, `.opencode/` в `.gitignore`, клон скиллов,
  указатель `AGENTS.md`; повторный запуск безопасен;
- подкоманда `status` печатает версию скиллов в каждом проекте;
- печатает `проект: старый SHA → новый SHA`;
- ничего не коммитит и не пушит. Ошибка в одном проекте не останавливает остальные,
  в конце печатается сводка.

## Что запрещено

- Пушить без явного подтверждения пользователя.
- Пушить в `stage` и `dev` (это не касается репозитория скиллов, у него только `main`).
- Править `.opencode/skills/*` внутри проекта вместо `/Users/aleksandrkrestinskij/projects/skills`.
- Коммитить `.opencode/**` — там доступы; эти пути в `.gitignore`.
- Оставлять скилл без строки в карте скиллов и без записи в `README.md`.
- Вставлять в скилл доступы, адреса стендов и названия конкретных проектов:
  скилл общий, данные проекта — в `.opencode`.
