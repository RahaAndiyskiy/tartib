# Features

Related docs:

- [vision.md](./vision.md)
- [architecture.md](./architecture.md)
- [database.md](./database.md)
- [roadmap.md](./roadmap.md)

## Done

### Owner Registration

- Description: creates organization, owner profile and owner/trainer roles.
- Pages: `/login`
- Tables: `auth.users`, `organizations`, `users`, `user_roles`

### Login / Session Persistence

- Description: login/password auth through Supabase, browser session persists for PWA and web.
- Pages: `/login`, `/dashboard`
- Tables: `auth.users`, `users`

### Role-Based Workspace

- Description: owner/trainer/member see role-appropriate workspace data.
- Pages: `/dashboard`
- Tables: all core workspace tables
- RPC: `get_workspace()`, `get_current_identity()`

### Groups

- Description: owner/trainer creates, edits and deletes groups with activity, days, time, note and default payment settings.
- Pages: `/dashboard`
- Tables: `groups`, `billing_plans`, `payment_requests`

### Group Payment Defaults

- Description: a group can define default monthly amount and billing day; new invite members receive a billing plan and current invoice automatically.
- Pages: `/dashboard`, `/join/[token]`
- Tables: `groups`, `billing_plans`, `payment_requests`, `member_invites`

### Reusable Group Invite Links

- Description: trainer creates a stable recruitment link for a group; students register themselves.
- Pages: `/dashboard`, `/join/[token]`
- Tables: `member_invites`, `users`, `user_roles`, `trainer_members`, `group_members`

### Team Management

- Description: owner/trainer sees people, filters/searches team, changes member group, deletes member.
- Pages: `/dashboard`
- Tables: `users`, `trainer_members`, `group_members`

### Payment Conditions

- Description: trainer/owner sets payment type, format, base amount, billing day and whether the member follows group defaults or individual conditions.
- Pages: `/dashboard`
- Tables: `billing_plans`

### Current Payment

- Description: trainer/owner creates or edits the current invoice for a member.
- Pages: `/dashboard`
- Tables: `payment_requests`

### Payment Confirmation

- Description: member confirms payment and trainer/owner approves or rejects it. Trainer/owner can also mark an active, overdue or delayed invoice as paid directly with one action.
- Pages: `/dashboard`
- Tables: `payment_requests`, `notifications`
- RPC: `confirm_payment_and_advance()`, `confirm_payment_direct_and_advance()`

### Next Monthly Payment

- Description: approved monthly payment creates the next current payment atomically.
- Pages: `/dashboard`
- Tables: `billing_plans`, `payment_requests`
- RPC: `confirm_payment_and_advance()`

### Delay Request

- Description: member requests a new due date; trainer/owner approves or rejects.
- Pages: `/dashboard`
- Tables: `payment_requests`, `notifications`

### Month Skip

- Description: member can report that they will not attend the current month; trainer/owner can approve or reject it. Trainer/owner can also mark the current active/overdue/delayed month as skipped directly. Approved monthly skips close the current invoice without paid amount and create the next monthly invoice when an active monthly plan exists.
- Pages: `/dashboard`
- Tables: `payment_requests`, `billing_plans`, `notifications`
- RPC: `skip_payment_and_advance()`

### Automatic Reminders

- Description: database cron updates overdue status and creates payment reminders.
- Pages: `/dashboard`
- Tables: `payment_requests`, `notifications`
- Function: `process_payment_reminders()`

### Internal Notifications

- Description: user opens notifications from the top button in a modal; payment, delay and month-skip notifications are actionable.
- Pages: `/dashboard`
- Tables: `notifications`, `payment_requests`

### Web Push Notifications

- Description: external browser/PWA push is postponed and hidden from the product UI. MVP uses internal actionable notifications only.
- Pages: `/dashboard`
- Tables: `push_subscriptions`, `notifications`, `payment_requests`

### Account Settings

- Description: user can update first name, last name and phone; owner can update organization name. External push settings are hidden until the push project is revisited.
- Pages: `/dashboard`
- Tables: `users`, `organizations`, `push_subscriptions`

### PWA / Mobile Shell

- Description: manifest, service worker, mobile layout, bottom navigation and pull-to-refresh that reloads workspace data without restarting the PWA.
- Pages: all user-facing pages
- Tables: not applicable

### Basic Production Hardening

- Description: owner registration is closed by default in production, critical mutation endpoints have basic rate limiting, CI runs typecheck/lint/build.
- Pages: `/login`, API routes
- Tables: `payment_requests`

### Local Development Mode

- Description: localStorage workspace for UI experiments without Supabase.
- Pages: `/login`, `/dashboard`
- Tables: not applicable

## In Development / Needs Stabilization

### Codebase Cleanup

- Description: gradually split `DashboardApp.tsx` and reduce local-only prototype surface.
- Pages: `/dashboard`
- Tables: not applicable

### Team / Payments UX Separation

- Description: reduce duplicated student/payment surfaces. `Team` should stay the people/profile hub; `Payments` should become an action-first payment queue.
- Pages: `/dashboard`
- Tables: `users`, `group_members`, `billing_plans`, `payment_requests`

### Profile Avatar Upload

- Description: avatar UI placeholder exists, but real photo upload needs Supabase Storage bucket and access policies.
- Pages: `/dashboard`
- Tables: `users`

### Security Hardening

- Description: rotate service-role key, replace in-memory rate limiting with durable shared limiting if needed, continue RLS/server authorization review.
- Pages: API routes
- Tables: all core tables

### Production Observability

- Description: real performance measurements, logs and clearer failure states.
- Pages: `/dashboard`, API routes
- Tables: not applicable

### UI Polish

- Description: current UI works but needs a cleaner Figma-led pass.
- Pages: `/dashboard`, `/login`, `/join/[token]`
- Tables: not applicable

## Planned

### Scheduled Push Reminders

- Description: push delivery for scheduled reminders before due date/on overdue, after the reminder cadence is finalized.
- Pages: notifications/settings
- Tables: `push_subscriptions`, `notifications`, `payment_requests`

### Password Recovery / Real Email

- Description: restore password and optional verified contact email.
- Pages: auth pages
- Tables: `auth.users`, `users`

### Attendance

- Description: track training attendance by group/date.
- Pages: future attendance module
- Tables: future attendance tables

### Finance / Expenses

- Description: production-grade expense and profit tracking.
- Pages: future finance module
- Tables: future finance tables

### Messaging / Broadcasts

- Description: announcements to groups or whole club.
- Pages: future communications module
- Tables: future message tables

### Analytics

- Description: deeper reporting after core data is reliable.
- Pages: future analytics module
- Tables: depends on final analytics design

### Multi-Branch

- Description: several branches inside one organization.
- Pages: future settings/filtering
- Tables: future `branches` and branch foreign keys
