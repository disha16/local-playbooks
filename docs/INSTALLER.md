# Installer and first-run setup

Status: implemented source, lightweight tests passed. Native builds, real model
downloads, and clean-machine execution have not been run in this session. These
are unsigned test builds; do not describe them as a production release yet.

## Build the installers

1. Use the updated code on the installer branch or merge its pull request.
2. In GitHub Actions, select **Build desktop installers** (`release.yml`).
3. Choose the updated branch and select **Run workflow**. This starts a lengthy
   native build; it was deliberately not started here.
4. The workflow builds the recorder and model-setup helper from the same commit,
   bundles the native runtime libraries, builds pinned LGPL FFmpeg, and packages
   Electron, JavaScript dependencies, and the desktop setup screen together.
5. Download `installer-win32-x64` for Windows, or `installer-darwin-arm64` for Apple
   Silicon Macs. Extract the artifact ZIP and use the EXE/DMG inside.

No release is published automatically. Windows ARM, Intel Macs, signing, and
notarization are outside this installer build's current support.

The old command-line Inno Setup file is retained for compatibility, but the new
workflow uses `electron-builder.yml` and `installer/desktop.nsh`.

## What a new user does

1. Run the Windows EXE, or drag the Mac app from the DMG to Applications, then open it.
2. Read the computer checks. Resolve missing files, blocked storage, or low disk space.
3. Select **Download models and finish setup** and confirm the several-GB download.
   Keep **Also prepare audio transcription** enabled to prepare all audio models.
   Downloads use local caches; retry reuses complete cached files and rechecks them.
4. Use the permission-settings buttons. The OS or computer owner must allow recording.
5. Select **Start recording** when ready. Audio remains opt-in. Stop and create a report.

Setup never starts the recorder. It performs tiny tests of Privacy Filter and the
summary model; the separate audio helper downloads/checks audio assets without
opening microphones, loopback audio, or screens. Removing files after setup may
require running setup again.

The app needs no separately installed Node, Rust, Python, Screenpipe, Ollama,
FFmpeg, or ONNX Runtime on the user's computer. All executable runtime components
are bundled; AI model files are prepared on first launch.

## Test on a library/shared computer

Ask library staff before installing or recording. A per-user installer can still
be blocked by the library's software policy, network filter, or recording settings.
There is no automatic bypass.

1. Use synthetic patient/claim names and numbers, never real records or another patron's work.
2. Open the app and verify recording is **Stopped** throughout model setup.
3. Deny microphone access once. Confirm recording without audio still works, and
   the app gives a clear error if audio is requested.
4. Record your own sample pages for two minutes. Stop. Generate a summary, playbook,
   and process map. Check the output and name/identifier masking.
5. Close the app and confirm its recorder exits. Reopen; it should remain stopped.
6. Before leaving, select **Remove this app's local data** and confirm. This removes
   this desktop app's local recordings, reports, model caches, and setup state.
   Delete any exported copies separately. Uninstall through the OS if staff require it.

Deleting files is ordinary file deletion, not a forensic secure-erase promise.
The app does not delete older CLI data or change the computer's security settings.

## Local data and offline deployment

Everything created by the desktop setup flow lives under:

- Windows: `%APPDATA%/LocalPlaybooks/local-data`
- macOS: `~/Library/Application Support/LocalPlaybooks/local-data`

Subfolders contain recordings (`capture`), reports, summary models, Privacy Filter,
audio models, and the Hugging Face speech cache. Setup readiness is `setup.json`.
The legacy CLI continues to use its existing folders.

IT can prepare one approved machine, copy the model/cache folders to the same app
location on another machine, and re-run setup to validate cached files. Copying
`setup.json` alone does not install models. Verify the actual app offline using
sample recording and all report types before an on-prem rollout. Additional native
framework/library assets may be platform-specific.

## Validation performed

The existing repository tests and new setup tests run without AI downloads. The
setup tests cover failure/retry, shared concurrent setup, optional audio, corrupt
state, required executables, writable storage, platform checks, and free space.
Desktop capture tests use a fake authenticated child process. JavaScript syntax,
workflow YAML, and installer configuration are checked separately.

Still required: compile the Rust helper/engine, run Electron, download real models,
install on fresh Windows/Mac machines, verify permissions and cleanup, inspect
native dependency notices, and test the exact signed release binaries.
