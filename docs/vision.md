# Product Vision

Tartib is a simple CRM for small organizations that manage people, groups and recurring payments.

## Audience

The first target niche:

- sports clubs;
- martial arts schools;
- dance studios;
- educational centers.

The architecture should stay generic enough for other small organizations with similar member/payment operations.

## Problems Tartib Solves

- Trainers keep student lists in chats, notes or spreadsheets.
- Payment status is unclear between owner, trainer and student.
- Students forget due dates or need delay handling.
- Owners need simple control without heavy accounting software.
- Trainers need a fast daily tool, not a complicated back office.

## Core Roles

`owner`

- controls the organization;
- manages trainers;
- sees organization-level members and payments.

`trainer`

- manages own groups and assigned students;
- gives invite links;
- assigns and confirms payments.

`member`

- sees own payment, trainer and group;
- confirms payment;
- requests payment delay.

## Main Product Flow

1. Owner creates a club.
2. Owner/trainer creates a group.
3. Trainer gives a group invite link.
4. Student registers through the link.
5. Trainer assigns payment terms/current invoice.
6. Student sees due payment.
7. Student confirms payment or requests delay.
8. Trainer approves/rejects.
9. Owner sees the result in simple control metrics.

## Product Principles

- Keep paths short and obvious.
- Prefer one clear next action over many controls.
- Show each role only what matters to that role.
- Separate payment terms from payment facts.
- Keep the product lighter than accounting software.
- Preserve financial history.
- Make mobile use comfortable because trainers and students will use phones.

## Not In MVP

- attendance;
- chat;
- broadcast announcements;
- full expenses/profit tracking;
- trainer salary calculation;
- analytics;
- public portal;
- multi-branch support;
- native mobile apps.

See the current implementation snapshot in [current-state.md](./current-state.md).
