# Tartib

CRM для спортивных клубов, школ единоборств, танцевальных студий и образовательных центров.

## Текущий сценарий

- владелец создаёт тренеров;
- тренер создаёт группы и учеников;
- ученику назначается ежемесячная или разовая оплата;
- система отслеживает сроки и просрочки;
- ученик может запросить отсрочку или сообщить об оплате;
- тренер принимает решение;
- владелец видит общую ситуацию по клубу.

## Локальный запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env.local` по примеру `.env.example`.

3. Применить миграции из `supabase/migrations` по порядку:

```bash
node scripts/apply-migration.mjs supabase/migrations/011_unique_current_payment.sql
```

Для новой базы нужно применить все миграции с `001` по последнюю.

4. Запустить приложение:

```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`.

## Авторизация

Пользователи входят по логину и паролю. Реальный адрес электронной почты пока не требуется. Внутренний технический email создаётся автоматически и не показывается пользователю.

## Production-настройки

Регистрация новых клубов в production по умолчанию закрыта.

- `NEXT_PUBLIC_OWNER_REGISTRATION_ENABLED=false` скрывает регистрацию в UI.
- `TARTIB_OWNER_REGISTRATION_ENABLED=false` закрывает публичный API регистрации.
- `TARTIB_OWNER_REGISTRATION_SECRET` позволяет создать клуб через API/скрипт с заголовком `x-tartib-setup-secret`.

Для временного публичного открытия регистрации нужно выставить оба флага в `true`.

Performance-логи выключены по умолчанию:

- `NEXT_PUBLIC_DEBUG_PERFORMANCE=false`
- `TARTIB_DEBUG_PERFORMANCE=false`

Web Push нужен для push-уведомлений в PWA/браузере:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Без этих переменных кнопка включения push покажет, что сервер ещё не настроен.

## Проверка

```bash
npm run typecheck
npm run lint
npm run build
node scripts/verify-production-flow.mjs
```

Для проверки production-flow на закрытой регистрации добавьте `TARTIB_OWNER_REGISTRATION_SECRET` в `.env.local` или переменные окружения.

## CI

GitHub Actions запускает:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Список известных ограничений находится в [TECH_DEBT.md](./TECH_DEBT.md).
