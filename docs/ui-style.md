# Tartib UI Style Guide

Tartib uses a **clean CRM base with a soft violet glass layer**.

The product must feel modern, calm and operational. It should not feel like a decorative landing page, a finance spreadsheet, or a futuristic concept mockup.

For reusable UI primitives, Figma mapping and migration rules, read [design-system.md](./design-system.md).

## Product Feel

- Clean CRM first: readable tables, lists, forms and statuses.
- Soft violet glass second: modern navigation, toolbars, modal surfaces and quick actions.
- Light, quiet and spacious, but not empty.
- Financial and member data must stay high contrast and easy to scan.
- Mobile UI must prioritize one task per screen.
- Green is not a Tartib brand accent. Do not add new green buttons, navigation states or primary highlights.

## Design Tokens

Global tokens live in `src/app/globals.css` under `:root`.

Use tokens instead of hard-coded values when adding shared UI:

- `--color-bg`
- `--color-bg-soft`
- `--color-surface`
- `--color-surface-soft`
- `--color-surface-glass`
- `--color-surface-glass-strong`
- `--color-glass-dark`
- `--color-border`
- `--color-border-strong`
- `--color-text`
- `--color-muted`
- `--color-muted-strong`
- `--color-primary`
- `--color-primary-strong`
- `--color-primary-soft`
- `--color-primary-faint`
- `--color-danger`
- `--color-danger-soft`
- `--color-warning`
- `--color-warning-soft`
- `--color-info`
- `--color-info-soft`
- `--radius-page`
- `--radius-panel`
- `--radius-control`
- `--radius-compact`
- `--shadow-soft`
- `--shadow-panel`
- `--shadow-glass`
- `--blur-glass`
- `--sidebar-width`
- `--control-height`
- `--mobile-nav-height`

## Glass Rules

Use glass for:

- Desktop sidebar.
- Mobile bottom navigation.
- Mobile topbar.
- Search and filter toolbars.
- Segmented controls.
- Dropdown-like control groups.
- Modals and invite surfaces.
- Small quick-action areas.

Do not use glass for:

- Dense payment rows.
- Long member lists.
- Financial totals that require exact scanning.
- Tables with many columns.
- Danger actions.
- Status pills where contrast matters.
- Nested cards inside cards.

## Color Rules

- Primary accent: violet/purple via `--color-primary`.
- Secondary system colors may use blue, amber and red for informational, warning and danger states.
- Avoid green as an accent. Paid status can use violet/indigo instead of green.
- Do not create one-off color palettes inside components.
- New shared colors must be added as tokens first.

## Layout Rules

- Desktop uses a left CRM sidebar and a central work area.
- Mobile uses a bottom navigation bar.
- Main work content should use `crm-panel`, list rows and compact forms.
- Avoid landing-page composition inside the dashboard.
- Avoid oversized hero typography inside CRM screens.
- Do not use decorative blobs or one-note gradient backgrounds.

## Components

Prefer shared primitives from `src/shared/ui` for new UI:

- `Button`
- `Panel`
- `TextField`
- `SelectField`
- `Badge`
- `EmptyState`
- `SegmentedControl`

Existing screens may still use compatible classes:

- `crm-shell`
- `crm-sidebar`
- `crm-main`
- `crm-header`
- `crm-panel`
- `crm-panel-header`
- `crm-table`
- `crm-table-row`
- `crm-list-row`
- `primary-button`
- `ghost-button`
- `small-button`
- `segmented-control`
- `status-pill`

When creating new shared UI, follow the same naming style and token usage.

## Payments UI

Payments are the most sensitive UX area.

- Keep the registry readable.
- Use glass only for filters/search/action bars.
- Keep rows plain and high contrast.
- Keep history collapsed by default.
- Keep member view minimal: current payment, due date, status, history and allowed actions.

## People and Groups UI

- People should behave like a CRM table on desktop and cards on mobile.
- Group assignment should be visible and editable for owner/trainer.
- Destructive actions must stay visually secondary but clear.
- Group invite link creation should be a simple action tied to a selected group.

## AI Agent Rules

All AI agents must:

- Read this file before large UI work.
- Reuse existing classes before adding new ones.
- Use tokens from `src/app/globals.css`.
- Keep glass as an accent layer.
- Preserve role visibility for owner, trainer and member.
- Run `npm.cmd run typecheck` and `npm.cmd run build` after UI changes.
