---
name: ui-testing-playwright
description: 'Browser verification with playwright-mcp: temporary login page using credentials from .github/.env.local (via .github/PROJECT-ACCESS.md), UI checks, screenshots and artifacts. Credentials are never hardcoded: if .env.local has none, ask the user. Use when changes touch templates, components, JavaScript, CSS, forms, modals, or when the user asks to check the interface in a browser.'
---

# UI testing with Playwright

## When to use

- Изменены шаблоны, компоненты, JS, CSS, формы, модалки.
- Нужно убедиться, что данные реально отображаются.
- Пользователь просит проверить в браузере.

## Инструменты

- Только `playwright-mcp`. Встроенный браузер VS Code не использовать.
- Артефакты и логи — строго в `<project_root>/.github/playwright-mcp`.
- Папку `.playwright-mcp` в корне не создавать.

## Доступы

Доступы **не хардкодятся в скилле** — скилл общий для всех проектов. Порядок поиска:

1. `.github/PROJECT-ACCESS.md` в корне проекта — особенности проекта, адрес стенда
   и **имена** переменных с доступами;
2. `.github/.env.local` — значения этих переменных (файл в git не попадает).

Обычно нужны `RAD_BASE_URL`, `RAD_ADMIN_LOGIN` (или `RAD_ADMIN_EMAIL`) и
`RAD_ADMIN_PASSWORD`.

**Если в этих файлах доступов нет — спросить у пользователя.** Не пробовать чужие
учётки, не угадывать пароль, не регистрировать нового пользователя. Полученный ответ
дописать в `.github/.env.local`, а не в файл скилла.

## Локальная авторизация

Не проходить UI-вход: капча и коды мешают. Порядок:

1. Прочитать доступы (см. выше) и подставить их в мост
   `project/public/local/rad-tmp-login.php`:

```php
<?php
require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
global $USER;
header('Content-Type: text/plain; charset=utf-8');

// Bitrix Login() принимает LOGIN, а не email: при входе по почте находим LOGIN.
function rad_resolve_login(string $value): string
{
    if (strpos($value, '@') === false) {
        return $value;
    }
    $row = CUser::GetList('id', 'asc', ['EMAIL' => $value], ['FIELDS' => ['ID', 'LOGIN']])->Fetch();
    return $row ? (string)$row['LOGIN'] : $value;
}

$login = '<RAD_ADMIN_LOGIN или RAD_ADMIN_EMAIL из .env.local>';
$pass  = '<RAD_ADMIN_PASSWORD из .env.local>';
$ok = $USER->Login(rad_resolve_login($login), $pass, 'Y');
echo $ok ? 'OK user=' . (int)$USER->GetID() : 'FAIL: ' . $USER->LAST_ERROR;
```

2. Открыть страницу, убедиться в `OK user=<id>`. Ожидаемый id для этого проекта —
   в `.github/PROJECT-ACCESS.md`.
3. Перейти на нужную страницу уже с сессией.
4. **Удалить файл после проверки.**

Логин и пароль в PHP-файл попадают только на время проверки: файл создаётся,
используется и удаляется. В логи, отчёты и скриншоты доступы не переносить.

Ограничение: такой вход даёт Bitrix-сессию, но не ставит HttpOnly-куку `rad_auth_token`. Приватный API (`/api/v1/private/...`) вернёт «Требуется авторизация». Для таких сценариев нужен реальный вход через `rad:auth.sms`.

## Что проверять

- Элемент виден, кликабелен, состояние меняется.
- Счётчики и списки совпадают с БД.
- Пустое состояние, загрузка, ошибка.
- Модалки: открытие, закрытие, «Отмена» не сохраняет.
- Формы: кнопка сохранения блокируется/разблокируется корректно.
- После сохранения данные остаются после перезагрузки.
- Негативные кейсы: чужой пользователь не видит данные, неверные данные дают понятную ошибку.
- Адаптив: мобильная ширина не ломает блок.

## Артефакты

- Скриншоты ключевых состояний — в `.github/playwright-mcp`.
- В отчёт `test-N.md` — что проверено, что найдено, что исправлено.

## Запрещено

- Оставлять `rad-tmp-login.php` и подобные файлы в репозитории.
- Проверять только happy path.
- Считать «страница открылась» полноценной проверкой.
- Хардкодить логин, пароль или адрес стенда в скилле, скрипте, шаблоне или отчёте.
- Подбирать доступы или заводить нового пользователя вместо запроса у пользователя.
