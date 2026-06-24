# Dependency Audit

Last checked: 2026-06-24

Command:

```powershell
npm.cmd audit --json
```

## Current Result

`npm audit` reports:

- 2 moderate vulnerabilities
- 5 high vulnerabilities
- 0 critical vulnerabilities

## Findings

### `next` -> `postcss`

- Severity: moderate
- Path: direct `next`, transitive bundled `postcss`
- Advisory: `postcss` CSS stringify XSS advisory
- Current package: `next@15.5.19`
- Audit suggestion: downgrade `next` to `9.3.3`

Decision:

Do not apply the suggested fix. It is a major downgrade and would break the current Next.js App Router project. Track for a safe Next.js patch/upgrade path instead.

### `next-pwa` -> `workbox-webpack-plugin` -> `workbox-build` -> `rollup-plugin-terser` -> `serialize-javascript`

- Severity: high
- Path: direct `next-pwa`, transitive Workbox build toolchain
- Advisory: `serialize-javascript` RCE advisory
- Current package: `next-pwa@5.6.0`
- Audit suggestion: downgrade `next-pwa` to `2.0.2`

Decision:

Do not apply the suggested fix. It is a major downgrade and likely breaks the current PWA build. The vulnerable chain is in the service-worker build toolchain, not runtime API code, but it should still be tracked.

## Current Risk Assessment

The current audit output is not ignored, but there is no safe automatic fix.

Do not run:

```powershell
npm audit fix --force
```

That command would force major downgrades suggested by npm audit.

## Follow-Up Options

Preferred future work:

1. Evaluate replacing `next-pwa` with a maintained PWA setup or manual service worker registration.
2. Track Next.js releases for a patched bundled PostCSS path.
3. Re-run audit after every dependency update.
4. Keep production secrets out of build-time logs and client bundles.

## Release Rule

Before release:

- run `npm.cmd audit --json`;
- compare the result with this file;
- update this document if severity, paths or available fixes change.
