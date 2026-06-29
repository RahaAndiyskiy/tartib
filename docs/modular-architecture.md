# Tartib Modular Architecture

Tartib is moving toward a configurable modular CRM architecture.

The target architecture is a **modular monolith**:

- one application and one deployment;
- clear internal module boundaries;
- a small shared core;
- product modules that can later be enabled, disabled or configured per organization.

This is the right direction because Tartib is expected to become a configurable system for sports clubs, schools, courses and similar organizations. Different organizations may need different roles, modules and workflows, but the product should not become a separate custom codebase for every client.

## Simple Explanation

Do not think in pages first.

Think in product domains:

- people;
- groups;
- payments;
- notifications;
- schedule;
- attendance;
- expenses.

A page may show several domains. For example, the dashboard overview can show payments, people and groups at the same time. Because of that, business logic should not belong to a page just because the page displays it.

Pages should assemble the screen.

Modules should own the domain:

- UI for that domain;
- state preparation for that domain;
- permissions for that domain;
- actions for that domain;
- domain-specific helper functions.

Core should own the shared rules:

- users;
- organizations;
- roles;
- permissions;
- workspace identity;
- cross-module events.

## Target Folder Shape

```txt
src/
  core/
    roles.ts
    permissions/
    organization/
    workspace/

  modules/
    people/
      components/
      model/
      actions/
      permissions.ts
      index.ts

    groups/
      components/
      model/
      actions/
      permissions.ts
      index.ts

    payments/
      components/
      model/
      actions/
      permissions.ts
      index.ts

  features/
    dashboard/
      DashboardApp.tsx
      dashboard-only helpers and shell UI

  shared/
    ui/
    lib/
    types/
    constants/
```

## Boundary Rules

`core/`

Contains rules that are true for the whole product. Modules may import from core. Core must not import from modules or dashboard.

`modules/`

Contains product domains. A module can import from `core` and `shared`. Avoid importing from `features/dashboard`. If a module needs something from dashboard, it probably belongs in `core`, `shared` or inside the module itself.

`features/dashboard/`

Should become a shell that assembles modules into the CRM screen. It may keep dashboard-only navigation and layout state, but should not own people, groups or payments business logic long-term.

`shared/`

Contains generic UI, types and infrastructure helpers. Shared code must not know product workflows.

## Current Migration Strategy

Do not rewrite the application in one large pass.

Move one meaningful boundary at a time:

1. Extract UI from `DashboardApp.tsx`.
2. Move extracted UI into the correct module.
3. Move shared role/permission helpers into `core`.
4. Move domain-specific view preparation into module hooks.
5. Move domain-specific mutations into module actions.
6. Add a module registry when modules become configurable.

## Current First Steps

- `src/core/roles.ts` owns role checks and role labels.
- `src/modules/people/components/PeoplePanel.tsx` owns the team list UI.
- `src/features/dashboard/DashboardApp.tsx` still owns most state and remote mutations, but now consumes `PeoplePanel` as a module component.

## Future Module Registry

Later Tartib should support a module registry:

```ts
const enabledModules = ['people', 'groups', 'payments', 'notifications'];
```

Eventually this should come from organization configuration:

```txt
Organization
  enabled modules
  custom roles
  role permissions
  workflow settings
```

That is the foundation for the future constructor idea.
