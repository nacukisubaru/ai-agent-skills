---
name: figma-layout
description: 'Fetching and implementing Figma layouts through the REST API: node URLs, token, JSON structure, PNG render, mapping to existing components. Use when the user shares a Figma link and asks to implement or align a layout.'
---

# Figma layout

## Вход

Ссылка вида:

```
https://www.figma.com/design/{FILE_KEY}/...?node-id={A}-{B}&...
```

- `FILE_KEY` — сегмент после `/design/`.
- `NODE_ID` — из `node-id`; в URL дефис, в API двоеточие (`7778:368394`).

## Токен

`FIGMA_TOKEN_FROM_ENV` в заголовке `X-Figma-Token`.
При ошибке авторизации — сообщить и запросить новый токен, не гадать.

## Запросы

Весь файл качать нельзя (`400 Request too large`). Только конкретная нода.

1. Структура:

```bash
curl -s -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/files/{FILE_KEY}/nodes?ids={NODE_ID}&geometry=paths" \
  -o /tmp/figma-node.json
```

2. Рендер:

```bash
curl -s -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/images/{FILE_KEY}?ids={NODE_ID}&format=png&scale=2" \
  -o /tmp/figma-img.json
# взять images.NODE_ID и скачать PNG
```

## Что разбирать

- `children` только с `visible`.
- `absoluteBoundingBox` — размеры, отступы.
- `style` у TEXT — шрифт, размер, вес, межстрочный.
- `fills` — цвета; сопоставлять с токенами `main.css`.
- `componentProperties` у INSTANCE — активные варианты.
- Имена INSTANCE/VECTOR подсказывают иконки.

## Правила реализации

- Верстать по мотивам: использовать существующие компоненты, классы, иконки, токены.
- Не копировать пиксель-в-пиксель, если в проекте есть готовая сетка.
- Стили — в `style.css` компонента, не в `main.css`.
- Дампы макета хранить в `/tmp`, в репозиторий не коммитить.
- Если PNG не читается визуально — разбирать структуру JSON.

## Проверка

Сверить результат с макетом в браузере через `ui-testing-playwright`.
