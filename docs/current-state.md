# Tartib Current State

Last updated: 2026-06-28

This document is the practical snapshot of the project after the MVP core stabilization pass. Use it together with:

- [vision.md](./vision.md)
- [architecture.md](./architecture.md)
- [database.md](./database.md)
- [features.md](./features.md)
- [rules.md](./rules.md)
- [ui-style.md](./ui-style.md)
- [design-system.md](./design-system.md)
- [release-checklist.md](./release-checklist.md)
- [dependency-audit.md](./dependency-audit.md)
- [code-review.md](./code-review.md)

## Product State

Tartib is a lightweight CRM for clubs, trainers and students. The current product focus is:

- groups;
- group payment defaults;
- student onboarding through invite links;
- trainer/member assignment;
- billing plans;
- current payment requests;
- payment confirmation;
- delay requests;
- internal notifications;
- event-based web push notifications;
- account/profile settings;
- mobile/PWA use.

The product is intentionally small right now. Attendance, chat, analytics, expenses, salaries and complex finance are not part of the current production core.

## Production Core

The production core is live on Vercel and uses Supabase as the source of truth.

Production hardening currently includes:

- closed owner registration by default;
- basic in-memory rate limiting on critical API routes;
- a database unique index that allows only one current payment per member;
- payment confirmation RPC is executable only by the server service-role client;
- GitHub CI for typecheck, lint and build;
- performance logs behind debug env flags.

Implemented flow:

1. Owner creates a club account.
2. Owner automatically has `owner + trainer` roles.
3. Owner or trainer creates a group.
4. Trainer creates or reuses a group invite link.
5. Student opens `/join/[token]`, creates login and password, and joins the selected group.
6. If the group has default payment settings, the student's monthly billing plan and first current invoice are created automatically.
7. Trainer can adjust the student's payment if needed.
8. Student sees the current payment.
9. Student confirms payment or requests a delay.
10. Trainer approves/rejects the payment or delay.
11. Paid monthly payment atomically creates the next current payment.
12. Owner/trainer/member see role-appropriate payment state.
13. User can update basic profile data from settings.

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
- Dashboard helper modules now hold shared dashboard types, labels and date/payment helpers.
- Notification and logout confirmation modals are extracted from `DashboardApp.tsx`.
- Group create/edit form is extracted into `GroupFormModal`.
- Overview invite picker/link modal is extracted into `InviteLinkModal`.
- Repeated invite result UI is extracted into `InviteResultCard`.
- Compact payment registry rows are extracted into `PaymentRegistryRow`.
- Team list UI is extracted into `src/modules/people/components/PeoplePanel.tsx`.
- People view selectors and permissions are extracted into `src/modules/people`.
- Member group assignment and member deletion actions are extracted into `src/modules/people/actions`.
- Trainer creation and member invite creation helpers are extracted into `src/modules/people/actions`.
- Group list UI, visibility selectors and basic permissions are started in `src/modules/groups`.
- Group deletion action is extracted into `src/modules/groups/actions`.
- Group draft validation/build, edit mapping, workspace group upsert/replace helpers and remote group save are extracted into `src/modules/groups`.
- Payment view selectors, overview counts, registry filtering, selected payment details and form-state helpers are started in `src/modules/payments`.
- Payment save validation/build, remote save wrapper, group-default payment synchronization, high-level payment action wrappers and workspace mutation helpers for remote responses, deletion, confirmation, prepayment and delay decisions are started in `src/modules/payments/actions`.
- Shared role checks and labels live in `src/core/roles.ts`.
- `src/app/api/workspace/route.ts` loads the role-based workspace.
- `src/app/api/workspace/actions/route.ts` dispatches protected mutations.
- `src/app/api/workspace/actions/_lib/` contains domain action handlers.
- `src/app/api/invitations/[token]/route.ts` handles public invite registration.
- `src/shared/lib/serverAuth.ts` validates Bearer tokens and server identity.
- `src/shared/lib/supabaseClient.ts` creates the browser Supabase client with persistent session.
- `src/shared/lib/localWorkspace.ts` supports local development mode.
- `src/shared/ui` contains shared UI primitives for gradual design-system migration.
- `/api/health` exposes non-secret readiness checks for production smoke testing.

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
- `push_subscriptions`

Important RPC/functions:

- `get_current_identity()`
- `get_workspace()`
- `process_payment_reminders()`
- `confirm_payment_and_advance(payment_id, organization_id)`

Important current rule:

- Monthly payment confirmation is atomic in `confirm_payment_and_advance`.
- Direct browser/client execution of `confirm_payment_and_advance` is revoked; use the protected workspace action route.
- Paid payment history is never deleted.
- A member currently belongs to one group.
- A member can have only one `is_current = true` payment.
- A group invite link can be reused as the stable recruitment link for that group.
- A group can define default payment settings: amount and billing day.
- Group default payment settings are copied into member `billing_plans` and current `payment_requests`.
- `billing_plans.source` separates group-default plans from individual plans.
- Editing a group's default payment settings reapplies defaults only to synced group-default plans.
- Individual member payment conditions are not overwritten by group price changes.

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
- settings section contains profile fields, club name for owners and push enablement;
- no green as a main brand accent.

The UI works for testing, but final polish should happen through a Figma pass or a focused UI iteration.

Reusable UI primitives and Figma mapping are documented in [design-system.md](./design-system.md).

## Product Decision: Team vs Payments

The product should not blindly merge `Team` and `Payments`.

Current best model:

- `Team` is the people registry and member profile hub: identity, role, group, trainer, contact and personal payment settings.
- `Payments` is the money work queue: confirmations, overdue invoices, delay requests, current invoices and payment history.

This avoids a double full people list. A member card in `Team` may show a compact payment signal, but detailed payment actions should stay in `Payments` or in a focused member detail surface.

Future UX work should reduce duplication by making `Payments` action-first, not by moving all payment logic into `Team`.

## Technical Debt

High priority:

- rotate Supabase service-role key;
- keep payment default propagation covered by tests before adding complex pricing;
- expand the per-member override model only after real tariff scenarios are validated;
- extract duplicated payment date helpers into shared utilities;
- replace in-memory rate limiting with durable shared rate limiting if traffic grows;
- extend CI with production-flow checks when test secrets are available;
- resolve dependency audit items when safe upgrades exist;
- continue security review around organization/role boundaries;
- decide and document disputed payment edge cases.
- implement profile avatar upload with Supabase Storage bucket and policies.

Medium priority:

- gradually split `DashboardApp.tsx`;
- clean up local-only prototype code when no longer needed;
- improve production observability and performance measurement;
- add stronger automated tests for invite/payment flows.

Later:

- scheduled push reminders;
- email recovery;
- attendance;
- expenses/finance;
- analytics;
- multi-branch support.

## Current Verification Baseline

Use risk-based verification.

After a small behavior-preserving UI/code extraction, `typecheck` is enough for the immediate micro-step:

```bash
npm.cmd run typecheck
```

Before commit/push, or after a batch of 2-3 related low-risk changes, run:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

For schema, auth, payment, invite or important production-flow changes, also run or update:

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
