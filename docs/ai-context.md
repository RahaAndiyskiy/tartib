# AI Context

Start here before changing Tartib.

## Project Overview

Tartib is a lightweight CRM/PWA for clubs, trainers and students. The current production core manages:

- organizations;
- roles;
- groups;
- group payment defaults;
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
6. If the group has default payment settings, a monthly plan and current payment are created automatically.
7. Trainer can adjust payment when needed.
8. Member confirms payment or requests delay.
9. Trainer approves/rejects.
10. Paid monthly payment creates the next payment through a database RPC.

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
- `docs/code-review.md` - latest code review findings and technical risks.

## Important Decisions

- Tartib is moving toward a configurable modular monolith. See [modular-architecture.md](./modular-architecture.md).
- Product domains should move into `src/modules`; cross-product rules should move into `src/core`.
- Login/password is used now; real verified email is postponed.
- The login is internally converted to an email under `auth.tartib.local`.
- Supabase service role is server-only.
- Owner can also be trainer.
- Member currently belongs to one group.
- Group recruitment links are reusable.
- Groups can define default payment amount and billing day.
- Group payment defaults are copied into member billing plans and current payments.
- `billing_plans.source` controls whether a member follows group defaults or individual conditions.
- Individual payment conditions must not be overwritten by group price edits.
- Payment conditions live in `billing_plans`.
- Current and historical invoices live in `payment_requests`.
- `Team` is the people/profile hub; `Payments` is the payment action queue. Do not merge them without a product decision.
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
- Read [code-review.md](./code-review.md) before changing payment/group/team flows.
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

Use risk-based verification to avoid wasting time and context.

For small behavior-preserving refactors or UI extractions:

```bash
npm.cmd run typecheck
```

After 2-3 low-risk related changes, or before commit/push:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

For schema, auth, payment, invite or core flow changes, also run or update:

```bash
node scripts/verify-production-flow.mjs
```

For UI changes, manually verify mobile and desktop layouts.
