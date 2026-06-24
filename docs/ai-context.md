# AI Context

Start here before changing Tartib.

## Project Overview

Tartib is a lightweight CRM/PWA for clubs, trainers and students. The current production core manages:

- organizations;
- roles;
- groups;
- invite links;
- members;
- billing plans;
- payment requests;
- payment confirmation;
- delay requests;
- internal notifications;
- account/profile settings.

Read the current project snapshot first: [current-state.md](./current-state.md).

## Current State

Production is deployed on Vercel and uses Supabase as the source of truth.

The main working flow is:

1. Owner creates a club.
2. Owner also receives trainer permissions.
3. Trainer creates a group.
4. Trainer gives a group invite link.
5. Member registers through the link.
6. Trainer assigns payment.
7. Member confirms payment or requests delay.
8. Trainer approves/rejects.
9. Paid monthly payment creates the next payment through a database RPC.

PWA, mobile navigation and persistent Supabase browser sessions are already implemented.

## Important Files

- `src/features/dashboard/DashboardApp.tsx` - main CRM UI and client state.
- `src/app/api/workspace/route.ts` - role-based workspace load.
- `src/app/api/workspace/actions/route.ts` - protected production mutations.
- `src/app/api/invitations/[token]/route.ts` - public invite registration.
- `src/shared/lib/serverAuth.ts` - server identity from Bearer token.
- `src/shared/lib/supabaseClient.ts` - browser Supabase client.
- `src/shared/lib/localWorkspace.ts` - local development workspace.
- `src/shared/ui` - shared UI primitives for new screens and gradual dashboard migration.
- `supabase/migrations/` - database schema and RPC history.
- `docs/current-state.md` - latest product/technical snapshot.
- `docs/ui-style.md` - current UI direction.
- `docs/design-system.md` - UI tokens, primitives, Figma mapping and migration rules.
- `docs/release-checklist.md` - release and smoke-test checklist.
- `docs/dependency-audit.md` - npm audit findings and dependency risk notes.

## Important Decisions

- Login/password is used now; real verified email is postponed.
- The login is internally converted to an email under `auth.tartib.local`.
- Supabase service role is server-only.
- Owner can also be trainer.
- Member currently belongs to one group.
- Group recruitment links are reusable.
- Payment conditions live in `billing_plans`.
- Current and historical invoices live in `payment_requests`.
- Paid history must not be deleted.
- Monthly payment approval is atomic through `confirm_payment_and_advance`.
- Basic profile and owner organization settings are edited through workspace actions.
- Expenses and schedules are not production core yet.
- Do not add attendance, chat, analytics, finance or scheduled push reminders unless explicitly requested.

## Active Tasks

Current preferred direction:

1. Stabilize and document the core.
2. Keep code changes small and behavior-preserving unless the user asks for product changes.
3. Close security and reliability debt before adding bigger modules.
4. Use Figma or focused UI passes for visual redesign instead of random component-by-component styling.

## AI Instructions

- Do not break existing architecture.
- Reuse existing components, helpers and style tokens.
- Follow [rules.md](./rules.md).
- Follow [database.md](./database.md) for schema concepts.
- Read [current-state.md](./current-state.md) before product work.
- Read [ui-style.md](./ui-style.md) and [design-system.md](./design-system.md) before UI work.
- Use `src/shared/ui` primitives for new UI when possible.
- For schema changes, create a new migration; never edit old applied migrations.
- Keep service-role access in server-only files.
- Never trust role, organization or ownership from client payloads.
- Validate role and ownership in server routes even when RLS also exists.
- Keep production mutations in API routes or database RPC.
- Return small DTOs from actions and update client state from those DTOs.
- Do not rewrite `DashboardApp.tsx` wholesale.
- Update documentation after major product, database or architecture changes.
- Use [release-checklist.md](./release-checklist.md) before production releases.
- Do not run `npm audit fix --force` without reviewing [dependency-audit.md](./dependency-audit.md).

## Verification

For normal code changes:

```bash
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

For core flow changes, also run or update:

```bash
node scripts/verify-production-flow.mjs
```

For UI changes, manually verify mobile and desktop layouts.
