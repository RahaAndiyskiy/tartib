# Architecture

Related docs:

- [current-state.md](./current-state.md)
- [database.md](./database.md)
- [features.md](./features.md)
- [rules.md](./rules.md)
- [ui-style.md](./ui-style.md)
- [design-system.md](./design-system.md)

## Tech Stack

- Next.js 15 App Router
- React 18
- TypeScript
- Supabase Auth
- Supabase PostgreSQL
- Next.js Route Handlers
- PostgreSQL RPC functions
- `next-pwa`
- `lucide-react`
- global CSS in `src/app/globals.css`

## Folder Structure

```text
src/
  app/
    api/
      auth/register-owner/
      invitations/[token]/
      workspace/
      workspace/actions/
    dashboard/
    join/[token]/
    login/
    globals.css
  features/
    auth/
    dashboard/
  shared/
    constants/
    lib/
    ui/
    types/
supabase/
  migrations/
scripts/
docs/
public/
```

## Main Modules

`DashboardApp.tsx`

Main dashboard runtime/controller. Workspace runtime/chrome state, visual shell and several sections are extracted, but the file still owns drafts, pending action labels and cross-module callbacks. It is still large and should be split gradually, not rewritten at once.

Dashboard support modules:

- `src/features/dashboard/types.ts` - local dashboard form/view types.
- `src/features/dashboard/constants.ts` - labels and empty draft values.
- `src/features/dashboard/utils.ts` - dashboard date/payment helper functions.
- `src/features/dashboard/components/DashboardShell.tsx` - visual dashboard shell: sidebar, mobile topbar, header and navigation.
- `src/features/dashboard/components/DashboardOverlays.tsx` - global overlay wiring for notifications, logout confirmation and overview invite link modal.
- `src/features/dashboard/components/OverviewSection.tsx` - owner/trainer overview and member overview UI.
- `src/features/dashboard/components/PaymentWorkspaceSection.tsx` - dashboard-level owner/trainer payments composition.
- `src/features/dashboard/components/ScheduleSection.tsx` - schedule page UI.
- `src/features/dashboard/components/SettingsSection.tsx` - settings page UI.
- `src/features/dashboard/components/ExpensesSection.tsx` - expenses page UI.
- `src/features/dashboard/model/useAccountRuntime.ts` - push status, enable push, local reset, new window and sign-out actions.
- `src/features/dashboard/model/useDashboardChrome.ts` - dashboard section, modal and chrome state transitions.
- `src/features/dashboard/model/useDashboardNotice.ts` - temporary dashboard notice state and auto-clear timing.
- `src/features/dashboard/model/useDashboardUiState.ts` - local dashboard UI state for people search/filter, expanded people, member group editors and payment history expansion.
- `src/features/dashboard/model/useExpensesController.ts` - expenses draft state, create expense and mark-paid handlers.
- `src/features/dashboard/model/useGroupsController.ts` - group draft state, create/edit/delete handlers and default-payment sync trigger.
- `src/features/dashboard/model/useNotificationsController.ts` - open notifications and mark-read workflow.
- `src/features/dashboard/model/useOverviewController.ts` - overview-page props, today task navigation and member/owner overview wiring.
- `src/features/dashboard/model/usePendingAction.ts` - pending action state, loading button labels and remote action pending wrapper.
- `src/features/dashboard/model/usePeopleActionsController.ts` - dashboard-side people action orchestration for member group assignment and member deletion.
- `src/features/dashboard/model/usePeopleFlowController.ts` - person draft, member invite links, share/copy actions and active-user switching.
- `src/features/dashboard/model/usePaymentNavigation.ts` - payment view navigation, notification payment lookup and prepayment affordance checks.
- `src/features/dashboard/model/usePaymentActionsController.ts` - dashboard-side payment action orchestration for save/delete payment, confirmation, delay and prepayment flows.
- `src/features/dashboard/model/useScheduleController.ts` - schedule edit state, update and save handlers.
- `src/features/dashboard/model/useSettingsController.ts` - account/organization settings draft sync and save handlers.
- `src/features/dashboard/model/useWorkspaceRuntime.ts` - workspace loading, local sync, remote refresh, persistence and remote action helpers.
- `src/features/dashboard/LogoutConfirmModal.tsx` - logout confirmation modal UI.
- `src/features/dashboard/GroupFormModal.tsx` - group create/edit form UI.
- `src/features/dashboard/InviteLinkModal.tsx` - group invite picker/link modal UI.
- `src/features/dashboard/InviteResultCard.tsx` - reusable rendered invite link card.
- `src/features/dashboard/PaymentRegistryRow.tsx` - compact payment registry row UI.

Core/module boundaries are documented in [modular-architecture.md](./modular-architecture.md).

Current modularized pieces:

- `src/core/roles.ts` - shared role checks and role labels.
- `src/modules/people/components/PeoplePanel.tsx` - team list, group filter, search, member expansion and legacy people table UI.

`/api/workspace`

Loads the role-filtered workspace through `get_workspace()`.

`/api/workspace/actions`

Handles protected mutations:

- users/trainers;
- group links;
- groups;
- member assignment;
- payments;
- delays;
- notifications.
- profile and organization settings.

The route file is only a dispatcher. Domain handlers live in `src/app/api/workspace/actions/_lib/`:

- `users.ts`
- `invites.ts`
- `groups.ts`
- `members.ts`
- `payments.ts`
- `notifications.ts`
- `settings.ts`
- `utils.ts`
- `types.ts`

`/api/invitations/[token]`

Public invite read/claim endpoint. Creates member profile, role, trainer assignment and group membership.

`serverAuth.ts`

Reads Bearer token, validates it with Supabase Admin, then loads the app profile and roles through `get_current_identity()`.

`localWorkspace.ts`

Local development mode for UI experiments. Production must use Supabase.

`src/shared/ui`

Shared UI primitives for new interface work and Figma-to-code migration:

- `Button`
- `Panel`
- `TextField`
- `SelectField`
- `Badge`
- `EmptyState`
- `SegmentedControl`

Existing dashboard markup may still use compatible CSS classes while it is migrated gradually.

## Code Organization Principles

- `app/` owns routes and HTTP boundaries.
- `features/` owns user-facing flows.
- `shared/` owns reusable types, constants and infrastructure helpers.
- `shared/ui` owns generic visual primitives; product widgets stay in feature modules.
- Production data mutations go through server routes or database RPC.
- Client components must not use service-role access.
- SQL changes must be added as new migrations.
- Keep local-only prototypes separated from production behavior.

## Naming Conventions

- React components and types: `PascalCase`
- Functions and variables: `camelCase`
- API action names: `snake_case`
- SQL tables/columns: `snake_case`
- DB rows generally use DB naming.
- Client DTOs can use camelCase when already established.
- Conversion should be explicit with `toLocal*` helpers.

## State Management

There is no external state library.

Production:

- initial workspace is loaded from `GET /api/workspace`;
- client stores workspace in React state;
- actions return changed DTOs;
- UI updates local workspace without full reload when possible;
- app refreshes workspace on resume/visibility changes and through realtime events.

Local mode:

- workspace lives in `localStorage`;
- active test user is stored in `sessionStorage`;
- `reconcileWorkspace()` updates local reminders/statuses.

## API Architecture

Protected endpoints use:

- browser Supabase session;
- Bearer token in request header;
- `requireIdentity()` on the server;
- explicit role/ownership checks in handlers;
- Supabase Admin only on the server.

Important rule:

Never trust `organizationId`, role or ownership from request body. Derive them from server identity and database relationships.

## Server Components / Client Components

Pages and layouts stay server components unless they need browser APIs or React state.

Client components:

- `AuthPanel`
- `InvitationClaim`
- `DashboardApp`

New interactive UI should live under `src/features/<feature>/`.

## Rules For New Modules

1. Define the role and data ownership rules first.
2. Add a migration for production data.
3. Add TypeScript DB/domain types.
4. Add server route or RPC for mutations.
5. Return minimal DTOs from actions.
6. Update client state without unnecessary full workspace reload.
7. Update docs.
8. Run verification.

## Rules For New Pages

1. Add route under `src/app`.
2. Keep `page.tsx` thin.
3. Put interactive logic in `src/features`.
4. Add metadata if public.
5. Verify desktop and mobile.
6. Do not rely on middleware alone for security.

## Known Architecture Debt

- `DashboardApp.tsx` is too large.
- Some local-mode prototype concepts are still present.
- Tests are script-based, not a full automated suite.
- Event-based web push notifications are implemented. Scheduled push reminder cadence is still planned.
- Rate limiting is not implemented.
