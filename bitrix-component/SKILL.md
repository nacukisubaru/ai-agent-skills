---
name: bitrix-component
description: 'Bitrix components, templates, assets and migrations in this project: class naming, Controllerable with CSRF, ORM D7, asset paths that are actually served, nginx 403 on hidden template folders, CSS specificity. Use when creating or editing components, templates, admin pages, migrations, styles or scripts.'
---

# Bitrix component

## Структура компонента

```
public/local/components/zavidovo/<name>/
├── class.php            # Zavidovo<Name>Component extends CBitrixComponent
├── .description.php
├── style.css            # ассеты — в корне компонента
├── script.js
└── templates/.default/
    └── template.php
```

## Правила

### Класс
- Ровно один класс-наследник `CBitrixComponent` в `class.php`; Bitrix сам находит его при подключении компонента.
- Имя уникальное, глобальное (без namespace).
- Для AJAX-действий — `implements Controllerable`, методы `*Action`, `configureActions()` с `new Csrf()` на всём, что меняет данные.
- Данные пользователя брать из `CurrentUser::get()`, а не из параметров.

### Ассеты
- Класть `style.css` и `script.js` **в корень компонента**, не в `templates/.default/`.
  Причина: nginx закрывает пути с точкой в сегменте (`location ~* /\.` → 403), поэтому `/local/components/zavidovo/x/templates/.default/style.css` не отдаётся.
- Подключение: `$this->__component->getPath() . '/style.css'` через `Asset::getInstance()`.
- **Папки `templates/` в модуле быть не должно.** Модуль — это код (`lib/`, `config/`); разметка, стили и картинки живут там, где их рендерят.
- Общая разметка нескольких компонентов — отдельный маленький компонент (например `zavidovo:settings.nav`), а не копия в каждом шаблоне и не include из модуля.
- Картинки и иконки — всегда `local/templates/<template>/static/img/general/`: класть туда новый файл можно, править чужие иконки — нет. В модуль картинки не класть, даже если её открывает письмо, а не страница: письмо ссылается на публичный URL, а не на файл рядом с кодом.
- Стили, нужные двум и более компонентам (например деталка уведомления в колпачке и на странице), — в `static/css/backend.css` с комментарием-заголовком секции. Стили одного компонента — в его `style.css`.

### Стили и скрипты
- `local/templates/*/static/css/main.css`, `static/js/main.js` и прочие файлы `static/` править **запрещено**.
- Свои стили — в `style.css` компонента.
- Стили компонента печатаются до `main.css`, поэтому при равной специфичности побеждает `main.css`. Если правило не применяется — повышать специфичность у себя, а не править `main.css`.
- Глобальные правки — только `backend.css` по согласованию.

### ORM D7
- Namespace полей: `Bitrix\Main\ORM\Fields\*`.
- `Bitrix\Main\Entity\*` использовать нельзя, кроме `DataManager`.
- ORM-описание должно совпадать с реальной схемой БД. Расхождение — дефект.
- Первичный ключ, уникальные индексы и nullable описываются явно.

### Миграции (Sprint Migration)
- Только добавочные файлы `VersionYYYYMMDDHHMMSS_*.php`.
- Существующие не редактировать.
- Повторный запуск безопасен: `CREATE TABLE IF NOT EXISTS`, проверки на существование колонки/индекса.
- Hazarды (backfill, изменение поведения) — с комментарием, объясняющим причину.

### Шаблоны
- `<?php`, не `<?`.
- Вывод только через `htmlspecialcharsbx` (или эквивалент).
- Состояния: пусто, загрузка, ошибка.
- Никакой бизнес-логики, только отображение.

### Права и безопасность
- Админ-страницы: проверка прав в начале файла, до любого вывода.
- Списки подписок и секретов в админке не раскрывать.
- Ссылки из внешних источников пропускать через `SafeUrl`-подобную проверку.

## Проверка после создания компонента

1. `php -l` всех файлов.
2. Открыть страницу, убедиться, что CSS/JS отдаются без 403.
3. Проверить пустое состояние.
4. Проверить AJAX-действие с CSRF и без.
