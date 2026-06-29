# Module Migration Status

This document prevents "UI-only modularization".

Each module is considered migrated only when all layers are moved:

- UI: visual components and layout for the domain.
- Model/selectors: view data preparation, filtering and domain selectors.
- Actions: mutations and side effects for the domain.
- Permissions: role and access rules for the domain.
- Checks: typecheck/lint/build and, when needed, flow smoke tests.

## Status Legend

- `done` - moved and used from the module/core.
- `partial` - some code moved, but important logic still lives in `DashboardApp.tsx`.
- `pending` - not moved yet.
- `blocked` - needs a product or technical decision first.

## Current Modules

| Module | UI | Model/selectors | Actions | Permissions | Checks | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `people` | done | partial | partial | done | partial | `PeoplePanel`, people selectors, permissions, invite creation, trainer creation, member assignment and member deletion actions are in `src/modules/people`; local member creation with initial payment stays in dashboard orchestration until `groups` and `payments` exist. |
| `groups` | partial | partial | partial | partial | partial | `GroupsPanel`, visible group selectors, draft validation/build, remote save, basic permissions and group deletion are in `src/modules/groups`; local update with payment-default sync still lives in `DashboardApp.tsx`. |
| `payments` | partial | pending | pending | pending | partial | Some row UI is extracted, but payment logic mostly remains in `DashboardApp.tsx`. |
| `notifications` | partial | pending | pending | pending | partial | Modal UI is extracted; notification actions still live around dashboard state. |
| `account` | pending | pending | pending | pending | pending | Account/settings should become a separate module later. |
| `schedule` | pending | pending | pending | pending | pending | Not a full module yet. |
| `expenses` | pending | pending | pending | pending | pending | Postponed from MVP core, but code exists and should be modularized later. |

## Completed Migration Work

- `src/core/roles.ts` owns shared role helpers: `hasRole`, `roleLabel`, `roleLabels`.
- `src/modules/people/components/PeoplePanel.tsx` owns the team list UI.
- `src/modules/people/model/selectors.ts` owns people view selectors and filtering.
- `src/modules/people/permissions.ts` owns people permission helpers.
- `src/modules/people/actions/peopleActions.ts` owns member group assignment and member deletion actions.
- `src/modules/people/actions/peopleActions.ts` also owns remote trainer creation and member invite creation.
- `src/modules/people/index.ts` exposes the current public people module API.
- `src/modules/groups/components/GroupsPanel.tsx` owns the group list UI.
- `src/modules/groups/model/selectors.ts` owns visible group selectors and group maps.
- `src/modules/groups/model/draft.ts` owns group draft validation, payment-default parsing and local group building.
- `src/modules/groups/permissions.ts` owns basic group access helpers.
- `src/modules/groups/actions/groupActions.ts` owns group deletion.
- `src/modules/groups/actions/groupActions.ts` also owns remote group save.
- `docs/modular-architecture.md` defines the target modular monolith architecture.

## Immediate Next Steps

1. Continue `people` model/selectors:
   - move any remaining people-specific mapping that is still in `DashboardApp.tsx`;
   - keep shared payment/group selectors out until those modules exist.
2. Continue `people` actions:
   - local member creation path.
3. Continue `groups` module:
   - extract local group create/update shell where possible;
   - keep payment-default synchronization at the boundary until `payments` owns its part.

## Rule

Do not mark a module as complete when only UI has been extracted.

## Core Growth Rule

Core is not built as a large abstract layer upfront.

Move code into `src/core` only when a rule is shared by more than one module or clearly belongs to the whole product. Current examples:

- roles and role labels live in `src/core/roles.ts`;
- future cross-module permissions may live in `src/core/permissions`;
- future workspace/module orchestration may live in `src/core/workspace` or `src/core/module-registry`.

Do not move domain-specific logic into core just because it is reused once. Prefer the owning module first.

## People Boundary Note

Do not force payment or group ownership into `people`.

People may create a member and connect that member to a group, but group defaults belong to `groups`, and payment plans/invoices belong to `payments`. Until those modules are fully extracted, `DashboardApp.tsx` may temporarily orchestrate the boundary.
