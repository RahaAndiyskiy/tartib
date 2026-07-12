# Release Checklist

Use this checklist before production deploys and after important core changes.

## 1. Code State

- `git status --short` is clean before starting release checks.
- All intended changes are committed.
- No generated build artifacts are staged.
- No secrets are committed.

## 2. Environment

Required production env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Owner registration:

- `NEXT_PUBLIC_OWNER_REGISTRATION_ENABLED=false`
- `TARTIB_OWNER_REGISTRATION_ENABLED=false`
- `TARTIB_OWNER_REGISTRATION_SECRET` is set only if setup automation needs it.

Push notifications:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Debug flags:

- `NEXT_PUBLIC_DEBUG_PERFORMANCE=false`
- `TARTIB_DEBUG_PERFORMANCE=false`

## 3. Database

- New schema changes have a new migration in `supabase/migrations`.
- Production migration was applied successfully.
- Old applied migrations were not edited.
- `docs/database.md` is updated if schema changed.

## 4. Local Verification

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

For core flow changes, also run:

```powershell
node scripts/verify-production-flow.mjs
```

## 5. Dependency Audit

Run:

```powershell
npm.cmd audit --json
```

Compare result with [dependency-audit.md](./dependency-audit.md).

Do not run `npm audit fix --force` without a separate compatibility review.

## 6. Production Smoke Check

After deploy:

- `/api/health` returns `ok: true`.
- `/login` opens.
- login works with an existing account.
- `/dashboard` opens after login.
- mobile PWA opens after closing/reopening.
- bottom navigation works.
- notifications modal opens from the top notification button.
- external push buttons are not visible in MVP UI.

## 7. Product Flow Smoke Check

Check the core happy path:

1. Trainer creates or opens a group.
2. Trainer copies group invite link.
3. Member registers through invite link.
4. Trainer sees member in the group.
5. Trainer assigns payment.
6. Member sees payment.
7. Member requests delay or submits payment.
8. Trainer approves/rejects.
9. Owner/trainer sees updated payment state.

## 8. Rollback Notes

Before risky releases:

- note the previous commit hash;
- confirm latest working Vercel deployment;
- confirm whether a DB migration is reversible or forward-only.

If a release fails only in UI:

- rollback Vercel deployment.

If a release fails after a DB migration:

- do not manually edit data first;
- inspect migration impact;
- write a forward-fix migration when possible.
