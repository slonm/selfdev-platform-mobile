# In-app AI dev console (proposed)

Status: proposed 2026-10-14, not implemented.

## Idea

The console is a platform screen inside each app whose backend is **that app's GitHub repository**,
not a model endpoint. Claude Code does the work in GitHub Actions (`anthropics/claude-code-action`),
so the agent that edits the app from the phone is the same harness, CLAUDE.md and skills used on the
desktop — and it can run the test suite, which an agent loop inside the phone cannot. The platform
ships the screen, the GitHub client and a reusable workflow; each app supplies its repository,
CLAUDE.md and app-specific skills.

```
app: Dev tab ──GitHub API──▶ issue "@claude <request>"  (conversation = issue comments)
                                  │
                                  ▼
            GitHub Actions: claude-code-action
              reads CLAUDE.md, follows .claude/skills/test-driven-development
              edits TS on a branch, runs npm test / typecheck / lint
                                  │
                                  ▼
            CI: eas update --branch pr-<n>   (preview channel)
                                  │
app: "Try"  ── loads the preview update; "Accept" ── merges PR ──▶ production update
     "Undo" ── reverts the last merge; a crashing update rolls back by itself (expo-updates)
```

## Rules for the agent (system prompt appended in the workflow)

- Only TypeScript/JS and assets change over the air. If a request needs a new native module,
  permission or config plugin, say so and stop: it needs a new APK.
- Test-first via the TDD skill; all three gates green before pushing.
- Never read or request personal data; the repository contains none.
- Replies to the user in Russian; code, comments, commits in English.
- One request = one small, reviewable change, with a line on how to check it in the app.

## Skills (in `.claude/skills/`, shared with desktop sessions)

| Skill | Purpose | When |
|---|---|---|
| test-driven-development | red-green-refactor | installed |
| ota-boundary | decide whether a change is OTA-safe or needs an APK rebuild | with the OTA pipeline |
| diary-schema | how questionnaire items are defined and migrated | with the diary |
| ui-conventions | screens, charts, colours, Russian copy | with the first screens |
| release-notes | user-facing "what changed" shown after an update | with the OTA pipeline |

## Models and auth

- Dev agent: `claude-sonnet-5-5` by default; a request can opt into `claude-opus-5-5` for hard changes.
- In-app analysis chat (diary + HRV): `claude-haiku-5-5`; Sonnet for a weekly deep report.
- Auth for the Action: the documented `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or an API key.
  Anthropic's legal page limits subscription OAuth to "ordinary use of Claude Code"; whether an
  Action in a personal repo qualifies is not stated — re-check before relying on it.
- The phone holds a fine-grained GitHub token limited to this repository (issues, pull requests,
  contents read) in secure storage.
