# selfdev-platform-mobile

A thin platform for Android apps (Expo / React Native) that their users reshape by asking an AI —
on the device, in seconds, without reinstalling.

- **User layer** — screens, forms, schedules, charts and small scripts stored on the device as
  versioned documents built from the platform's component kit; scripts run in a sandbox.
- **On-device agent** — edits the user layer through validated tools, writes and runs tests before a
  change activates; preview, accept, undo, and automatic safe mode if a version keeps crashing.
- **Any AI provider** — Claude (direct, Microsoft Foundry, Bedrock, Vertex), OpenAI-compatible
  services, or a hosted proxy; the user picks provider and payment.
- **Developer loop** — for platform/app code and native changes: an in-app dev console backed by
  the app's GitHub repository, Claude Code in GitHub Actions, over-the-air updates.

Each app is its own repository and APK and depends on this package. First app: a Polar H10 HRV and
mood diary.

Design: [architecture](docs/architecture.md) · [user layer](docs/user-layer.md) ·
[dev console](docs/dev-console.md) · [decisions](docs/decisions.md) ·
[bootstrap plan](docs/bootstrap.md) · contributing: [CLAUDE.md](CLAUDE.md)

Status: bootstrapping — the platform runs its first app (a mood and HRV diary) locally; device
build in progress. See the bootstrap plan.

## Use in an app

```tsx
import { SelfDevApp } from '@slonm/selfdev-platform-mobile';
import { createExpoServices } from '@slonm/selfdev-platform-mobile/expo';

const services = createExpoServices();
export default () => <SelfDevApp defaultLayer={myLayer} services={services} actions={myActions} appGuide={guide} />;
```

`metro.config.js`: `module.exports = withSelfDevPlatform(getDefaultConfig(__dirname));`
(`require('@slonm/selfdev-platform-mobile/metro')`). Peer dependencies: expo, react, react-native,
expo-sqlite, expo-notifications, expo-secure-store.

## License

[Apache License 2.0](LICENSE). The bundled TDD skill in `.claude/skills/test-driven-development` is
from [obra/superpowers](https://github.com/obra/superpowers) under the MIT license (see its own
LICENSE file).
