# Правила разработки Tartib

> Этот файл обязателен для разработчиков и AI-агентов. Контекст архитектуры: [architecture.md](./architecture.md). Схема данных: [database.md](./database.md).

## TypeScript правила

- `strict` должен оставаться включённым.
- Не использовать `any`, если тип можно выразить через domain, database или local workspace types.
- API payload и response должны иметь явные типы.
- Денежные значения после Supabase преобразовывать через `Number()`.
- Nullable DB-поля не превращать неявно в пустые строки.
- Union statuses определять централизованно в `shared/types/domain.ts`.
- Не дублировать доменные строковые литералы без необходимости.
- После изменения типов запускать `npm.cmd run typecheck`.

## React правила

- Функциональные компоненты и hooks.
- Не хранить производные коллекции в state; использовать `useMemo`.
- Для частых lookup в таблицах использовать `Map`, а не повторные `.find()` в циклах.
- Mutation блокирует только конкретное действие через `pendingAction`.
- Не выполнять сетевые запросы во время render.
- Не создавать новый глобальный state manager без доказанной необходимости.
- Не разносить маленький сценарий на множество абстрактных компонентов.
- При выделении компонента сохранять единый источник состояния.

## Next.js правила

- App Router.
- Pages и layouts — Server Components по умолчанию.
- `'use client'` только там, где нужны browser API, state, effect или Supabase browser auth.
- Service-role код запрещён в Client Components.
- Route Handlers отвечают за HTTP validation и server authorization.
- Персональные API-ответы: `Cache-Control: private, no-store`.
- Middleware не является единственной защитой данных.
- Public pages должны иметь metadata.
- Не создавать route, на который ссылается UI, без реального `page.tsx`.

## Supabase правила

- Любое изменение схемы — новая миграция в `supabase/migrations`.
- Не редактировать уже применённую миграцию ради нового production-изменения.
- RLS включать для каждой новой business table.
- Service role хранить только в server environment.
- Organization ID и role всегда определять на сервере.
- Public token хранить только в hash-виде, если восстановление токена не требуется.
- Составные финансовые операции по возможности выполнять транзакционно.
- Добавлять индексы для organization, ownership, current status и foreign key lookup.
- RPC `security definer` обязан использовать фиксированный `search_path` и проверять `auth.uid()`.
- После новой таблицы обновлять `shared/types/database.ts`.

## Naming conventions

- Components/types: `PascalCase`.
- Functions/variables/hooks: `camelCase`.
- SQL: `snake_case`.
- Constants: `UPPER_SNAKE_CASE` только для настоящих констант.
- Boolean: `is`, `has`, `can`, `should`.
- Event handlers: `handle*` для общего UI-event, доменные команды могут называться `savePayment`.
- API actions: `snake_case` imperative.
- CSS classes: kebab-case, доменно понятные.

## Component conventions

- Использовать существующие `crm-panel`, `primary-button`, `small-button`, `status-pill`, form и table patterns.
- Не вкладывать декоративные cards друг в друга.
- Для иконок использовать `lucide-react`.
- Icon-only control обязан иметь `aria-label` или tooltip.
- Текст должен помещаться на mobile и desktop.
- Новая роль или статус должны иметь русскую label-map.
- Member UI должен оставаться минимальным и персональным.
- Trainer UI показывает действия, owner UI — контроль.

## Import conventions

- Использовать aliases: `@features`, `@shared`, `@components`, `@entities`.
- Type-only imports оформлять через `import type`.
- Не импортировать server-only modules в client code.
- Порядок: внешние библиотеки, внутренние modules, types.
- Не использовать длинные относительные пути между доменными модулями.

## Folder conventions

- Route: `src/app`.
- Feature UI: `src/features/<feature>`.
- Shared helpers/types: `src/shared`.
- Новая сущность может получить `src/entities/<entity>`, когда появится несколько переиспользуемых представлений.
- SQL: только `supabase/migrations`.
- Сквозные проверки: `scripts`.
- Архитектурные решения и состояние: `docs`.

## Performance rules

- Начальный workspace загружать одним RPC.
- Не выполнять полный `GET /api/workspace` после каждой mutation.
- Action возвращает изменённые DTO; клиент патчит state.
- Загружать ограниченную историю: сейчас 50 paid и 50 notifications.
- Не добавлять N+1 запросы в route handlers.
- Использовать параллельные независимые запросы.
- Не кэшировать персональные данные публично.
- Измерять сервер и клиент через понятные performance labels без PII.
- Перед удалением индекса проверять реальные query plans.
- Подробнее: [PERFORMANCE.md](./PERFORMANCE.md).

## SEO правила

CRM dashboard не является индексируемым маркетинговым контентом.

- Public home/login/join pages должны иметь корректные title и description.
- Invite token не должен попадать в sitemap или публичные ссылки.
- Защищённые и персональные страницы должны быть `noindex` при добавлении SEO-конфигурации.
- Не публиковать usernames, group membership или payment data в metadata.
- Semantic headings должны сохранять логическую иерархию.

## Проверка изменений

Проверки должны быть риск-ориентированными, чтобы не тратить контекст и время на полный build после каждого маленького шага.

После маленького behavior-preserving refactor или UI extraction:

```powershell
npm.cmd run typecheck
```

После 2-3 связанных низкорисковых изменений или перед commit/push:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

При изменении schema/auth/payments/invites/core flow:

```powershell
node scripts/verify-production-flow.mjs
```

Production migration и deploy выполняются только после успешной проверки кода и согласования.

## Документация

После крупного изменения обновить:

- [features.md](./features.md) — статус функции;
- [database.md](./database.md) — schema/RLS;
- [architecture.md](./architecture.md) — новый module или pattern;
- [roadmap.md](./roadmap.md) — изменение этапов;
- [ai-context.md](./ai-context.md) — текущее состояние и решения.
# UI style source of truth

Before large UI changes, read [ui-style.md](./ui-style.md) and [design-system.md](./design-system.md).

Tartib UI direction is **clean CRM + soft violet glass layer**:

- CRM readability is more important than decoration.
- Use glass for sidebar, mobile navigation, toolbars, search, filters, modals and quick actions.
- Do not use glass for dense payment rows, long financial tables, status pills or destructive actions.
- Green is not a Tartib brand accent; use violet/purple tokens for primary UI.
- Use design tokens from `src/app/globals.css`; do not hard-code new shared colors, shadows or radii.
- New UI must use primitives from `src/shared/ui` when possible: `Button`, `Panel`, `TextField`, `SelectField`, `Badge`, `EmptyState`, `SegmentedControl`.
- Existing dashboard UI may keep compatible classes such as `crm-panel`, `crm-table`, `crm-list-row`, `primary-button`, `ghost-button`, `small-button`, `segmented-control` and `status-pill` while it is migrated gradually.
