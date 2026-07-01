# Code Review

Last reviewed: 2026-07-01

Related docs:

- [current-state.md](./current-state.md)
- [architecture.md](./architecture.md)
- [database.md](./database.md)
- [features.md](./features.md)
- [rules.md](./rules.md)

## Scope

This review covers the code after the recent mobile UI, notification modal, group payment defaults, invite onboarding and group editing changes.

The review is not a full security audit. It is a practical engineering snapshot for the next AI or developer working on Tartib.

## Main Findings

### 1. Group default payment propagation now has an override model

File: `src/app/api/workspace/actions/_lib/groups.ts`

When a group is saved with `defaultAmount` and `defaultBillingDay`, `applyGroupPaymentDefaults()` updates or creates the active billing plan and current payment for members who still follow group defaults.

Current behavior:

- `billing_plans.source = group_default` means the member follows the group price;
- `billing_plans.source = individual` means the member has individual conditions;
- individual plans are skipped during group-wide price edits;
- confirmation, delay and paid payment states are not reset by group-wide price edits.

Remaining risk:

- the group-wide update is still implemented in server code, not a transaction;
- there are not enough automated tests around source transitions yet.

Recommended next step:

- add focused tests for:
  - group-default member follows group price edit;
  - individual member is skipped;
  - payment confirmation/delay state is preserved.

### 2. Group pricing update is not transactional

File: `src/app/api/workspace/actions/_lib/groups.ts`

`applyGroupPaymentDefaults()` updates all members with `Promise.all()`. This is faster than sequential updates, but if one member fails after others succeed, the group may be partially updated.

Risk:

- some students receive the new price/current invoice;
- others keep the old state;
- the UI receives only the first error message.

Recommended next step:

- move this operation into a PostgreSQL RPC if group-wide pricing becomes core business logic;
- or add a small consistency check after save and show an actionable warning if some members failed.

### 3. Payment date helpers are duplicated

Files:

- `src/features/dashboard/DashboardApp.tsx`
- `src/app/api/invitations/[token]/route.ts`
- `src/app/api/workspace/actions/_lib/groups.ts`
- `src/app/api/workspace/actions/_lib/utils.ts`

Helpers such as `dueDateForBillingDay()` and `periodLabel()` exist in multiple places. Some use local time, others UTC-style dates.

Risk:

- client and server can produce slightly different due dates around timezone boundaries;
- future billing changes may be fixed in one place but missed in another.

Recommended next step:

- keep server billing date logic in one server helper;
- keep client-only display helpers separate;
- document whether billing dates are organization-local, user-local or UTC-based.

### 4. `DashboardApp.tsx` is still too large

File: `src/features/dashboard/DashboardApp.tsx`

The dashboard still contains local workspace behavior, remote mutations, forms, groups, team, payments and settings orchestration in one file.

Recent progress:

- dashboard types were moved to `src/features/dashboard/types.ts`;
- labels and empty drafts were moved to `src/features/dashboard/constants.ts`;
- role/date/payment helpers were moved to `src/features/dashboard/utils.ts`;
- `LogoutConfirmModal` was extracted inside dashboard support UI.
- `NotificationsModal` and mark-read action were moved into `src/modules/notifications`.
- `GroupFormModal` was extracted.
- `InviteLinkModal` was extracted for the overview group invite flow.
- `InviteResultCard` was extracted for repeated invite link output.
- `PaymentRegistryRow` was moved into `src/modules/payments` for compact payments registry rows.
- `MemberPaymentPanel` was extracted for the member-facing payment page.
- `PaymentWorkspaceRegistryPanel` was extracted for owner/trainer payment tabs, search, action groups and paid history list.
- `PaymentDrawer` was extracted for payment details, edit form, decisions, prepayment, history and delete UI.
- `PaymentWorkspaceSection` was extracted for dashboard-level owner/trainer payments composition.
- `usePaymentUiState` was extracted for payment UI view/search/selection/edit drafts/delay drafts/prepayment months.
- `PeoplePanel` was extracted into `src/modules/people` for the team list, search/filter controls and member group actions.
- `PersonFormPanel` was extracted for the add-person form UI.
- `hasRole` and `roleLabel` were moved into `src/core/roles.ts`.
- People view selectors and permissions were moved into `src/modules/people`.
- Member group assignment and member deletion actions were moved into `src/modules/people/actions`.
- Trainer creation and member invite creation helpers were moved into `src/modules/people/actions`.
- Local person creation was moved into `src/modules/people/actions`, including the local member assignment and optional initial payment path.
- Add-person submit branching was moved into `src/modules/people/actions`; `DashboardApp` now only applies the returned UI/workspace effect.
- Group create/edit submit branching was moved into `src/modules/groups/actions`; payment default synchronization remains an injected payments dependency.
- `GroupsSection` was extracted for dashboard-level groups composition.
- Group draft state, create/edit/delete handlers and default-payment sync trigger were moved into `src/features/dashboard/model/useGroupsController.ts`.
- Profile and organization settings save actions were moved into `src/modules/account/actions`.
- Schedule edit/save logic was moved into `src/modules/schedule/actions`.
- Expense create/mark-paid logic was moved into `src/modules/expenses/actions`.
- Dashboard derived data and payment UI model wiring were moved into `src/features/dashboard/model/useDashboardData.ts`.
- Push status, enable push, local reset, new window and sign-out actions were moved into `src/features/dashboard/model/useAccountRuntime.ts`.
- Dashboard chrome state and repeated open/close transitions were moved into `src/features/dashboard/model/useDashboardChrome.ts`.
- Expenses draft state, create expense and mark-paid handlers were moved into `src/features/dashboard/model/useExpensesController.ts`.
- Opening notifications and marking them as read were moved into `src/features/dashboard/model/useNotificationsController.ts`.
- Person draft state, member invite links, share/copy actions and active-user switching were moved into `src/features/dashboard/model/usePeopleFlowController.ts`.
- Payment view navigation, notification payment lookup and prepayment affordance checks were moved into `src/features/dashboard/model/usePaymentNavigation.ts`.
- Dashboard-side payment action orchestration was moved into `src/features/dashboard/model/usePaymentActionsController.ts`.
- Schedule edit state, update and save handlers were moved into `src/features/dashboard/model/useScheduleController.ts`.
- Workspace loading, local sync, remote refresh, persistence and remote action helpers were moved into `src/features/dashboard/model/useWorkspaceRuntime.ts`.
- Pending action state, loading button labels and the remote action pending wrapper were moved into `src/features/dashboard/model/usePendingAction.ts`.
- Account/organization settings draft sync and save handlers were moved into `src/features/dashboard/model/useSettingsController.ts`.
- Dashboard navigation labels and active-user section correction were moved into `src/features/dashboard/model/navigation.ts`.
- Dashboard visual shell, global overlays plus overview, schedule, settings and expenses JSX sections were moved out of `DashboardApp` into dashboard section components.
- Group list UI, visible group selectors and basic group permissions were started in `src/modules/groups`.
- Group deletion action was moved into `src/modules/groups/actions`.
- Group draft validation/build, edit mapping, workspace group upsert/replace helpers and remote group save were moved into `src/modules/groups`.
- Payment view selectors, overview counts, registry filtering, selected payment details and form-state helpers were started in `src/modules/payments`.
- Payment save validation/build, remote save wrapper, group-default payment synchronization, high-level payment action wrappers and workspace mutation helpers for remote responses, deletion, confirmation, prepayment and delay decisions were started in `src/modules/payments/actions`.

Risk:

- small UI changes can affect unrelated flows;
- duplicated state and message handling are easier to introduce;
- new AI agents need more context to make safe changes.

Recommended next step:

- do not rewrite it wholesale;
- extract only around touched features:
  - remaining team/group cross-module adapters;
  - shared message/toast helper;
  - final dashboard composition cleanup after controllers settle.

### 5. Temporary notices are still global and fragile

File: `src/features/dashboard/DashboardApp.tsx`

The app uses a single global `message` string for many unrelated actions. Recent UX changes made notices auto-clear, but the pattern is still broad.

Risk:

- one action can clear another action's feedback;
- messages can appear far away from the feature that caused them;
- future modal flows may feel inconsistent.

Recommended next step:

- introduce a small toast/notice helper with type, timeout and scope;
- keep feature-specific success states inside the relevant modal where possible.

## Product UX Note: Team vs Payments

Do not merge `Team` and `Payments` only because they both mention students.

Recommended mental model:

- `Team` answers "who is in the club and what is their setup?"
- `Payments` answers "what money action needs to happen now?"

Good direction:

- keep compact payment status in `Team`;
- keep full payment workflow in `Payments`;
- make `Payments` less like a people list and more like an action queue;
- eventually open a member detail view from either place.

## Stable Decisions To Preserve

- Login/password is used without real email confirmation for MVP.
- Group invite links are reusable recruitment links.
- Group payment defaults create initial member billing automatically.
- Individual payment conditions are represented by `billing_plans.source = individual`.
- Paid payment history must not be deleted.
- Only one current payment per member is allowed.
- Notification UI is a modal, not a bottom navigation page.
- Mobile UI uses soft white/violet glass styling with `#8D70FE` as the main violet accent.

## Verification Baseline

For docs-only changes:

```bash
git diff --check
```

For code changes:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

For payment/invite changes, also run a manual production-like smoke test:

1. Create or edit a group with amount and billing day.
2. Create/open group invite link.
3. Register a member through the link.
4. Verify the member has a billing plan and current payment.
5. Confirm the payment as member.
6. Approve it as trainer.
7. Verify next monthly payment is created.
