---
name: migrations
description: 'Миграции sprint.migration: обязательное изменение контента, данных, таблиц, полей и инфоблоков через миграцию; идемпотентные up/down, контентные миграции, проверка и откат. Use when a task asks to update content, add or edit data, change rows in tables, create or alter tables or fields, add or edit infoblock elements, sections or properties, or when a change must survive deploys.'
---

# Миграции

## Когда применять

Любое изменение, которое должно пережить деплой и появиться на других стендах:

- обновить контент: тексты, описания, карточки, баннеры, меню, справочники;
- добавить, изменить или удалить элементы, разделы или свойства инфоблока;
- добавить, изменить или удалить строки в таблицах;
- создать или изменить таблицу, поле, индекс;
- создать инфоблок, тип инфоблока, почтовое событие или агент, если это данные проекта.

Если в задаче написано «обнови контент», «добавь данные», «поправь инфоблок»,
«добавь поле», «создай таблицу» — **сначала миграция, потом остальной код**.
Не править данные руками в админке или SQL на стенде: на другом стенде этого не будет.

## Где и как

- Используем `sprint.migration`.
- Каталог миграций, команда запуска и версия модуля — в `.opencode/project-rules.md`.
- Одна миграция — одно законченное изменение. Имя: `VersionYYYYMMDDHHMMSS_<snake_case>.php`,
  класс `Version...` в namespace `Sprint\Migration`, наследник `Version`.
- Существующие миграции **не редактируем**. Только новая добавочная миграция.
- `up()` должен быть идемпотентным: повторный запуск не создаёт дубли и не падает.
- `down()` — обратное действие: удалить только созданное миграцией, вернуть прежние
  значения, если они известны. Если откат невозможен (массовое обновление контента),
  это явно пишется в описании, а `down()` остаётся безопасным no-op.
- Не хардкодить ID. Искать по `CODE`/`XML_ID`, использовать helper-методы.
- Секреты, пароли и персональные данные в миграцию не попадают.

## Скелет

```php
<?php

namespace Sprint\Migration;

class Version20261116120000_update_landing_content extends Version
{
    protected $description = 'Обновление контента лендинга';
    protected $moduleVersion = '5.6.1'; // как в соседних миграциях проекта

    public function up(): bool
    {
        $helper = $this->getHelperManager();
        // ...
        return true;
    }

    public function down(): bool
    {
        // ...
        return true;
    }
}
```

## Контент инфоблоков

```php
$helper = $this->getHelperManager();
$iblockId = $helper->Iblock()->getIblockIdIfExists('landing_content', 'content');

// Создаст или обновит элемент по CODE (идемпотентно)
$helper->Iblock()->saveElementByCode(
    $iblockId,
    [
        'CODE' => 'hero',
        'NAME' => 'Первый экран',
        'ACTIVE' => 'Y',
        'PREVIEW_TEXT' => 'Новый текст',
        'DETAIL_TEXT' => '<p>Новый HTML</p>',
    ],
    [
        'SUBTITLE' => 'Новый подзаголовок',
        'BUTTON_TEXT' => 'Оставить заявку',
    ]
);

// Только добавить, если ещё нет
$helper->Iblock()->addElementIfNotExists($iblockId, [...], [...]);

// Только обновить существующий; 0 — если не найден
$helper->Iblock()->updateElementIfExists($iblockId, [...], [...]);

// Раздел
$helper->Iblock()->saveSection($iblockId, [
    'CODE' => 'news',
    'NAME' => 'Новости',
    'ACTIVE' => 'Y',
]);

// Свойство
$helper->Iblock()->saveProperty($iblockId, [
    'CODE' => 'SUBTITLE',
    'NAME' => 'Подзаголовок',
    'PROPERTY_TYPE' => 'S',
    'ACTIVE' => 'Y',
]);
```

- Для списков свойств и нескольких языков использовать поля из соседних миграций
  (`VALUES`, `LANG`), не угадывать структуру.
- Для highload-блоков — `$helper->Hlblock()->saveElementByXmlId(...)`.
- Для новых инфоблоков, типов и полей проще сгенерировать заготовку builder'ом
  `sprint.migration` и затем поправить данные; огромные массивы вручную не писать.
- `saveElementByCode` обновляет по `CODE`; `CODE` должен быть уникальным в инфоблоке.

## Таблицы и поля

```php
use Bitrix\Main\Application;

$connection = Application::getConnection();

if (!$connection->isTableExists('b_my_table')) {
    $connection->queryExecute('CREATE TABLE b_my_table (...) ENGINE=InnoDB');
}

$fields = array_change_key_case($connection->getTableFields('b_my_table'), CASE_LOWER);
if (!isset($fields['new_field'])) {
    $connection->queryExecute('ALTER TABLE b_my_table ADD COLUMN NEW_FIELD VARCHAR(255) NULL');
}
```

- Имена таблиц и полей — в стиле проекта; для Bitrix ORM предпочтительнее ORM-сущности,
  но DDL всё равно идёт через миграцию.
- Индексы добавлять только если их нет (проверить `SHOW INDEX` или helper проекта).
- Строки в кастомных таблицах обновлять по уникальному ключу (`CODE`/`XML_ID`),
  а не по автоинкрементному ID. Для upsert допустим `INSERT ... ON DUPLICATE KEY UPDATE`.
- `down()` для DDL: удалить индекс, поле или таблицу, только если миграция их создала.

## Проверка

1. Найти команду миграций в `.opencode/project-rules.md` (обычно `make migrations-migrate`).
2. Запустить на локальном стенде; убедиться, что миграция применилась.
3. Запустить **повторно** — ошибок и дублей быть не должно.
4. Проверить результат в админке/БД: контент, свойства, таблицы, индексы.
5. Если есть `down()` — проверить откат на локальном стенде.
6. В отчёте и коммите указать имя миграции и что именно она меняет.

## Запрещено

- Менять данные через админку или SQL и не оставлять миграцию.
- Править уже применённую миграцию; только новая.
- Хардкодить ID, пути стенда, пароли.
- Делать `down()` с удалением данных, которые миграция не создавала.
- Оставлять миграцию без проверки повторного запуска.
