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

## Document format (schemaVersion 1)

Defined in `src/user-layer/document.ts` (zod schema, also the source of the JSON Schema the agent
will receive).

```
{ schemaVersion: 1,
  collections: { <name>: { fields: { <field>: { type: number | text, label?, unit?,
                                              valueLabels?: { "<int>": text } /* number only */ } } } },
  screens:     { <id>: { title, body: [ node… ] } },
  tabs:        [ { screen, title } ],           // at least one
  reminders?:  [ { id, time: "HH:MM", title, body?,          // daily, ids unique
                   skipIfRecorded?: { collection, withinHours } } ],  // 0 < hours <= 24
  scripts?:    { <name>: { source, tests: [ { name, input, expect } ] } },    // ≥ 1 test each
  onOpen?:     [ "<app action>" ] }   // run quietly at launch and on each return to the foreground

onOpen actions get the data store like any action; their messages are dropped and failures only
logged, so they suit background chores such as logging the weather. The shell learns about the
foreground through `PlatformServices.onForeground` (AppState in the Expo services).

A reminder with skipIfRecorded is left out on a day when `collection` already got a record within
`withinHours` before it (the diary reminder after the diary is filled in). Android cannot drop one
day of a repeating notification, so such a reminder is scheduled as one notification per day for
the next 14 days (`PLAN_DAYS`), re-planned at launch and whenever that collection changes; an app
left closed for longer stops reminding until it is opened.

A collection with "compute": "<script>" is derived, read-only: main({ collections }) receives every
stored collection as [{ createdAt, values }] and returns records of the same shape, restricted to
the declared fields. Scripts are ES5 and run in JS-Interpreter (no host access, step limit). Their
tests run before a proposal may preview; a broken result at runtime empties only that collection.
```

| Node | Purpose |
|---|---|
| `text` | static text |
| `form` | adds a record to `collection`; optional `action` runs an app action right after saving (one button answers and acts), `requireAll` keeps the button unavailable until every scale is answered; inputs: `scale` (number field, integer `min` < `max`, optional end labels), `textInput` (text field, optional `multiline`) |
| `list` | records of `collection`, newest first, showing `fields`; optional `limit` keeps only that many newest (1 makes a status line); an empty list draws nothing |
| `chart` | number `series` of `collection` against record time |
| `button` | `navigate` to a screen |

While an action runs (an `action` node, or a `form` with `action`), a spinner and the shell's
`running` string stand under its button; then its message or error replaces them. The outcome is
kept per node for as long as the layer is shown, so switching tabs mid-run does not lose it.

Objects are strict: an unknown property (a typo such as `remniders`) is an error pointing at that
property, never silently dropped. Validation reports every error with its JSON path; references (tabs/buttons → screens,
form/list/chart → collections, inputs/columns/series → fields of the right type) are checked after
the structure. The kit grows by adding node types here, test-first.

## The on-device agent

A tool-use loop inside the app (`src/agent/loop.ts`) over a provider-neutral conversation model.
Implemented tools (`src/agent/layer-tools.ts`):

| Tool | Does |
|---|---|
| `read_layer` | the layer currently shown (incl. a pending preview) as JSON |
| `propose_layer` | validates a complete new layer; errors come back with JSON paths, success opens a preview — only the user accepts |
| `describe_data` | per collection: record count and last save time; never values |

The layer format's JSON Schema (from the zod schema) is the input schema of `propose_layer`, so the
model sees the format up front. The default system prompt (`src/agent/system-prompt.ts`) is extended
by each app's guide. Planned: script tools and an on-device test runner (bootstrap step 6). Default
model Sonnet 5.5; Haiku 5.5 for small edits. Requests the platform cannot satisfy (new component,
new native capability) are answered plainly instead of worked around.

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

## Default layer updates

An app update may ship a new default layer. On launch the shell compares it with the default seen
last time (`default-layer` in the key-value table) and applies `adoptDefaultLayer`: an untouched
layer switches to the new default (undo leads back), a changed one gets it as a preview.
