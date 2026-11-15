# playbooks-capture

The capture engine bundled with local-playbooks. It records the screen, reads the text on it,
transcribes audio, and serves the results on a local API (localhost only).

## Where this code comes from

This is a copy of the open-source Screenpipe engine, taken from commit
`892199f742e46d0c5d9e8c06687b35ca7c2b6547` (10 June 2026, engine version 0.4.15). That is the
last commit released under the MIT license; the next commit moved the project to a commercial
license and states that prior MIT releases remain MIT.

- Original MIT license and copyright: [LICENSE-UPSTREAM.md](LICENSE-UPSTREAM.md)
- Not included: the upstream `ee/` folder (enterprise license), the desktop app, docs and SDKs.
- This project is not affiliated with or endorsed by Screenpipe.

## Changes from upstream

- The program is named `playbooks-capture`.
- local-playbooks always starts it with telemetry turned off and never turns on the upstream
  PII model options (those models are licensed for non-commercial use only).

## Build

Built by GitHub Actions (`.github/workflows/engine.yml`) for macOS and Windows.
