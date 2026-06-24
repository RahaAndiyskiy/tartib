# Tartib Design System

This document is the UI source of truth for Figma and code.

Use it together with:

- [ui-style.md](./ui-style.md)
- [rules.md](./rules.md)
- [architecture.md](./architecture.md)

## Goal

Tartib UI must be easy to restyle without rewriting screens.

The system is organized in three layers:

1. **Tokens** in `src/app/globals.css`.
2. **Primitives** in `src/shared/ui`.
3. **Product widgets** inside feature modules, currently mostly `src/features/dashboard`.

When the Figma design changes, update tokens and primitives first. Avoid styling each page separately.

## Visual Direction

Current direction:

- clean CRM foundation;
- soft violet glass accents;
- high readability for payments, members and schedules;
- no green as a brand accent;
- mobile-first task flow, desktop CRM layout.

Glass is an accent, not the whole product. Dense financial rows and long lists must remain plain and readable.

## Tokens

Global tokens live in `src/app/globals.css` under `:root`.

Core token groups:

- color: `--color-*`
- radius: `--radius-*`
- shadows: `--shadow-*`
- spacing: `--space-*`
- typography: `--font-size-*`, `--font-weight-control`
- motion: `--duration-*`, `--ease-ui`
- focus: `--focus-ring`

New shared visual values must become tokens before they are reused.

## Primitives

Shared React primitives live in `src/shared/ui`.

Available primitives:

- `Button`
- `Panel`
- `TextField`
- `SelectField`
- `Badge`
- `EmptyState`
- `SegmentedControl`

Use these primitives for new UI. Existing dashboard areas can be migrated gradually when touched.

The current dashboard still contains legacy class-based markup. This is intentional for now: migrate it workflow by workflow, not through one large rewrite.

## Button Rules

Use `Button` variants:

- `primary`: main action on the screen or card;
- `secondary`: normal secondary action;
- `soft`: low-emphasis positive or navigation action;
- `ghost`: neutral utility action;
- `danger`: destructive action;
- `text`: inline action.

Button copy should be short: usually one or two words.

When two actions are stacked vertically, primary action goes first, secondary/danger below it.

## Panel Rules

Use `Panel` or `crm-panel` for a single logical surface.

Do not nest cards inside cards unless the inner element is a repeated item, modal content, or compact tool.

Panel headings:

- use short nouns;
- description is optional;
- avoid instructional paragraphs inside operational screens.

## Form Rules

Use `TextField` and `SelectField` for new forms.

Labels must describe the data, not the action.

Optional fields use the shared optional label.

Fields should not be narrower than their content on mobile.

## Badge Rules

Use `Badge` or `status-pill` for statuses.

Status colors:

- active/info: blue-violet;
- paid: violet/indigo;
- warning/confirmation: amber;
- overdue/danger: red;
- delayed: purple.

Do not introduce green status pills.

## Empty State Rules

An empty state should answer:

- what is empty;
- why it matters, if needed;
- one next action, if obvious.

Avoid generic "no data" text.

## Product Widgets

Product widgets are not generic primitives.

Examples:

- `PaymentCard`
- `MemberCard`
- `GroupCard`
- `NotificationItem`
- `DashboardMetric`
- `AttentionPanel`

They should be extracted from `DashboardApp.tsx` gradually, one workflow at a time.

## Figma Mapping

Recommended Figma component names:

- `Button / Primary`
- `Button / Secondary`
- `Button / Soft`
- `Button / Ghost`
- `Button / Danger`
- `Field / Text`
- `Field / Select`
- `Panel / Default`
- `Badge / Status`
- `EmptyState / Action`
- `SegmentedControl / Default`
- `MetricCard / Default`
- `BottomNav / Mobile`

Figma variables should mirror CSS token names as closely as possible.

## Migration Rule

Do not pause feature work to rewrite the whole dashboard.

When touching an area:

1. replace repeated local markup with a primitive;
2. keep behavior unchanged;
3. run typecheck and build;
4. update this document if a new primitive or widget pattern appears.
