# UI Direction

Tartib UI direction is **clean CRM + soft glass layer**.

All AI agents must read [ui-style.md](./ui-style.md) before large UI changes. Use tokens from `src/app/globals.css`. Keep glass for navigation, toolbars, filters, modals and quick actions. Keep tables, payment rows and financial data plain, readable and high contrast.

# Project Overview

Tartib — role-based CRM для спортивных клубов, школ единоборств, танцевальных студий и образовательных центров. Production работает на Next.js + Supabase. Ядро: organization, users/roles, groups, member invitations, billing plans, payment requests, delays и notifications.

Перед работой прочитать:

1. [vision.md](./vision.md)
2. [architecture.md](./architecture.md)
3. [database.md](./database.md)
4. [rules.md](./rules.md)
5. [features.md](./features.md)

# Current State

- Production развернут на Vercel.
- Supabase является source of truth.
- Login/password работает через внутренний технический email.
- Owner получает роли owner + trainer.
- Trainer создаёт groups и invite links.
- Member самостоятельно создаёт account по invite.
- Полный payment lifecycle работает и проверяется сквозным тестом.
- Daily cron создаёт reminders и overdue.
- Workspace загружается одним PostgreSQL RPC.
- Mutations обновляют client state из action response без полного reload.
- Desktop и mobile CRM интерфейсы реализованы.
- LocalStorage mode сохранён для разработки.
- Expenses и legacy schedules существуют только как local prototypes.
- Storage не используется.

# Active Tasks

Текущий приоритет — стабилизация ядра, а не новые крупные модули:

1. Security audit RLS и cross-organization isolation.
2. Ротация ранее раскрытого Supabase service-role key.
3. Rate limiting для auth и mutation API.
4. Формализация спорных payment rules.
5. CI для typecheck, lint, build и core flow.
6. Постепенное разделение `DashboardApp.tsx`.
7. Очистка local-only expenses/schedules.
8. Реальные performance measurements и monitoring.

Подробности: [roadmap.md](./roadmap.md) и [TECH_DEBT.md](../TECH_DEBT.md).

# Important Decisions

- MVP сфокусирован на группах, учениках и оплатах.
- Раздел «Оплаты» использует компактный реестр и контекстную панель деталей вместо постоянно открытых форм в каждой строке. В интерфейсе нужно явно разделять «Условия оплаты» (`billing_plans`) и «Текущий счёт» (`payment_requests`).
- Member не должен видеть команду и лишнюю аналитику.
- Trainer dashboard показывает действия; owner dashboard — контроль.
- Group определяет activity, days и time.
- Member создаёт login/password сам по invite.
- Email не обязателен для текущей authentication.
- Один user может иметь несколько roles.
- Один member сейчас принадлежит одной group.
- Monthly и one-time payments используют общий billing core.
- Individual training — формат плана, а не умножение стоимости на занятия.
- Paid history не удаляется.
- Неоплаченный invoice можно удалить с уведомлением member.
- Production state не обновляется через local `saveWorkspace()`.
- API actions возвращают клиентские DTO и не инициируют полный workspace reload.
- Supabase RLS и server authorization используются одновременно.

# AI Instructions

## Обязательные действия

- Сначала читать документацию и существующий код.
- Соблюдать [rules.md](./rules.md).
- Сохранять текущую архитектуру и role visibility.
- Переиспользовать существующие components, styles и helpers.
- Сверяться со схемой в [database.md](./database.md).
- Для schema changes создавать новую migration.
- Обновлять документацию после крупных изменений.
- Проверять typecheck, lint и build.
- Core changes покрывать production-flow script.

## Запреты

- Не переносить service role на клиент.
- Не доверять role, organizationId или ownership из request body.
- Не делать новую полную загрузку workspace после обычной mutation.
- Не считать local-only expenses production feature.
- Не добавлять attendance, chat, analytics или expenses без явного запроса.
- Не переписывать DashboardApp целиком ради небольшого изменения.
- Не менять applied migrations задним числом.
- Не удалять paid financial history.
- Не ослаблять RLS ради удобства.
- Не делать deploy или production migration без явного поручения.

## Перед завершением задачи

1. Проверить, не нарушена ли видимость owner/trainer/member.
2. Проверить client DTO против DB row naming.
3. Проверить optimistic state update.
4. Проверить mobile layout для UI-изменений.
5. Обновить соответствующие docs.
6. Сообщить, какие проверки не удалось выполнить.
