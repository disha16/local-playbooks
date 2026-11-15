# local-playbooks

Turn your screen history into **summaries** and **step-by-step playbooks**, with AI that runs on your own machine.

A built-in recorder captures your screen and audio and reads the text locally. `local-playbooks` reads that history and writes:

- **Summary:** what you worked on, main tasks, and open items.
- **Playbook:** reusable step-by-step guides for workflows you repeated, with decision points and slow spots. Useful for training new teammates.
- **Process map:** which step follows which, common paths, time per step, slow spots and rework.

Nothing leaves your machine unless you point it at a server you control.

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

## Setup

1. Download the installer for Mac or Windows from [Releases](https://github.com/disha16/local-playbooks/releases) and run it. Nothing else needs to be installed.
2. Open a new terminal (Mac) or Command Prompt (Windows):

```bash
local-playbooks start     # start recording in the background
local-playbooks status
local-playbooks doctor    # checks the recorder and the AI model
local-playbooks stop
```

The installers are not signed yet, so Windows and macOS show a warning the first time. On first start, macOS asks for screen recording and microphone permission.

From source (developers): install Node.js 20+, then `git clone`, `npm install`, `npm link`. The recorder is built by GitHub Actions; download it from a "Build capture engine" run and set `LOCAL_PLAYBOOKS_ENGINE` to its path.

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

- Simple desktop UI (menu bar app) instead of the command line
- Scheduled daily summary
- Export playbooks to Notion / Google Docs
