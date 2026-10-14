# Bootstrap plan

Goal: prove the idea locally end to end — an app whose diary is a user-layer document, changed on
the device by the agent — before publishing anything. Each step is test-first; "done" means the
three gates are green.

| # | Step | Where | Proves |
|---|---|---|---|
| 1 ✅ | User-layer history: versions, preview, accept, undo, safe mode after repeated crashes (`src/user-layer/history.ts`; persistence comes with step 4) | platform, pure TS | changes are reversible |
| 2 ✅ | Document model + validation: screen built from kit components, bound to a collection (`src/user-layer/document.ts`, zod) | platform, pure TS | an invalid change never activates |
| 3 ✅ | Renderer: document → React Native (form, scale, text input, text, list, chart, button; tabs + screen stack) over a `DataStore` (in-memory now) — `src/renderer/LayerView.tsx`, `src/data/` | platform, RN testing library | the kit renders documents |
| 4 ✅ | Capabilities: SQLite record store + key-value (`src/data/sql-store.ts`, tested on real SQLite via `node:sqlite`), daily reminders in the layer + `syncReminders` over a `Notifier` port (`src/capabilities/reminders.ts`). Device adapters (expo-sqlite, expo-notifications) are wired in step 7 | platform | user layer reads/writes data only through it |
| 5 ✅ | Agent: provider-neutral model (`src/agent/provider.ts`), tool loop (`loop.ts`), layer tools read_layer / propose_layer / describe_data (`layer-tools.ts`), Anthropic SDK adapter usable with `Anthropic` or `AnthropicFoundry` clients (`anthropic.ts`), default system prompt + app guide (`system-prompt.ts`) | platform | agent edits the layer through validated tools |
| 6 ✅ | Script sandbox: JS-Interpreter (ES5, step-limited, no host access) chosen over QuickJS-asm.js (5 MB) after a Node measurement (48 vs 74 ms on a 365-record script; device measurement in step 8) — `src/scripts/sandbox.ts`; script tests run by `checkScripts` before a proposal can preview; computed collections (`compute`) via `withComputed` | platform | logic changes are tested before activation |
| 7a ✅ | `action` nodes: app-provided capabilities run by name, validated against the app's list (`src/capabilities/actions.ts`) | platform | apps extend the kit without platform changes |
| 7b ✅ | `SelfDevApp` shell: restore history (`restoreHistory`), launch tracking, reminder sync, preview banner, agent chat and AI settings; Expo services (`src/shell/`) | platform | a whole app is one component plus a layer |
| 7c ✅ | HRV app on the platform: diary/questionnaire/reminders as the default user layer, phase flags as a computed collection, Polar import as an action; Android bundle exports locally | app | the app is mostly user layer |
| 8 | EAS build on the phone (Android 16): first APK = platform + app as is; measure the sandbox on Hermes; verify SQLite, notifications, secure store, Claude/Foundry from React Native | app | runs on real hardware |
| 9 | Second APK, batching the native changes: Polar H10 module (offline RR recording, download) and expo-updates for over-the-air delivery | app | data without manual export; JS updates without reinstall |

During steps 1–7 the app consumes the platform from the sibling checkout (local file dependency);
publishing switches it to the public package.
