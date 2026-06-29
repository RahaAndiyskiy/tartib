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
| `people` | done | partial | pending | done | partial | `PeoplePanel`, people selectors and people permissions are in `src/modules/people`; member mutations still live in `DashboardApp.tsx`. |
| `groups` | pending | pending | pending | pending | pending | Groups should become the next full domain after people. |
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
- `src/modules/people/index.ts` exposes the current public people module API.
- `docs/modular-architecture.md` defines the target modular monolith architecture.

## Immediate Next Steps

1. Continue `people` model/selectors:
   - move any remaining people-specific mapping that is still in `DashboardApp.tsx`;
   - keep shared payment/group selectors out until those modules exist.
2. Move `people` actions later:
   - assign member to group;
   - delete member;
   - create trainer/member invite.
3. Start `groups` module only after the current `people` migration state is clear.

## Rule

Do not mark a module as complete when only UI has been extracted.
