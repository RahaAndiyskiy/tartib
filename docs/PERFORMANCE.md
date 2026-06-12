# PERFORMANCE

## Найденные причины медленной работы

- API workspace собирался из множества отдельных таблиц и нескольких запросов.
- Аутентификация получала профиль и роли через несколько отдельных запросов к Supabase.
- После каждого действия в интерфейсе происходила полная повторная загрузка workspace.
- В таблице не было индексированных ключей для наиболее частых фильтров на сервере.

## Объединенные запросы

- Добавлена SQL-функция `public.get_current_identity()` для получения профиля пользователя и массива ролей одним безопасным RPC.
- Добавлена SQL-функция `public.get_workspace()` для получения всего workspace одним RPC-запросом.
- Серверный API `/api/workspace` теперь вызывает `get_workspace()` и возвращает данные в прежнем формате.

## Где убрана полная перезагрузка workspace

- В `src/features/dashboard/DashboardApp.tsx` удалено автоматическое `loadRemoteWorkspace()` после `runRemoteActionData`.
- После успешных API-действий workspace обновляется локально через `setWorkspace` на основе ответа от `/api/workspace/actions`.
- Полная загрузка выполняется только при открытии приложения, после обновления страницы или при fallback после ошибки синхронизации.

## Добавленные индексы

- `users(organization_id)`
- `users(auth_user_id)`
- `user_roles(user_id)`
- `trainer_members(organization_id, trainer_id)`
- `trainer_members(member_id)`
- `groups(organization_id, trainer_id)`
- `group_members(group_id, member_id)`
- `billing_plans(member_id, active)`
- `payment_requests(organization_id, trainer_id)`
- `payment_requests(member_id, is_current)`
- `notifications(user_id, read)`

## Как проверить улучшения

1. Запустить приложение локально: `npm.cmd run dev`.
2. Открыть консоль браузера и серверные логи.
3. Выполнить вход и загрузку `/api/workspace`.
4. Убедиться, что в логах есть записи:
   - `[performance] identity`
   - `[performance] workspace`
   - `[performance] action`
   - `[performance] client workspace load`
5. Выполнить действие в интерфейсе и убедиться, что после него не запускается полный `GET /api/workspace`.
6. Проверить, что кнопка действия блокируется и меняет текст на `Сохраняем...` или `Удаляем...`.

## SQL-функции, которые нужно будет применить позднее

- `public.get_current_identity()` — объединяет профиль и роли.
- `public.get_workspace()` — возвращает `LocalWorkspace` JSON для организации с учетом ролей.

> Тестовые значения времени не включены. В реальном режиме результаты измерений смотрите в консоли браузера и сервера.
