---
name: architecture
description: 'Куда положить новый класс и как его спроектировать в RAD Aggregator: слои (entry point → Service → Repository → Entity), папки модуля, общий слой src/Shared (утилиты общего назначения, как utils), namespaces и PSR-4, направление зависимостей, когда рефакторить, создание нового модуля. Use when writing a new class, service, repository, entity, value object, enum, handler, agent, console command or admin page, when deciding which module or namespace a class belongs to, when refactoring a class, or when a task requires a new Bitrix module.'
---

# Архитектура: куда положить класс

Скилл включается **каждый раз, когда пишется новый класс**: сервис, репозиторий,
сущность, value object, enum, обработчик, агент, команда. Сначала решение о слое
и месте, потом код.

Подробная карта проекта — `project/docs/rad/architecture.md`. Здесь — рабочая
процедура и правила, по которым этот проект уже устроен.

## Шаг 1. Определи, чей это код

| Что это за класс | Куда |
|---|---|
| Общего назначения, без привязки к предметной области — как `utils`: им может воспользоваться любой модуль | `project/src/Shared/<Capability>/` |
| Инфраструктура консоли, общая для всех модулей | `project/src/Console/` |
| Бизнес-правила конкретной области (лоты, API, поиск, статистика, уведомления) | `project/public/local/modules/rad.<name>/lib/` |
| Торги, ставки, задатки, расчёты (PostgreSQL, RabbitMQ) | `project/services/auction/src/` — отдельное приложение, здесь не трогаем |

`src/Shared` — **общая папка для того, у чего нет точной конкретики**: контейнер,
конфиг, логгер, работа с geo, money, строками, файлами, HTTP-мелочи. Список не
закрытый: если класс не принадлежит ни одной предметной области и пригодится в
любом месте проекта — его место в `Shared`, подпапка по смыслу
(`Config`, `Container`, `Logging`, `Geo`, `Helper`, `ValueObject`, `Storage`,
`Http`, `Security`, `Validation`, `Redis` — так папки уже сложены сейчас).

Проверка «общее или модульное» — один вопрос: **можно ли описать класс, не упоминая
лоты, уведомления, поиск, статистику, API?**

- да → `src/Shared` (даже если пока использует один модуль: это утилита, а не правило);
- нет, в описании есть предметная область → модуль этой области, даже если класс
  выглядит универсальным;
- правило зависит от данных домена (лот активен, согласие отозвано, доставка
  просрочена) → это бизнес-логика, `Shared` ей нельзя, даже если она «одна строчка».

`src/Shared` **не имеет права** импортировать модули (`use Rad\Aggregator\…` и т. п.).
Проверено сейчас: импортов из `src/` в модули — ноль, это и есть контракт.

## Шаг 2. Определи роль класса внутри модуля

Реальные папки модуля (на примере `rad.notifications`, так же у остальных):

```
public/local/modules/rad.<name>/
├── include.php                     # bootstrap модуля, кода в нём нет
├── install/
│   ├── index.php                   # CModule: DoInstall/DoUninstall/InstallFiles
│   └── version.php                 # VERSION, VERSION_DATE
├── config/dependencies/<name>.php  # ручная регистрация в DI
├── admin/                          # страницы админки + views/
├── docs/                           # описание модуля, диаграммы
└── lib/
    ├── Entity/                     # ORM D7 Table-классы
    ├── Repository/                 # доступ к данным (есть в aggregator, stats, api)
    ├── Service/<Area>/             # бизнес-логика, сгруппированная по области
    ├── ValueObject/ Dto/           # неизменяемые данные
    ├── Enum/                       # состояния и категории
    ├── Contract/                   # интерфейсы для DI или для другого модуля
    ├── Bitrix/Event/               # обработчики событий Bitrix
    ├── Agent/                      # агенты (cron)
    ├── Console/Command/            # CLI-команды
    ├── Admin/                      # классы страниц админки по разделам
    ├── Channel/                    # каналы доставки (email, push)
    └── Processor/                  # разбор захваченной записи очереди
```

Выбор папки по роли:

| Роль | Папка | Что можно | Что нельзя |
|---|---|---|---|
| Хранение схемы | `Entity/*Table` | `getMap()`, поля ORM, индексы, `configureTitle` | выборки и бизнес-правила |
| Доступ к данным | `Repository/<Area>/` | `getList`, `add`, `update`, `delete`, транзакции, блокировки | бизнес-правила, письма, события |
| Бизнес-логика | `Service/<Area>/` | правила, оркестрация, вызовы Repository и очередей | прямые `Table::getList()` (см. исключение ниже) |
| Данные без поведения | `ValueObject/`, `Dto/` | `final readonly`, конструктор | сеттеры, сервисы внутри |
| Состояние с поведением | `Enum/` | `isFinal()`, `label()`, `cases()` | зависимость от БД |
| Вход извне | `Bitrix/Event`, `Agent`, `Console/Command`, `Admin` | разобрать вход, вызвать Service, отдать ответ | бизнес-логика, запросы к БД |
| Точка расширения | `Contract/*Interface` | сигнатуры | реализация |

Исключение: маленькие модули (`rad.notifications`) работают с `Entity` напрямую из
сервисов — отдельного `Repository` там нет. Это допустимо, пока запросы к таблице
живут **в одном** сервисе, а не расползаются по пяти. Как только таких мест стало
больше двух или запрос сложнее `getList` — выносится `Repository/<Area>/`.

## Шаг 3. Namespace и файл

Autoload — PSR-4 в `project/composer.json`, папка = namespace 1:1:

```
Rad\Shared\        → src/Shared/
Rad\Console\       → src/Console/
Rad\Aggregator\    → public/local/modules/rad.aggregator/lib/
Rad\Api\           → public/local/modules/rad.api/lib/
Rad\Notifications\ → public/local/modules/rad.notifications/lib/
Rad\Search\        → public/local/modules/rad.search/lib/
Rad\Stats\         → public/local/modules/rad.stats/lib/
```

Правила:

- namespace собирается из пути: `Rad\Notifications\Service\Notifications\NotificationService`
  лежит в `lib/Service/Notifications/NotificationService.php`;
- один класс — один файл, имя файла = имя класса, `declare(strict_types=1)` в каждом файле;
- **новый namespace добавляется в `composer.json`**, а модуль ещё и в
  `project/config/modules.php`, иначе класс не найдётся;
- `final` по умолчанию; `readonly` для value objects и DTO; состояние — `enum X: string`;
- имя отражает роль: `*Service`, `*Repository`, `*Table`, `*Handler`, `*Agent`,
  `*Command`, `*Processor`, `*Dto`, `*Interface` (в `Contract`), `*Exception`.

## Шаг 4. Направление зависимостей

```
Admin / Bitrix\Event / Agent / Console\Command      (вход)
            ↓
        Service  ←  Contract (интерфейс, если нужен DI)
            ↓
       Repository
            ↓
         Entity  →  БД
```

- Вход не содержит бизнес-логики: разобрал вход, вызвал один метод сервиса,
  залогировал ошибку. Пример из проекта — `Bitrix\Event\LotPriceHistoryHandler`:
  только разбор события и `NotificationEventQueue::enqueue`, всё остальное делает агент.
- Сервис не знает, откуда его позвали: ни `$_REQUEST`, ни `CMain`, ни `$USER`
  внутри бизнес-логики. Данные пользователя приходят параметром.
- `Repository` не логирует бизнес-события и не отправляет письма.
- Ошибку бизнес-правила оформлять исключением (`PromoExclusionException`,
  `TransientFailure`), а не возвратом `false` без причины.

Межмодульные зависимости:

- разрешено: `rad.api` → `rad.aggregator` (DTO, Repository), `rad.notifications` →
  `rad.aggregator` (чтение лотов), все → `Rad\Shared`;
- **циклы запрещены**, хотя в коде они уже есть: `rad.aggregator` импортирует
  `Rad\Api\Integration\…` в 12 файлах (Auction-сервисы, Outbox). Новых обратных
  импортов не добавлять; если очень нужно — контракт в `Shared` или обмен через
  Outbox/Integration, а не класс чужого модуля;
- `rad.stats` и `rad.search` — листовые: их может использовать кто угодно, они почти
  никого не используют.

## Шаг 5. Если класс разрастается — дели

Признаки, что пора разделить (не «когда-нибудь», а сразу при превышении):

- конструктор принимает больше ~6 зависимостей — класс делает слишком много;
- файл больше ~300 строк или метод больше ~40 строк;
- в имени появилось `And`/`Manager` — нет одной ответственности (`Helper` — нормально
  для утилиты в `Shared`, ненормально для бизнес-сервиса);
- сервис пишет и в лоты, и в уведомления, и в статистику — это оркестратор, а
  каждая запись должна уйти в сервис своей области;
- одинаковая логика в двух модулях и она не про домен → `src/Shared`; про домен —
  один из модулей владеет ею, второй импортирует его сервис;
- код читает `Entity` из трёх сервисов → `Repository`;
- класс вызывается из одного места и не имеет состояния → возможно, это метод
  того, кто его вызывает.

Делить по **области** (папка `Service/<Area>`), а не по типу операции. В
`rad.notifications` это видно: `Service/Notifications`, `Service/Digest`,
`Service/Promo`, `Service/Push`.

## Шаг 6. DI: где регистрировать

`ContainerFactory` собирает `config/dependencies/*.php` и
`public/local/modules/*/config/dependencies/*.php`, остальное автовайрится по типам.

- Зависимости — классы → **ничего не писать**, контейнер соберёт сам; вызывать
  через `rad_service(MyService::class)` во входных точках.
- В конструкторе `string`/`int`/массив конфига → зарегистрировать вручную в
  `config/dependencies/<module>.php`, конфиг брать из `$container->get('config')`.
- Конфиг — `project/config/<area>.php`; секреты — только через env.
- Интерфейс → реализация: как `Contract\SearchIndexerInterface` в
  `config/dependencies/search.php`. Интерфейс нужен, когда есть вторая реализация
  или подмена в тестах, а не «для красоты».

## Шаг 7. Новый модуль (если задача этого требует)

Отдельный модуль нужен, когда появляется **своя предметная область** и свои таблицы.
Один-два класса — это папка в существующем модуле, а не новый модуль.

Чеклист:

1. `public/local/modules/rad.<name>/`: `include.php`, `install/index.php`
   (класс `rad_<name> extends CModule`, `DoInstall`/`DoUninstall`/`InstallFiles`),
   `install/version.php`, `lib/`, `config/dependencies/<name>.php`, `docs/README.md`.
2. `project/composer.json` → `"Rad\\<Name>\\": "public/local/modules/rad.<name>/lib/"`.
3. `project/config/modules.php` → добавить `rad.<name>`.
4. `project/config/console.php` → `command_paths`, если есть команды.
5. `project/config/bitrix_events.php` / `bitrix_agents.php` → обработчики и агенты
   объявляются здесь, а не в `install/index.php`.
6. Миграции — добавочные в `project/public/local/php_interface/migrations/`
   (`VersionYYYYMMDDHHMMSS_*.php`, существующие не править, повторный запуск безопасен).
7. `make bitrix-modules-install`, `make bitrix-events-sync`, `make bitrix-agents-install`,
   `make migrations-migrate`.
8. `project/docs/rad/<name>.md` — что модуль делает и какие таблицы у него.

Разметка: в модуле **нет** папки `templates/`. Модуль — это код. Шаблоны, стили и
картинки живут в компонентах (см. `bitrix-component`), админ-страницы — в
`admin/views` модуля.

## Шаг 8. Тесты рядом с классом

| Что проверяем | Куда | Namespace |
|---|---|---|
| Чистая логика без БД | `project/tests/Unit/<Area>/<Class>Test.php` | `Rad\Tests\Unit\<Area>` |
| Сервис с ORM, транзакциями | `project/tests/Integration/<Area>/<Class>Test.php` | `Rad\Tests\Integration\<Area>` |
| HTTP-контракт | `project/tests/Functional/` | `Rad\Tests\Functional` |

`<Area>` совпадает с папкой модуля (`Notifications`, `Stats`, `Search`). Новый
сервис без теста на правило — незаконченная работа:
`make aggregator-test-unit` или `make aggregator-test-integration`.

## Шаг 9. Проверка перед коммитом

```bash
make aggregator-php-lint      # php -l по изменённым файлам
make aggregator-test-unit     # unit
make aggregator-cs            # стиль
```

И глазами:

1. Класс лежит в папке, соответствующей роли, namespace совпадает с путём.
2. Нет `Table::getList` в сервисе, если у модуля есть `Repository` для этой таблицы.
3. Нет бизнес-логики в `Bitrix/Event`, `Agent`, `Console/Command`, `Admin`.
4. Нет новых импортов из `src/` в модули и обратных импортов между модулями.
5. Зависимости с конфигом зарегистрированы в `config/dependencies`.
6. На новое правило есть unit- или integration-тест.

## Запрещено

- Бизнес-логика в `src/Shared`; шаблоны и контроллеры в модуле.
- Импорт модуля из `src/` и новые циклы между модулями.
- ORM-поля через `Bitrix\Main\Entity\*` (кроме `DataManager`) — только `Bitrix\Main\ORM\Fields\*`.
- `Table::getList()`/`add()` прямо в обработчике события, агенте, команде или шаблоне.
- `rad_service()` внутри конструктора сервиса — зависимости приходят параметрами.
- Один «универсальный» `Manager`/`Helper` вместо явной роли класса.
- Новый модуль ради одного-двух классов.
