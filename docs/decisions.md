# Decisions

Newest last. Each entry: context → decision → consequences. App-specific decisions (Polar SDK,
HRV method) live in the app's repository.

## 2026-10-14 — Over-the-air UI, not reinstall-per-change

**Context.** An app must be changeable from a prompt without installing a new APK.
**Decision.** Thin native shell + JS delivered over the air.
**Consequences.** Native capability must be planned ahead; capabilities are generic.

## 2026-10-14 — React Native + Expo over WebView (Capacitor) and Flutter

**Context.** WebView UI feels non-native (scrolling, keyboard, gestures); Flutter's code push
(Shorebird) is a third-party commercial service; JSON-driven UI would limit what AI can build.
**Decision.** React Native + Expo (SDK 57), expo-updates for OTA with rollback; cloud builds on EAS.
**Consequences.** TypeScript throughout; native views; Expo continuous native generation — never
edit `android/` by hand, configure through `app.json` and config plugins.

## 2026-10-14 — AI: dev agent in CI, analysis via API key

**Context.** The user has a Claude subscription. Anthropic's terms do not permit subscription OAuth
tokens inside third-party apps; `claude-code-action` documents `CLAUDE_CODE_OAUTH_TOKEN` for Pro/Max,
while the legal page limits subscription OAuth to "ordinary use of Claude Code".
**Decision.** Code changes are made by Claude Code in GitHub Actions, never by an agent loop on the
phone. In-app analysis uses a Claude API key in native secure storage.
**Consequences.** Auth for the Action (subscription token vs API key) is an open choice per app.
Model defaults: Sonnet 5.5 for code, Opus 5.5 on request, Haiku 5.5 for in-app chat.

## 2026-10-14 — Platform split from the first app

**Context.** The self-extension machinery (console, OTA, CI) is independent of the HRV diary and
should serve future apps.
**Decision.** Two repositories: `selfdev-platform-mobile` (library) and one repository per app. Each app is
its own APK and depends on a pinned platform version. Not a single host APK with mini-apps: loading
several JS bundles into one React Native runtime is non-standard and fragile.
**Consequences.** A platform change is its own PR and release, then a dependency bump in the app.
Platform-specific knowledge lives here; app knowledge in the app.

## 2026-10-14 — On-device development and end-user customisation

**Context.** Development must also happen directly on the device, and the platform may later serve
other people who customise their own apps; the GitHub loop does not scale to them.
**Decision.** Accepted (user). Add a third layer — the user layer: declarative screens from a component
kit plus sandboxed scripts, versioned on the device, edited by an on-device agent with tests run in
the sandbox. The GitHub loop remains for the platform/app code and native changes.
**Consequences.** The component kit and capabilities API become the platform's main product and
public contract. See [user-layer.md](user-layer.md).

## 2026-10-14 — Thin platform, everything possible in the user layer

**Decision.** Accepted (user). The platform stays as thin as possible: runtime for the user layer,
component kit, capabilities API, agent, versioning. App features — including the HRV diary,
reminders and charts of the first app — are built as user-layer documents and scripts. Only what
cannot be expressed there (native modules such as Polar BLE, heavy maths if the sandbox is too slow)
lives in app code, exposed to the user layer as a capability.

## 2026-10-14 — Provider-neutral AI

**Decision.** Users choose AI provider, model, intermediary and payment: own key with any supported
provider, or the platform author's proxy. A `ModelProvider` interface with adapters (Anthropic SDK
incl. Microsoft Foundry/Bedrock/Vertex; OpenAI-compatible; platform proxy). See
[user-layer.md](user-layer.md#model-providers).

## 2026-10-14 — Naming and publication

`selfdev-platform-mobile` (a web counterpart will be `selfdev-platform-web`). Public repository.
Nothing is pushed until the idea is bootstrapped locally.
