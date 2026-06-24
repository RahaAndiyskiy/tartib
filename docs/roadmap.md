# Roadmap

Related docs:

- [current-state.md](./current-state.md)
- [features.md](./features.md)
- [vision.md](./vision.md)

## MVP

Status: mostly implemented and being stabilized.

Scope:

- login/password auth;
- organization creation;
- owner/trainer/member roles;
- groups;
- reusable group invite links;
- member registration through invite;
- team management;
- billing plans;
- current payment requests;
- payment confirmation;
- delay requests;
- automatic reminders;
- internal notifications;
- role dashboards;
- PWA/mobile shell.

Exit criteria:

- core flow works reliably on mobile and desktop;
- no known cross-organization access bugs;
- payment confirmation and next invoice creation are stable;
- documentation reflects production reality;
- basic CI/checks are in place.

## Version 1.0

Goal: make the product trustworthy for real small club usage.

Planned work:

- rotate exposed service-role key;
- add rate limiting for auth and mutation endpoints;
- improve automated core-flow checks;
- polish mobile UX;
- finish Figma-led UI system pass;
- improve error states and empty states;
- add password recovery;
- add production monitoring/performance tracking;
- gradually split `DashboardApp.tsx`.

Potential 1.0 feature:

- Web push notifications, only after in-app notifications and core flow are stable.

## Version 2.0

Goal: expand from payment CRM into operations.

Candidate modules:

- attendance;
- finance/expenses;
- trainer payouts;
- broadcasts/messages;
- richer analytics;
- organization settings;
- member archive/inactive states.

## Future Ideas

- native mobile apps;
- public member portal;
- online payment integrations;
- multi-branch organizations;
- export/import;
- advanced permissions;
- WhatsApp/Telegram notification channels.

## Current Recommendation

Do not add large modules immediately. The next best steps are:

1. finish stabilization and documentation;
2. do focused UI/Figma pass;
3. add rate limiting and security polish;
4. then decide between push notifications and attendance.
