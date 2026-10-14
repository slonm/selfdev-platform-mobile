# Bootstrap plan

Goal: prove the idea locally end to end — an app whose diary is a user-layer document, changed on
the device by the agent — before publishing anything. Each step is test-first; "done" means the
three gates are green.

| # | Step | Where | Proves |
|---|---|---|---|
| 1 ✅ | User-layer history: versions, preview, accept, undo, safe mode after repeated crashes (`src/user-layer/history.ts`; persistence comes with step 4) | platform, pure TS | changes are reversible |
| 2 ✅ | Document model + validation: screen built from kit components, bound to a collection (`src/user-layer/document.ts`, zod) | platform, pure TS | an invalid change never activates |
| 3 | Renderer: document → React Native (form, slider 0–4, text, list, chart, button) | platform, RN testing library | the kit renders documents |
| 4 | Capabilities API: collections (records), reminders schedule, settings | platform | user layer reads/writes data only through it |
| 5 | Agent: `ModelProvider` interface, tool loop over the user layer, fake provider in tests, Anthropic adapter | platform | agent edits the layer through validated tools |
| 6 | Script sandbox prototype + on-device test runner | platform | logic changes are tested before activation |
| 7 | HRV app shell consuming the platform; diary/questionnaire/reminders as the default user layer; HRV maths as a capability | app | the app is mostly user layer |
| 8 | EAS development build on the phone (Android 16) | app | runs on real hardware |
| 9 | Polar H10 native module (offline RR recording, download) | app | data without manual export |

During steps 1–7 the app consumes the platform from the sibling checkout (local file dependency);
publishing switches it to the public package.
