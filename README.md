# local-playbooks

Turn your screen history into **summaries** and **step-by-step playbooks**, with AI that runs on your own machine.

[Screenpipe](https://github.com/screenpipe/screenpipe) records your screen and audio and reads the text locally. `local-playbooks` reads that history and writes:

- **Summary:** what you worked on, main tasks, and open items.
- **Playbook:** reusable step-by-step guides for workflows you repeated, with decision points and slow spots. Useful for training new teammates.

Nothing leaves your machine unless you point it at a server you control.

## How it works

```
Screenpipe (capture + OCR + transcription, local)
      │  localhost:3030
      ▼
local-playbooks
  1. Condense   – drops repeated screen text, groups by app/window
  2. Redact     – removes emails, phone numbers, SSNs, dates, record/member IDs
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

1. Install and start [Screenpipe](https://github.com/screenpipe/screenpipe). Let it record for a while.
2. Install Node.js 20+.
3. Install local-playbooks:

```bash
git clone https://github.com/disha16/local-playbooks.git
cd local-playbooks
npm install
npm link        # makes the `local-playbooks` command available
local-playbooks doctor
```

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

- Screenpipe and local-playbooks both run on your machine. With the default engine, no data leaves it.
- Redaction is **pattern-based and best-effort**: it catches structured identifiers (emails, phones, SSNs, dates, MRN/member/claim numbers, long digit strings) but **not free-text names**. Use `--redact` for names, and use Screenpipe's app/window filters to avoid recording sensitive apps in the first place.
- Don't treat this as a HIPAA compliance tool. If you use it around patient data, review it with your security/compliance team.

## Licensing

local-playbooks is MIT-licensed. It talks to Screenpipe over its local API and doesn't include Screenpipe's code. Screenpipe has its own [license](https://github.com/screenpipe/screenpipe/blob/main/LICENSE.md): free for personal use, with separate terms for commercial and organizational use. Check it before rolling out at a company.

## Development

```bash
npm test     # runs against a fake Screenpipe and a fake AI server
```

Code map:

- `src/screenpipe.js` – reads Screenpipe's `/search` API
- `src/condense.js` – dedupes screen text into a timeline
- `src/redact.js` – removes sensitive identifiers
- `src/prompts.js` – summary and playbook prompts
- `src/llm/local.js` – built-in model (llama.cpp)
- `src/llm/endpoint.js` – OpenAI-compatible server
- `src/pipeline.js` – ties it together; splits long days into parts and combines them

## Roadmap

- Simple desktop UI (menu bar app) instead of the command line
- Scheduled daily summary
- Better name detection for redaction
- Export playbooks to Notion / Google Docs
