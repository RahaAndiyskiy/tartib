# Architecture

Related docs:

- [current-state.md](./current-state.md)
- [database.md](./database.md)
- [features.md](./features.md)
- [rules.md](./rules.md)
- [ui-style.md](./ui-style.md)

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
    types/
supabase/
  migrations/
scripts/
docs/
public/
```

## Main Modules

`DashboardApp.tsx`

Main CRM client shell. It contains role navigation, overview, team, groups, payments and notifications. It is large and should be split gradually, not rewritten at once.

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

`/api/invitations/[token]`

Public invite read/claim endpoint. Creates member profile, role, trainer assignment and group membership.

`serverAuth.ts`

Reads Bearer token, validates it with Supabase Admin, then loads the app profile and roles through `get_current_identity()`.

`localWorkspace.ts`

Local development mode for UI experiments. Production must use Supabase.

## Code Organization Principles

- `app/` owns routes and HTTP boundaries.
- `features/` owns user-facing flows.
- `shared/` owns reusable types, constants and infrastructure helpers.
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
- Push notifications are not implemented.
- Rate limiting is not implemented.
