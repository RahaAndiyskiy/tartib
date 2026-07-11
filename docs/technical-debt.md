# Technical Debt

This file records known technical debt in plain language so future AI agents and humans do not rediscover the same decisions.

## Dashboard Shell Decomposition

Status: planned

`src/features/dashboard/components/DashboardShell.tsx` currently owns the full visual dashboard shell: desktop sidebar, mobile topbar, header, bottom/mobile navigation and account menu.

This is acceptable as a transitional `AppShell` / `DashboardLayout` pattern, not a hack. The next cleanup step, after UI direction stabilizes, is to split its internals while keeping the same public component:

- `DashboardShell.tsx`
- `Sidebar.tsx`
- `Header.tsx`
- `MobileTopbar.tsx`
- `BottomNav.tsx`
- `AccountMenu.tsx`

Goal: keep external usage as `<DashboardShell>...</DashboardShell>`, but make the internal pieces easier to redesign from Figma.

Do not split it randomly while the UI is still actively changing. Split it when the structure is stable or when one part needs focused work.

## Web Push Notifications

Status: postponed

External web push notifications are currently hidden from the product UI. The working notification channel for MVP is the in-app notifications modal: payment confirmations, delay requests, overdue/payment events and actions that can be handled immediately.

Why postponed:

- iOS/PWA Service Worker activation behaved inconsistently on real devices.
- The UX became confusing: users could not clearly understand whether push was enabled or stuck.
- The product can still work without external push while the payment cycle is being tested in real clubs.

Current rule:

- Do not show push enable/test buttons in the UI.
- Do not auto-run push setup when the dashboard opens.
- Internal notifications must remain reliable and actionable.

When returning to this:

- Treat push as a separate technical project.
- Add a dedicated diagnostics screen for browser support, permission state, Service Worker state, subscription state and server delivery.
- Only expose the feature after the full flow is verified on the target devices.
