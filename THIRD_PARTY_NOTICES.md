# Third-party notices

Local Playbooks application code and its original process-map implementation are MIT.
Dependencies retain their own licenses; “MIT app” does not relicense those components.

- **Capture core:** Screenpipe commit `892199f742e46d0c5d9e8c06687b35ca7c2b6547`,
  Copyright (c) 2024–2026 louis030195, MIT. Complete notice in
  `engine/LICENSE-UPSTREAM.md`. This is a renamed, modified capture-only fork;
  not an upstream Screenpipe product. Legal attribution is intentionally retained.
  `ee/` and the upstream app are excluded. Upstream PII adapters are not enabled
  in the desktop engine build and their workers/weights are not used.
- **OpenAI Privacy Filter:** [source](https://github.com/openai/privacy-filter),
  [weights](https://huggingface.co/openai/privacy-filter), Apache-2.0.
  Weights are downloaded separately during explicit setup, or pre-staged by IT.
- **Transformers.js:** Apache-2.0; its packages include their licenses.
- **node-llama-cpp and llama.cpp:** MIT; package licenses remain in the installer.
- **Default Llama 3.2 weights:** Meta's Llama 3.2 Community License and acceptable-use
  terms, not MIT. They are not embedded in this source archive. Review the model's
  terms when distributing preloaded weights. You may select another compatible model.
- **Electron:** MIT, with Chromium/Node and other third-party notices supplied by Electron.
- **ONNX Runtime:** MIT; the native build copies its license and third-party notices.
- **FFmpeg:** the workflow builds a separate LGPL-2.1-or-later executable without
  `--enable-gpl` or `--enable-nonfree`. The exact source archive, build script, license,
  and configuration accompany release artifacts. Users may replace the executable.
  Do not substitute a GPL/nonfree prebuilt FFmpeg without reviewing its terms.
- Rust and npm transitive libraries have their own licenses. Preserve their notices
  and inspect dependency inventories before publishing a release.

Upstream code names inside the capture fork are compatibility details and legal
provenance. Consumer-facing UI and executable names use Local Playbooks.
