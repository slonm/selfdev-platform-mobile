# selfdev-platform-mobile — project instructions

A library for personal Expo/React Native apps that can extend themselves: an in-app AI dev console,
over-the-air updates with preview and rollback, and shared native capabilities. Each app built on
it is its own repository and its own APK and depends on this package.

First consumer: `slonm/hrv-polar` (Polar H10 HRV + mood diary).

## Method: test-driven, no exceptions

All production code is written test-first using `.claude/skills/test-driven-development`
(obra/superpowers, MIT). Load it before implementing any feature or fix. Red → watch it fail on an
assertion (not on a missing module) → minimal green → refactor. A test that passes immediately must
be justified or mutation-probed.

## Commands

```bash
npm test            # jest (jest-expo preset)
npm run typecheck   # tsc --noEmit
npm run lint
```

All three gates must be green before a change is done.

## Boundaries

- **Generic only.** Nothing here may know about a particular app (no HRV, no Polar, no diary). If a
  feature is useful to one app only, it belongs in that app. When in doubt, build it in the app
  first and promote it here when a second app needs it.
- **Native capabilities are generic** (run SQL, schedule a notification, secure storage), never
  screen-specific, so apps add features in JS alone.
- **Expo SDK pins** (`expo`, `react`, `react-native`) are peer dependencies and must match the apps.
- Ships TypeScript source (`main: src/index.ts`); the app's Metro bundler compiles it.

## Docs

- [docs/architecture.md](docs/architecture.md) — layers, how an app consumes the platform
- [docs/dev-console.md](docs/dev-console.md) — AI dev console design
- [docs/decisions.md](docs/decisions.md) — decision log

## Gotchas

- TypeScript 6 defaults `types` to `[]`; `tsconfig.json` lists `jest` explicitly.
- `.claude/` is re-included by `.gitignore` (`!.claude/`) because the author's global gitignore
  excludes it; the TDD skill must ship with the repo so cloud Claude Code sessions follow it too.
