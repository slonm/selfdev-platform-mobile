# selfdev-platform-mobile

Building blocks for personal Android apps (Expo / React Native) that you change by asking an AI
from inside the app, with the result delivered over the air — no reinstall.

- **AI dev console** — a chat screen backed by the app's GitHub repository; Claude Code does the work
  in GitHub Actions, test-first, and the change arrives as a preview update you try before accepting.
- **Over-the-air updates** — preview / accept / undo, automatic rollback of a crashing update.
- **Shared native capabilities** — storage, notifications, secure storage, background tasks.

Each app is its own repository and APK and depends on this package.

Design: [docs/architecture.md](docs/architecture.md) · [docs/dev-console.md](docs/dev-console.md) ·
[docs/decisions.md](docs/decisions.md) · contributing: [CLAUDE.md](CLAUDE.md)

Status: design and scaffolding; no modules implemented yet.
