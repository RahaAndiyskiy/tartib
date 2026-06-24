# Tartib Current State

Last updated: 2026-06-24

This document is the practical snapshot of the project after the MVP core stabilization pass. Use it together with:

- [vision.md](./vision.md)
- [architecture.md](./architecture.md)
- [database.md](./database.md)
- [features.md](./features.md)
- [rules.md](./rules.md)
- [ui-style.md](./ui-style.md)

## Product State

Tartib is a lightweight CRM for clubs, trainers and students. The current product focus is:

- groups;
- student onboarding through invite links;
- trainer/member assignment;
- billing plans;
- current payment requests;
- payment confirmation;
- delay requests;
- internal notifications;
- mobile/PWA use.

The product is intentionally small right now. Attendance, chat, analytics, expenses, salaries and complex finance are not part of the current production core.

## Production Core

The production core is live on Vercel and uses Supabase as the source of truth.

Implemented flow:

1. Owner creates a club account.
2. Owner automatically has `owner + trainer` roles.
3. Owner or trainer creates a group.
4. Trainer creates or reuses a group invite link.
5. Student opens `/join/[token]`, creates login and password, and joins the selected group.
6. Trainer assigns or edits the student's payment.
7. Student sees the current payment.
8. Student confirms payment or requests a delay.
9. Trainer approves/rejects the payment or delay.
10. Paid monthly payment atomically creates the next current payment.
11. Owner/trainer/member see role-appropriate payment state.

## Roles

`owner`

- sees organization-level control data;
- manages trainers;
- sees members and payments in the organization;
- can manage groups and payments.

`trainer`

- manages own groups;
- gives invite links;
- sees assigned members;
- creates and edits payment conditions/current payments;
- approves payment confirmations and delay requests.

`member`

- sees own payment, group/trainer context and schedule;
- confirms payment;
- requests delay;
- sees own notifications/history.

One user can have more than one role. The main production example is `owner + trainer`.

## Architecture Snapshot

Main stack:

- Next.js 15 App Router;
- React 18;
- TypeScript;
- Supabase Auth + PostgreSQL;
- Next.js Route Handlers for server actions;
- PostgreSQL RPC for workspace loading and atomic payment confirmation;
- `next-pwa` for PWA assets/service worker;
- global CSS in `src/app/globals.css`.

Important modules:

- `src/features/dashboard/DashboardApp.tsx` is still the main CRM shell and is large.
- `src/app/api/workspace/route.ts` loads the role-based workspace.
- `src/app/api/workspace/actions/route.ts` dispatches protected mutations.
- `src/app/api/workspace/actions/_lib/` contains domain action handlers.
- `src/app/api/invitations/[token]/route.ts` handles public invite registration.
- `src/shared/lib/serverAuth.ts` validates Bearer tokens and server identity.
- `src/shared/lib/supabaseClient.ts` creates the browser Supabase client with persistent session.
- `src/shared/lib/localWorkspace.ts` supports local development mode.

Do not rewrite `DashboardApp.tsx` in one large step. Extract only when a specific feature is being touched and behavior is covered by checks.

## Database Snapshot

Core tables:

- `organizations`
- `users`
- `user_roles`
- `trainer_members`
- `groups`
- `group_members`
- `billing_plans`
- `payment_requests`
- `notifications`
- `member_invites`

Important RPC/functions:

- `get_current_identity()`
- `get_workspace()`
- `process_payment_reminders()`
- `confirm_payment_and_advance(payment_id, organization_id)`

Important current rule:

- Monthly payment confirmation is atomic in `confirm_payment_and_advance`.
- Paid payment history is never deleted.
- A member currently belongs to one group.
- A group invite link can be reused as the stable recruitment link for that group.

## Authentication

The current auth model uses login/password without requiring real email.

Implementation detail:

- user login is normalized and converted to an internal email like `login@auth.tartib.local`;
- Supabase Auth stores credentials;
- `public.users` stores the business profile;
- email confirmation is not part of the current MVP.

Known future auth work:

- password recovery;
- verified real email;
- rate limiting;
- rotating the previously exposed service-role key.

## UI State

Direction:

- clean CRM;
- soft violet glass style;
- compact mobile-first screens;
- bottom navigation on mobile;
- notifications moved to the top area;
- no green as a main brand accent.

The UI works for testing, but final polish should happen through a Figma pass or a focused UI iteration.

## Technical Debt

High priority:

- rotate Supabase service-role key;
- add rate limiting to auth and mutation endpoints;
- add CI for typecheck, lint, build and core flow;
- continue security review around organization/role boundaries;
- decide and document disputed payment edge cases.

Medium priority:

- gradually split `DashboardApp.tsx`;
- clean up local-only prototype code when no longer needed;
- improve production observability and performance measurement;
- add stronger automated tests for invite/payment flows.

Later:

- push notifications;
- email recovery;
- attendance;
- expenses/finance;
- analytics;
- multi-branch support.

## Current Verification Baseline

Before shipping core changes, run:

```bash
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

For important production-flow changes, also run or update:

```bash
node scripts/verify-production-flow.mjs
```

Use browser/PWA manual checks for UI and session persistence changes.

## AI Notes

- Read this file first for current state.
- Do not trust client-provided `organizationId`, role or ownership.
- Use server identity from `requireIdentity()`.
- Production mutations must happen through server routes.
- Supabase service role must stay server-only.
- New schema changes need a new migration.
- Keep action responses small and update client state from returned DTOs when possible.
- Do not add postponed modules unless explicitly requested.
