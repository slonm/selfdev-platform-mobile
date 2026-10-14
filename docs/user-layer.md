# On-device development: the user layer

Status: accepted 2026-10-14, not implemented.

## Why

The GitHub loop (dev console → Claude Code in Actions → OTA) needs a repository, CI and an EAS
project per app. That suits the platform's developer, not an end user customising their own copy of
an app, and it takes minutes per change. On-device development changes the running app directly,
in seconds, with nothing outside the phone except the model API.

## Three layers, three ways to change them

| Layer | What | Changed by | Delivered |
|---|---|---|---|
| Native core | Expo runtime, native modules, permissions | developer | new APK |
| Platform + app bundle | component kit, capabilities API, agent, app code | developer, GitHub loop | OTA update |
| **User layer** | screens, forms, schedules, charts, prompts, small scripts | **user + on-device agent** | instantly, stored on the device |

## Shape of the user layer

- **Declarative first.** Screens are JSON documents composed from the platform's component kit
  (list, form, slider 0–4, chart, card, chat, reminder…), bound to data via queries. Validated
  against a schema before activation; an invalid document never reaches the renderer.
- **Sandboxed scripts for logic** (derived metrics, custom rules). Run in an isolated interpreter
  with only the capabilities API exposed — no network, no file system, no access to other apps'
  data — and a time/memory limit. Scripts return data or a UI tree; they never touch React directly.
- **Versioned.** Every change is a new version of the user layer: preview, accept, undo, history.
  A crash counter puts the app into safe mode on the last good version.
- **Test-first on the device.** The agent writes tests for scripts (and fixtures for screens) and
  runs them in the sandbox before proposing the change; failing tests block activation.
- **Portable.** The user layer exports/imports as one file; optional backup/sync to the user's
  storage or a Git repository.

## The on-device agent

Claude API tool use inside the app. Tools: read/list/write user-layer documents, validate, run tests,
preview, query the data schema (not the data itself unless the user allows it). Default model
Sonnet 5.5; Haiku 5.5 for small edits. Requests the platform cannot satisfy (new component, new
native capability) become an issue for the developer instead of a hack.

## Model providers

The user chooses provider, model, intermediary and payment; the platform does not lock them in.
Agent code talks to a `ModelProvider` interface (messages + tool use + streaming); adapters:

| Adapter | Covers |
|---|---|
| Anthropic SDK | Claude API, Claude in Microsoft Foundry, Bedrock, Vertex |
| OpenAI-compatible | OpenAI, OpenRouter, many proxies, local servers |
| Platform proxy | the platform author's hosted service with its own billing (offered, never required) |

Keys live in native secure storage. Claude subscription credentials of end users must not be routed
through the app. Tool use is required of a provider; the agent degrades to "explain only" without it.

## Open questions

- Which interpreter isolates scripts (e.g. QuickJS as a native module vs. evaluating in Hermes);
  to be decided by a prototype.
- Store policy: interpreted JS is permitted on Google Play; AI-generated content rules apply to a
  public release.
