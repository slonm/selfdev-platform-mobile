# Architecture

## Two kinds of repository

```
slonm/selfdev-platform-mobile  (this repo, a library)
  ├ dev console UI + GitHub client
  ├ update manager (preview / accept / undo) over expo-updates
  ├ generic native capabilities (config plugin + modules)
  └ reusable CI: Claude Code workflow, OTA publish workflow
             ▲ npm dependency, pinned version
slonm/hrv-polar  (an app)          future app
  ├ own screens, logic, native       ├ ...
  │ modules (e.g. Polar BLE)         │
  ├ own CLAUDE.md, skills            │
  └ own APK, own update channel      └ own APK
```

An app owns everything specific to it, including its own native modules. The platform owns what
every app needs to be self-extending.

## Inside one installed app

```
┌──────────────── APK (rarely rebuilt) ────────────────┐
│ React Native runtime                                 │
│ platform native capabilities + app native modules    │
│ expo-updates (OTA client, rollback on crash)         │
└──────────────────────────────────────────────────────┘
                 ▲ one JS bundle, replaced over the air
┌──────────────── TypeScript ──────────────────────────┐
│ platform: dev console, update manager                │
│ app: screens, logic                                  │
└──────────────────────────────────────────────────────┘
```

Anything needing new native code or a new permission requires a new APK of that app. Platform
native capabilities are therefore generic and added ahead of need.

## Changing the platform from an app

The dev console of an app works on the app's repository. A request that needs a platform change
is answered with a platform issue (link back); after the platform release, the app bumps its
dependency. Platform JS changes still reach the phone over the air via the app's next update;
platform native changes need an app APK rebuild.

## On-device development

Besides the GitHub loop, a third layer — the **user layer** (declarative screens + sandboxed
scripts, versioned on the device) — is changed directly on the phone by an on-device agent. It is
also how other people would customise apps built on the platform. See [user-layer.md](user-layer.md).

## Status

| Part | State |
|---|---|
| Package scaffold, tests, lint | done |
| Dev console | designed ([dev-console.md](dev-console.md)) |
| Update manager, native capabilities, reusable CI | not started |
