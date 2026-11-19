# local-playbooks

Turn your screen history into **summaries** and **step-by-step playbooks**, with AI that runs on your own machine.

A built-in recorder captures your screen and audio and reads the text locally. `local-playbooks` reads that history and writes:

- **Summary:** what you worked on, main tasks, and open items.
- **Playbook:** reusable step-by-step guides for workflows you repeated, with decision points and slow spots. Useful for training new teammates.
- **Process map:** which step follows which, common paths, time per step, slow spots and rework.

Capture and AI inference run locally. First-run setup downloads model files;
selecting a remote AI endpoint sends redacted activity to that endpoint.

## How it works

```
Capture engine (screen text + transcription, local)
      │  localhost:3030
      ▼
local-playbooks
  1. Condense   – drops repeated screen text, groups by app/window
  2. Redact     – names and addresses (local model), then emails, phones, SSNs, dates, record/member IDs
  3. Summarize  – built-in model (default) or your own server
      ▼
~/LocalPlaybooks/2026-11-14-09-00-summary.md
```

### Two AI levels

| | Built-in (default) | Your own server |
|---|---|---|
| Setup | None. Downloads a ~2 GB model on first run | Point at any OpenAI-compatible URL |
| Runs on | Your laptop (Mac, Windows, Linux) | e.g. a GPU server with vLLM, or Azure/AWS in your own account |
| Good for | Quick summaries | Long, detailed playbooks |

The built-in model runs through [llama.cpp](https://github.com/ggml-org/llama.cpp) inside the app ([node-llama-cpp](https://github.com/withcatai/node-llama-cpp)), so you don't need to install Ollama or run a separate server. It uses Metal on Macs and CUDA/Vulkan on Windows and Linux when available.

## Desktop installation

The new installer/setup flow is source code awaiting its first native build and
clean-machine test. No new signed installer or release has been published yet.

Once built, users need only the Windows x64 EXE or Apple Silicon Mac DMG:

1. Install and open **Local Playbooks**.
2. Select **Download models and finish setup**. Setup checks local storage, downloads
   Privacy Filter and the summary model, and can prepare audio models too. It does
   not record the screen or microphone.
3. Allow screen/accessibility/microphone access using the settings buttons as needed.
4. Select **Start recording**, do a short sample task, then **Stop**.
5. Choose Summary, Playbook, or Process map and select **Create report**.

Node.js, Rust, Screenpipe, Ollama, FFmpeg, and terminal commands are not required
on the user's computer. The app and capture tools are bundled. Local models need
a one-time download of several GB, or IT can pre-stage them.

Windows installs for the signed-in user without requesting administrator access.
Managed computers can still block installation or recording; the app cannot bypass
those rules. On library/shared computers, get permission from staff and use sample
data. After testing, **Remove this app's local data** deletes the desktop app's
recordings, reports, downloaded models, and setup state after confirmation. It does
not delete copies saved elsewhere or old command-line files.

[Installer build and test steps](docs/INSTALLER.md). Builds run only when requested
manually, to avoid starting lengthy builds when source is pushed. The existing CLI
commands below remain available for developers.

## Use

```bash
local-playbooks summary                    # last 2 hours
local-playbooks summary --since 1d
local-playbooks playbook --from "2026-11-14 09:00" --to "2026-11-14 12:00"
local-playbooks playbook --app "Google Chrome" --since 4h
local-playbooks summary --redact "Jane Doe,Mercy Clinic"   # hide extra words
```

Notes are printed and saved to `~/LocalPlaybooks/`.

### Process map

```bash
local-playbooks map --since 1d              # one step per app
local-playbooks map --since 1d --by window  # one step per app window (titles are redacted)
```

Shows which step follows which, the common paths and how often each happens, time per step, slow spots and rework, with a flow diagram. It needs no AI model. Built from published process-mining papers (directly-follows graph, Heuristics Miner); no third-party process-mining code is used.

### Use your own server (Level 2)

Any OpenAI-compatible endpoint works: vLLM, LM Studio, Ollama, or a gateway to Azure OpenAI / AWS Bedrock in your own account.

```bash
local-playbooks playbook --since 1d \
  --engine endpoint \
  --endpoint http://gpu-server.internal:8000/v1 \
  --endpoint-model meta-llama/Llama-3.3-70B-Instruct
```

Or set environment variables:

```bash
export LOCAL_PLAYBOOKS_ENDPOINT=http://gpu-server.internal:8000/v1
export LOCAL_PLAYBOOKS_ENDPOINT_MODEL=meta-llama/Llama-3.3-70B-Instruct
export LOCAL_PLAYBOOKS_API_KEY=...        # if your server needs one
```

### Change the built-in model

```bash
local-playbooks summary --model "hf:bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M"
# or: export LOCAL_PLAYBOOKS_MODEL=...
```

Models are stored in `~/.local-playbooks/models`. Bigger models write better notes but need more memory (a 3B model needs ~4 GB RAM, a 7–8B model ~8 GB).

## Privacy

- The recorder and local-playbooks both run on your machine. With the default engine, no data leaves it. The recorder is always started with telemetry off.
- Names and addresses are found by [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) (Apache 2.0), running locally. Pattern rules then catch emails, phones, SSNs, dates, MRN/member/claim numbers and long digit strings. Both are **best-effort and will miss things**. Use `--redact` for names you know about.
- Don't treat this as a HIPAA compliance tool. If you use it around patient data, review it with your security/compliance team.

## Licensing

local-playbooks is MIT-licensed.

The capture engine in `engine/` is a copy of the open-source Screenpipe engine at its last MIT-licensed commit (`892199f`, 10 June 2026). Later Screenpipe versions use a commercial license and are not used here. The original MIT license and copyright notice are in [`engine/LICENSE-UPSTREAM.md`](engine/LICENSE-UPSTREAM.md). This project is not affiliated with Screenpipe. See [`engine/README.md`](engine/README.md).

## Development

```bash
npm test     # runs against a fake Screenpipe and a fake AI server
```

Code map:

- `engine/` – capture engine source (Rust), built by GitHub Actions
- `src/engine.js` – starts and stops the capture engine in the background
- `src/screenpipe.js` – reads the capture engine's local `/search` API
- `src/condense.js` – dedupes screen text into a timeline
- `src/redact.js` – removes sensitive identifiers
- `src/prompts.js` – summary and playbook prompts
- `src/llm/local.js` – built-in model (llama.cpp)
- `src/llm/endpoint.js` – OpenAI-compatible server
- `src/processmap/` – process map (step order, paths, timing, rework)
- `src/pipeline.js` – ties it together; splits long days into parts and combines them

## Roadmap

- Scheduled daily summary
- Export playbooks to Notion / Google Docs
