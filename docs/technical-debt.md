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
