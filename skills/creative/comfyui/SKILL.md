---
name: comfyui
description: "Generate images, video, and audio with ComfyUI — install, launch, manage nodes/models, run workflows with parameter injection. Uses the official comfy-cli for lifecycle and direct REST/WebSocket API for execution."
version: 5.0.0
author: [kshitijk4poor, alt-glitch]
license: MIT
platforms: [macos, linux, windows]
compatibility: "Requires ComfyUI (local, Comfy Desktop, or Comfy Cloud) and comfy-cli (auto-installed via pipx/uvx by the setup script)."
prerequisites:
  commands: ["python3"]
setup:
  help: "Run scripts/hardware_check.py FIRST to decide local vs Comfy Cloud; then scripts/comfyui_setup.sh auto-installs locally (or use Cloud API key for platform.comfy.org)."
metadata:
  hermes:
    tags:
      - comfyui
      - image-generation
      - stable-diffusion
      - flux
      - sd3
      - wan-video
      - hunyuan-video
      - creative
      - generative-ai
      - video-generation
    related_skills: [stable-diffusion-image-generation, image_gen]
    category: creative
---

# ComfyUI

Generate images, video, audio, and 3D content through ComfyUI using the
official `comfy-cli` for setup/lifecycle and direct REST/WebSocket API
for workflow execution.

## What's in this skill

**Reference docs (`references/`):**

- `official-cli.md` — every `comfy ...` command, with flags
- `rest-api.md` — REST + WebSocket endpoints (local + cloud), payload schemas
- `workflow-format.md` — API-format JSON, common node types, param mapping
- `references/ltx-video-pipeline.md` — working end-to-end LTX 2.3 video pipeline (node chain, parameters, FFmpeg merge, 6-segment narrative template).
- `references/zimage-turbo-workflow.md` — verified working Z-Image-Turbo API workflow (node chain, Python code, pitfalls for Z-Image-Turbo-specific errors); also used by the `suxi-manshi-video` skill.
- `references/comfyui-instance-discovery.md` — **active instance vs portable**, Z-Image-Turbo checkpoint location, `GET /history` list-vs-dict format, output path resolution when MCP tools fail, and template/checkpoint compatibility matrix.

**Scripts (`scripts/`):**

| Script | Purpose |
|--------|---------|
| `_common.py` | Shared HTTP, cloud routing, node catalogs (don't run directly) |
| `hardware_check.py` | Probe GPU/VRAM/disk → recommend local vs Comfy Cloud |
| `comfyui_setup.sh` | Hardware check + comfy-cli + ComfyUI install + launch + verify |
| `extract_schema.py` | Read a workflow → list controllable params + model deps |
| `check_deps.py` | Check workflow against running server → list missing nodes/models |
| `auto_fix_deps.py` | Run check_deps then `comfy node install` / `comfy model download` |
| `run_workflow.py` | Inject params, submit, monitor, download outputs (HTTP or WS) |
| `run_batch.py` | Submit a workflow N times with sweeps, parallel up to your tier |
| `ws_monitor.py` | Real-time WebSocket viewer for executing jobs (live progress) |
| `health_check.py` | Verification checklist runner — comfy-cli + server + models + smoke test |
| `fetch_logs.py` | Pull traceback / status messages for a given prompt_id |

**Example workflows (`workflows/`):** SD 1.5, SDXL, Flux Dev, SDXL img2img,
SDXL inpaint, ESRGAN upscale, AnimateDiff video, Wan T2V. See
`workflows/README.md`.

### Alternative: comfyui-agent-skill-mie (Registered Workflow CLI)

A lighter alternative for **pre-registered workflows only** (image, video, music, TTS).
Install: `uv tool install comfyui-agent-skill-mie` → exposes `comfyui-skill` CLI.
**Status (2026-05-13): Mie V8.0 instance verified — ComfyUI 0.20.1, RTX 5090, fp16 accumulation active. ⚠️ Z-Image-Turbo `NunchakuZImageDiTLoader` crashes with `KeyError: 'weight'` — use SD1.5 + MajicmixRealistic as fallback.**

Registered workflows (verified configs in `assets/workflows/*.config.json`):
- `z_image_turbo` — general text-to-image ✅
- `qwen_image_2512_4step` — poster/text-in-image ✅
- `klein_edit` — image editing ✅
- `ltx_23_t2v_distill` — text-to-video ✅ (LTX 2.3 models present)
- `ltx_23_i2v_distilled` — image-to-video ✅ (LTX 2.3 models present)
- `ace_step_15_music` — text-to-music ✅
- `qwen3_tts` — text-to-speech ✅

Quick commands:
```bash
comfyui-skill save-server http://127.0.0.1:8188  # persist server URL
comfyui-skill doctor          # server + preflight check (all should PASS)
comfyui-skill generate -p "prompt" --workflow z_image_turbo
comfyui-skill generate --workflow ltx_23_t2v_distill -p "shot prompt"
comfyui-skill free            # release GPU memory
```

**Active server: Mie V8.0 at `E:\ComfyUI_Mie_2026_V8.0`.** Default launch: `run_nvidia_gpu_fast_fp16_accumulation.bat` (modified with `--listen 0.0.0.0 --port 8188`). WSL accesses via `http://127.0.0.1:8188` — NOT the Windows LAN IP.

When to use this vs. direct REST API:
- **comfyui-agent-skill-mie**: user wants a fast, structured CLI for known workflows;
  agent-first workflow selection; prompt enhancement built in.
- **Direct REST/scripts**: custom/unregistered workflows; fine-grained node control;
  cloud execution (Comfy Cloud); non-standard pipelines.

## When to Use

- User asks to generate images with Stable Diffusion, SDXL, Flux, SD3, etc.
- User wants to run a specific ComfyUI workflow file
- User wants to chain generative steps (txt2img → upscale → face restore)
- User needs ControlNet, inpainting, img2img, or other advanced pipelines
- User asks to manage ComfyUI queue, check models, or install custom nodes
- User wants video/audio/3D generation via AnimateDiff, Hunyuan, Wan, AudioCraft, etc.

## Architecture: Two Layers

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: comfy-cli (official lifecycle tool)        │
│   Setup, server lifecycle, custom nodes, models     │
│   → comfy install / launch / stop / node / model    │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│ Layer 2: REST/WebSocket API + skill scripts         │
│   Workflow execution, param injection, monitoring   │
│   POST /api/prompt, GET /api/view, WS /ws           │
│   → run_workflow.py, run_batch.py, ws_monitor.py    │
└─────────────────────────────────────────────────────┘
```

**Why two layers?** The official CLI is excellent for installation and server
management but has minimal workflow execution support. The REST/WS API fills
that gap — the scripts handle param injection, execution monitoring, and
output download that the CLI doesn't do.

## Quick Start

### Detect environment

```bash
# What's available?
command -v comfy >/dev/null 2>&1 && echo "comfy-cli: installed"
curl -s http://127.0.0.1:8188/system_stats 2>/dev/null && echo "server: running"

# Can this machine run ComfyUI locally? (GPU/VRAM/disk check)
python3 scripts/hardware_check.py
```

If nothing is installed, see **Setup & Onboarding** below — but always run the
hardware check first.

### One-line health check

```bash
python3 scripts/health_check.py
# → JSON: comfy_cli on PATH? server reachable? at least one checkpoint? smoke-test passes?
```

## Core Workflow

### Step 1: Get a workflow JSON in API format

Workflows must be in API format (each node has `class_type`). They come from:

- ComfyUI web UI → **Workflow → Export (API)** (newer UI) or
  the legacy "Save (API Format)" button (older UI)
- This skill's `workflows/` directory (ready-to-run examples)
- Community downloads (civitai, Reddit, Discord) — usually editor format,
  must be loaded into ComfyUI then re-exported

Editor format (top-level `nodes` and `links` arrays) is **not directly
executable**. The scripts detect this and tell you to re-export.

### Step 2: See what's controllable

```bash
python3 scripts/extract_schema.py workflow_api.json --summary-only
# → {"parameter_count": 12, "has_negative_prompt": true, "has_seed": true, ...}

python3 scripts/extract_schema.py workflow_api.json
# → full schema with parameters, model deps, embedding refs
```

### Step 3: Run with parameters

```bash
# Local (defaults to http://127.0.0.1:8188)
python3 scripts/run_workflow.py \
  --workflow workflow_api.json \
  --args '{"prompt": "a beautiful sunset over mountains", "seed": -1, "steps": 30}' \
  --output-dir ./outputs

# Cloud (export API key once; uses correct /api routing automatically)
export COMFY_CLOUD_API_KEY="comfyui-..."
python3 scripts/run_workflow.py \
  --workflow workflow_api.json \
  --args '{"prompt": "..."}' \
  --host https://cloud.comfy.org \
  --output-dir ./outputs
```

> ⚠️ **Direct curl/http submission pitfall:** When calling `/api/prompt` directly with Python `urllib`, the payload must be `{"prompt": workflow_dict}` — the workflow dict goes directly under the `"prompt"` key (not wrapped in another object). Example:
> ```python
> payload = json.dumps({"prompt": workflow}).encode("utf-8")
> req = urllib.request.Request("http://127.0.0.1:8188/api/prompt", data=payload,
>                              headers={"Content-Type": "application/json"}, method="POST")
> with urllib.request.urlopen(req, timeout=30) as resp:
>     result = json.loads(resp.read())
> # → {"prompt_id": "abc-123", "number": 1, "node_errors": {}}
> ```
> Common mistake: wrapping `"prompt"` inside another key (e.g. `{"workflow": workflow}`) → `{"error": {"type": "no_prompt"}}`.

`-1` for `seed` (or omitting it with `--randomize-seed`) generates a fresh
random seed per run.

### Step 4: Present results

The scripts emit JSON to stdout describing every output file:

```json
{
  "status": "success",
  "prompt_id": "abc-123",
  "outputs": [
    {"file": "./outputs/sdxl_00001_.png", "node_id": "9",
     "type": "image", "filename": "sdxl_00001_.png"}
  ]
}
```

## Decision Tree

| User says | Tool | Command |
|-----------|------|---------|
| **Lifecycle (use comfy-cli)** | | |
| "install ComfyUI" | comfy-cli | `bash scripts/comfyui_setup.sh` |
| "start ComfyUI" | comfy-cli | `comfy launch --background` |
| "stop ComfyUI" | comfy-cli | `comfy stop` |
| "install X node" | comfy-cli | `comfy node install <name>` |
| "download X model" | comfy-cli | `comfy model download --url <url> --relative-path models/checkpoints` |
| "list installed models" | comfy-cli | `comfy model list` |
| "list installed nodes" | comfy-cli | `comfy node show installed` |
| **Execution (use scripts)** | | |
| "is everything ready?" | script | `health_check.py` (optionally with `--workflow X --smoke-test`) |
| "what can I change in this workflow?" | script | `extract_schema.py W.json` |
| "check if W's deps are met" | script | `check_deps.py W.json` |
| "fix missing deps" | script | `auto_fix_deps.py W.json` |
| "generate an image" | script | `run_workflow.py --workflow W --args '{...}'` |
| "use this image" (img2img) | script | `run_workflow.py --input-image image=./x.png ...` |
| "8 variations with random seeds" | script | `run_batch.py --count 8 --randomize-seed ...` |
| "show me live progress" | script | `ws_monitor.py --prompt-id <id>` |
| "fetch the error from job X" | script | `fetch_logs.py <prompt_id>` |
| **Direct REST** | | |
| "what's in the queue?" | REST | `curl http://HOST:8188/queue` (local) or `--host https://cloud.comfy.org` |
| "cancel that" | REST | `curl -X POST http://HOST:8188/interrupt` |
| "free GPU memory" | REST | `curl -X POST http://HOST:8188/free` |

## Setup & Onboarding

When a user asks to set up ComfyUI, **the FIRST thing to do is ask whether
they want Comfy Cloud (hosted, zero install, API key) or Local (install
ComfyUI on their machine)**. Don't start running install commands or hardware
checks until they've answered.

**Official docs:** https://docs.comfy.org/installation
**CLI docs:** https://docs.comfy.org/comfy-cli/getting-started
**Cloud docs:** https://docs.comfy.org/get_started/cloud
**Cloud API:** https://docs.comfy.org/development/cloud/overview

### Step 0: Ask Local vs Cloud (ALWAYS FIRST)

Suggested script:

> "Do you want to run ComfyUI locally on your machine, or use Comfy Cloud?
>
> - **Comfy Cloud** — hosted on RTX 6000 Pro GPUs, all common models pre-installed,
>   zero setup. Requires an API key (paid subscription required to actually run
>   workflows; free tier is read-only). Best if you don't have a capable GPU.
> - **Local** — free, but your machine MUST meet the hardware requirements:
>   - NVIDIA GPU with **≥6 GB VRAM** (≥8 GB for SDXL, ≥12 GB for Flux/video), OR
>   - AMD GPU with ROCm support (Linux), OR
>   - Apple Silicon Mac (M1+) with **≥16 GB unified memory** (≥32 GB recommended).
>   - Intel Macs and machines with no GPU will NOT work — use Cloud instead.
>
> Which would you like?"

Routing:

- **Cloud** → skip to **Path A**.
- **Local** → run hardware check first, then pick a path from Paths B–E based on the verdict.
- **Unsure** → run the hardware check and let the verdict decide.

### Step 1: Verify Hardware (ONLY if user chose local)

```bash
python3 scripts/hardware_check.py --json
# Optional: also probe `torch` for actual CUDA/MPS:
python3 scripts/hardware_check.py --json --check-pytorch
```

| Verdict    | Meaning                                                       | Action |
|------------|---------------------------------------------------------------|--------|
| `ok`       | ≥8 GB VRAM (discrete) OR ≥32 GB unified (Apple Silicon)       | Local install — use `comfy_cli_flag` from report |
| `marginal` | SD1.5 works; SDXL tight; Flux/video unlikely                  | Local OK for light workflows, else **Path A (Cloud)** |
| `cloud`    | No usable GPU, <6 GB VRAM, <16 GB Apple unified, Intel Mac, Rosetta Python | **Switch to Cloud** unless user explicitly forces local |

The script also surfaces `wsl: true` (WSL2 with NVIDIA passthrough) and
`rosetta: true` (x86_64 Python on Apple Silicon — must reinstall as ARM64).

If verdict is `cloud` but the user wants local, do not proceed silently.
Show the `notes` array verbatim and ask whether they want to (a) switch to
Cloud or (b) force a local install (will OOM or be unusably slow on modern models).

### Choosing an Installation Path

Use the hardware check first. The table below is the fallback for when the
user has already told you their hardware:

| Situation | Recommended Path |
|-----------|------------------|
| `verdict: cloud` from hardware check | **Path A: Comfy Cloud** |
| No GPU / want to try without commitment | **Path A: Comfy Cloud** |
| Windows + NVIDIA + non-technical | **Path B: ComfyUI Desktop** |
| Windows + NVIDIA + technical | **Path C: Portable** or **Path D: comfy-cli** |
| Linux + any GPU | **Path D: comfy-cli** (easiest) |
| macOS + Apple Silicon | **Path B: Desktop** or **Path D: comfy-cli** |
| Headless / server / CI / agents | **Path D: comfy-cli** |

For the fully automated path (hardware check → install → launch → verify):

```bash
bash scripts/comfyui_setup.sh
# Or with overrides:
bash scripts/comfyui_setup.sh --m-series --port=8190 --workspace=/data/comfy
```

It runs `hardware_check.py` internally, refuses to install locally when the
verdict is `cloud` (unless `--force-cloud-override`), picks the right
`comfy-cli` flag, and prefers `pipx`/`uvx` over global `pip` to avoid polluting
system Python.

---

### Path A: Comfy Cloud (No Local Install)

For users without a capable GPU or who want zero setup. Hosted on RTX 6000 Pro.

**Docs:** https://docs.comfy.org/get_started/cloud

1. Sign up at https://comfy.org/cloud
2. Generate an API key at https://platform.comfy.org/login
3. Set the key:
   ```bash
   export COMFY_CLOUD_API_KEY="comfyui-xxxxxxxxxxxx"
   ```
4. Run workflows:
   ```bash
   python3 scripts/run_workflow.py \
     --workflow workflows/flux_dev_txt2img.json \
     --args '{"prompt": "..."}' \
     --host https://cloud.comfy.org \
     --output-dir ./outputs
   ```

**Pricing:** https://www.comfy.org/cloud/pricing
**Concurrent jobs:** Free/Standard 1, Creator 3, Pro 5. Free tier
**cannot run workflows via API** — only browse models. Paid subscription
required for `/api/prompt`, `/api/upload/*`, `/api/view`, etc.

---

### Path B: ComfyUI Desktop (Windows / macOS)

One-click installer for non-technical users. Currently Beta.

**Docs:** https://docs.comfy.org/installation/desktop
- **Windows (NVIDIA):** https://download.comfy.org/windows/nsis/x64
- **macOS (Apple Silicon):** https://comfy.org

Linux is **not supported** for Desktop — use Path D.

---

### Path C: ComfyUI Portable (Windows Only)

**Docs:** https://docs.comfy.org/installation/comfyui_portable_windows

Download from https://github.com/comfyanonymous/ComfyUI/releases, extract,
run `run_nvidia_gpu.bat`. Update via `update/update_comfyui_stable.bat`.

---

### Path D: comfy-cli (All Platforms — Recommended for Agents)

The official CLI is the best path for headless/automated setups.

**Docs:** https://docs.comfy.org/comfy-cli/getting-started

#### Install comfy-cli

```bash
# Recommended:
pipx install comfy-cli
# Or use uvx without installing:
uvx --from comfy-cli comfy --help
# Or (if pipx/uvx unavailable):
pip install --user comfy-cli
```

Disable analytics non-interactively:
```bash
comfy --skip-prompt tracking disable
```

#### Install ComfyUI

```bash
comfy --skip-prompt install --nvidia              # NVIDIA (CUDA)
comfy --skip-prompt install --amd                 # AMD (ROCm, Linux)
comfy --skip-prompt install --m-series            # Apple Silicon (MPS)
comfy --skip-prompt install --cpu                 # CPU only (slow)
comfy --skip-prompt install --nvidia --fast-deps  # uv-based dep resolution
```

Default location: `~/comfy/ComfyUI` (Linux), `~/Documents/comfy/ComfyUI`
(macOS/Win). Override with `comfy --workspace /custom/path install`.

#### Launch / verify

```bash
comfy launch --background                       # background daemon on :8188
comfy launch -- --listen 0.0.0.0 --port 8190    # LAN-accessible custom port
curl -s http://127.0.0.1:8188/system_stats      # health check
```

---

### Path E: Manual Install (Advanced / Unsupported Hardware)

For Ascend NPU, Cambricon MLU, Intel Arc, or other unsupported hardware.

**Docs:** https://docs.comfy.org/installation/manual_install

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu130
pip install -r requirements.txt
python main.py
```

---

### Post-Install: Download Models

```bash
# SDXL (general purpose, ~6.5 GB)
comfy model download \
  --url "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" \
  --relative-path models/checkpoints

# SD 1.5 (lighter, ~4 GB, good for 6 GB cards)
comfy model download \
  --url "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors" \
  --relative-path models/checkpoints

# Flux Dev fp8 (smaller variant, ~12 GB)
comfy model download \
  --url "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors" \
  --relative-path models/checkpoints

# CivitAI (set token first):
comfy model download \
  --url "https://civitai.com/api/download/models/128713" \
  --relative-path models/checkpoints \
  --set-civitai-api-token "YOUR_TOKEN"
```

List installed: `comfy model list`.

### Post-Install: Install Custom Nodes

```bash
comfy node install comfyui-impact-pack             # popular utility pack
comfy node install comfyui-animatediff-evolved     # video generation
comfy node install comfyui-controlnet-aux          # ControlNet preprocessors
comfy node install comfyui-essentials              # common helpers
comfy node update all
comfy node install-deps --workflow=workflow.json   # install everything a workflow needs
```

### Post-Install: Verify

```bash
python3 scripts/health_check.py
# → comfy_cli on PATH? server reachable? checkpoints? smoke test?

python3 scripts/check_deps.py my_workflow.json
# → are this workflow's nodes/models/embeddings installed?

python3 scripts/run_workflow.py \
  --workflow workflows/sd15_txt2img.json \
  --args '{"prompt": "test", "steps": 4}' \
  --output-dir ./test-outputs
```

## Image Upload (img2img / Inpainting)

The simplest way is to use `--input-image` with `run_workflow.py`:

```bash
python3 scripts/run_workflow.py \
  --workflow workflows/sdxl_img2img.json \
  --input-image image=./photo.png \
  --args '{"prompt": "make it cyberpunk", "denoise": 0.6}'
```

The flag uploads `photo.png`, then injects its server-side filename into
whatever schema parameter is named `image`. For inpainting, pass both:

```bash
python3 scripts/run_workflow.py \
  --workflow workflows/sdxl_inpaint.json \
  --input-image image=./photo.png \
  --input-image mask_image=./mask.png \
  --args '{"prompt": "fill with flowers"}'
```

Manual upload via REST:
```bash
curl -X POST "http://127.0.0.1:8188/upload/image" \
  -F "image=@photo.png" -F "type=input" -F "overwrite=true"
# Returns: {"name": "photo.png", "subfolder": "", "type": "input"}

# Cloud equivalent:
curl -X POST "https://cloud.comfy.org/api/upload/image" \
  -H "X-API-Key: $COMFY_CLOUD_API_KEY" \
  -F "image=@photo.png" -F "type=input" -F "overwrite=true"
```

## Cloud Specifics

- **Base URL:** `https://cloud.comfy.org`
- **Auth:** `X-API-Key` header (or `?token=KEY` for WebSocket)
- **API key:** set `$COMFY_CLOUD_API_KEY` once and the scripts pick it up automatically
- **Output download:** `/api/view` returns a 302 to a signed URL; the scripts
  follow it and strip `X-API-Key` before fetching from the storage backend
  (don't leak the API key to S3/CloudFront).
- **Endpoint differences from local ComfyUI:**
  - `/api/object_info`, `/api/queue`, `/api/userdata` — **403 on free tier**;
    paid only.
  - `/history` is renamed to `/history_v2` on cloud (the scripts route
    automatically).
  - `/models/<folder>` is renamed to `/experiment/models/<folder>` on cloud
    (the scripts route automatically).
  - `clientId` in WebSocket is currently ignored — all connections for a
    user receive the same broadcast. Filter by `prompt_id` client-side.
  - `subfolder` is accepted on uploads but ignored — cloud has a flat namespace.
- **Concurrent jobs:** Free/Standard: 1, Creator: 3, Pro: 5. Extras queue
  automatically. Use `run_batch.py --parallel N` to saturate your tier.

## Queue & System Management

```bash
# Local
curl -s http://127.0.0.1:8188/queue | python3 -m json.tool
curl -X POST http://127.0.0.1:8188/queue -d '{"clear": true}'    # cancel pending
curl -X POST http://127.0.0.1:8188/interrupt                      # cancel running
curl -X POST http://127.0.0.1:8188/free \
  -H "Content-Type: application/json" \
  -d '{"unload_models": true, "free_memory": true}'

# Cloud — same paths under /api/, plus:
python3 scripts/fetch_logs.py --tail-queue --host https://cloud.comfy.org
```

## Manual Node Installation & Troubleshooting

### Git Clone Method (Alternative to `comfy node install`)

Some nodes (ComfyUI Manager, TensorRT, etc.) may need manual git cloning when `comfy node install` fails or when you want a specific version:

```bash
cd /path/to/ComfyUI/Custom_Nodes
git clone https://github.com/AUTHOR/NodeName.git
```

After cloning, **ComfyUI must be restarted** to load the new node. Verify it appears in:
```bash
curl -s http://localhost:8188/api/object_info | python3 -c "
import sys, json
d = json.load(sys.stdin)
node_keywords = ['Manager', 'TensorRT', 'Prompt']  # change to your node
found = [k for k in d if any(n in k for n in node_keywords)]
print('Loaded nodes:', found[:10] if found else 'None found — restart ComfyUI first')
"
```

### ComfyUI Embedded Python — pip Installation Limitations

The embedded Python in ComfyUI portable (`python_embeded/python.exe`, Python 3.13) has a known issue: its `pip` wheel builder is broken (`BackendUnavailable: Cannot import 'wheel_stub.buildapi'`). This means packages requiring compilation from source (tensorrt, onnxruntime built from scratch, etc.) **cannot be installed via pip** inside the embedded environment.

**Workarounds (in order of reliability):**

1. **Use ComfyUI Manager UI** after restart — it has its own dependency resolution that works around the embedded pip
2. **Install to system Python** instead, then ComfyUI can `import` it:
   ```bash
   # Find the embedded Python's site-packages path first:
   /path/to/python_embeded/python.exe -c "import sys; print(sys.path[-1])"
   # Install to a known location:
   pip install --target=/path/to/known/site-packages tensorrt
   ```
3. **Manual install** — download the .whl wheel (manylinux_2_17_x86_64.manylinux2014_x86_64 tag) and unzip into site-packages:
   ```bash
   curl -fL "https://pypi.org/pypi/tensorrt/10.9.0/json" | python3 -c "
   import sys,json,urllib.request,zipfile,os
   d=json.load(sys.stdin)
   url = d['urls'][0]['url']
   # download wheel to /tmp, unzip into ComfyUI's embedded site-packages
   "
   ```

### Verifying Node Installation

After installing a node and restarting ComfyUI, verify it's registered:

```bash
# Method 1: Check via REST API
curl -s http://localhost:8188/api/object_info | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('Total node types:', len(d))
# Search for a known node
target = 'Manager'  # or 'TensorRT', etc.
matches = [k for k in d if target.lower() in k.lower()]
print(f'Nodes matching \"{target}\":', matches[:5])
"

# Method 2: Check registry files (ComfyUI Manager only)
ls Custom_Nodes/ComfyUI-Manager/*.json

# Method 3: Check via Comfy Cozy MCP
# The `list_custom_nodes` tool reports all installed custom node packs
```

### Common Node Installation Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| "class_type not found" | Node not loaded | Restart ComfyUI; check `/api/object_info` |
| `pip install` fails with `BackendUnavailable` | Embedded Python wheel builder broken | Use Manager UI or install to system Python |
| Registry files missing | Manager not fully initialized | Restart ComfyUI; check `Custom_Nodes/ComfyUI-Manager/custom-node-list.json` exists |
| Manager installed but no nodes appear | ComfyUI needs restart | Full restart of ComfyUI process |
| TensorRT imports fail after install | CUDA version mismatch | TensorRT requires matching CUDA version (e.g., cu130 for this build) |

### ComfyUI-Manager v4.x — pip package, not custom node

ComfyUI-Manager v4.x (4.0+) is **installed as a pip package**, NOT a git-cloned custom node. The repo structure changed: code lives in `comfyui_manager/` subdirectory (pip package), not at the repo root.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `--enable-manager` says "package must be installed first" | `comfyui_manager` not in pip site-packages | `pip install --target=... comfyui-manager` into embedded Python |
| Manager cloned to `custom_nodes/` but ComfyUI says `__init__.py` not found | v4.x has no root `__init__.py` — it is a pip package | Remove from `custom_nodes/`, pip install to embedded Python |
| `/api/extensions` has no Manager entry, Manager API returns 404 | v4.x loaded from `site-packages` via `--enable-manager`, not via `custom_nodes` loader | Ensure `--enable-manager` in argv; check pip install succeeded |
| Manager API works (`/api/manager/*` returns JSON) but **no Manager UI icon** in browser | `args.enable_manager_legacy_ui` defaults to `False` — frontend JS not registered | Add `--enable-manager-legacy-ui` to launch argv; restart ComfyUI |

**Correct install for portable/embedded Python:**

```bash
# 1. Remove any git-cloned Manager from custom_nodes (wrong location for v4.x)
rm -rf /path/to/ComfyUI/Custom_Nodes/ComfyUI-Manager

# 2. Clone to a temp directory (NOT inside custom_nodes)
git clone --branch 4.2.1 --depth=1 https://github.com/ltdrdata/ComfyUI-Manager.git /tmp/ComfyUI-Manager

# 3. pip install into embedded Python
/path/to/python_embeded/python.exe -m pip install /tmp/ComfyUI-Manager --quiet

# 4. Verify
/path/to/python_embeded/python.exe -c "import comfyui_manager; print(comfyui_manager.__file__)"
# Should print: .../site-packages/comfyui_manager/__init__.py

# 5. Launch with --enable-manager AND --enable-manager-legacy-ui flags
python.exe ComfyUI/main.py --windows-standalone-build --enable-manager --enable-manager-legacy-ui
```

> **⚠️ Both flags required:** `--enable-manager` loads the Manager backend (API endpoints). `--enable-manager-legacy-ui` registers the frontend JavaScript at `/extensions/comfyui-manager-legacy/`. Without both, the Manager API will work but no UI icon will appear in the browser.

> **Key difference from v3.x:** v3.x was a custom node (git cloned into `custom_nodes/`). v4.x is a pip package loaded via `--enable-manager` flag from `site-packages`. The `--enable-manager` flag tells ComfyUI to `import comfyui_manager` and call its `prestartup()` and `start()` functions — it does NOT go through the `custom_nodes/` loader.

## Pitfalls

1. **Never include `_comment` or `_meta` in workflow JSON submitted to `/api/prompt`** — ComfyUI v0.20.1's `validate_prompt` iterates all top-level keys as node IDs and calls `.get()` on them. A top-level `"_comment": "..."` string causes `AttributeError: 'str' object has no attribute 'get'`. Node-level `_meta: {"title": "..."}` is fine in the web UI but should be stripped before API submission. **Fix:** always submit workflows without `_comment` at the root and without `_meta` inside nodes. Use plain `{"node_id": {"class_type": "...", "inputs": {...}}}`.

2. **API format required** — every script and the `/api/prompt` endpoint expect
   API-format workflow JSON. The scripts detect editor format (top-level
   `nodes` and `links` arrays) and tell you to re-export via
   "Workflow → Export (API)" (newer UI) or "Save (API Format)" (older UI).

3. **Server must be running** — all execution requires a live server.
   `comfy launch --background` starts one. Verify with
   `curl http://127.0.0.1:8188/system_stats`.

4. **Model names are exact** — case-sensitive, includes file extension.
   `check_deps.py` does fuzzy matching (with/without extension and folder
   prefix), but the workflow itself must use the canonical name. Use
   `comfy model list` to discover what's installed.

5. **Missing custom nodes** — "class_type not found" means a required node
   isn't installed. `check_deps.py` reports which package to install;
   `auto_fix_deps.py` runs the install for you.

6. **Working directory** — `comfy-cli` auto-detects the ComfyUI workspace.
   If commands fail with "no workspace found", use
   `comfy --workspace /path/to/ComfyUI <command>` or
   `comfy set-default /path/to/ComfyUI`.

7. **Cloud free-tier API limits** — `/api/prompt`, `/api/view`, `/api/upload/*`,
   `/api/object_info` all return 403 on free accounts. `health_check.py` and
   `check_deps.py` handle this gracefully and surface a clear message.

8. **Timeout for video/audio workflows** — auto-detected when an output node
   is `VHS_VideoCombine`, `SaveVideo`, etc.; the default jumps from 300 s to
   900 s. Override explicitly with `--timeout 1800`.

9. **Path traversal in output filenames** — server-supplied filenames are
   passed through `safe_path_join` to refuse anything escaping `--output-dir`.
   Keep this protection on — workflows with custom save nodes can produce
   arbitrary paths.

10. **Workflow JSON is arbitrary code** — custom nodes run Python, so
    submitting an unknown workflow has the same trust profile as `eval`.
    Inspect workflows from untrusted sources before running.

11. **Auto-randomized seed** — pass `seed: -1` in `--args` (or use
    `--randomize-seed` and omit the seed) to get a fresh seed per run.
    The actual seed is logged to stderr.

12. **Z-Image-Turbo — NunchakuZImageDiTLoader crashes with `KeyError: 'weight'` on Mie V8.0** — The `NunchakuZImageDiTLoader` node crashes during model loading when using the bf16 variant (`Z-Image-Turbo\z_image_turbo_bf16.safetensors`). The error occurs in `unchaku/utils.py` at `get_precision_from_quantization_config` — the quantization config dict is missing the expected `"weight"` key. This is a **node bug**, not a workflow configuration issue.

    **Symptoms:** All runs fail with `exception_type: KeyError, exception_message: "'weight'"` at node `NunchakuZImageDiTLoader`.

    **Workaround:** Use **SD1.5 + MajicmixRealistic** as fallback. This is the confirmed working path on Mie V8.0:
    ```python
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "SD1.5\\majicmixRealistic_v7.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1280, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
              "model": ["1", 0], "seed": seed, "steps": 25, "cfg": 7.0,
              "sampler_name": "euler_ancestral", "scheduler": "normal",
              "positive": ["2", 0], "negative": ["3", 0],
              "latent_image": ["4", 0], "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "output", "images": ["6", 0]}}
    }
    ```
    For Z-Image-Turbo on other instances, the correct node chain is: `NunchakuZImageDiTLoader` → `CLIPLoader(type=lumina2)` → `CLIPTextEncodeLumina2` → `ConditioningZeroOut` → `VAELoader(Flux\ae.sft)` → `EmptyLatentImage` → `KSampler(steps=8, cfg=1.0)` → `VAEDecode` → `SaveImage`. Note: `CLIPTextEncodeLumina2` outputs **CONDITIONING only** — it does NOT produce a VAE; a separate `VAELoader` node is required. Negative prompt via `ConditioningZeroOut` (leave prompt empty for Z-Image-Turbo which does not support negative prompts).

13. **POST /api/prompt returns 500 — `node_replace_manager` links-array bug** — In ComfyUI v0.20.1, the `node_replace_manager.py` middleware iterates over `links` array entries and passes each `origin_id` (an integer) to `"class_type" in int`, which raises `TypeError: argument of type 'int' is not iterable`. The crash is **not a persistent process-state corruption** — it is a per-request middleware error. A simple process restart fully restores the server.

    **Symptom:** `system_stats`, `queue`, and `object_info` all return 200 OK, but all `POST /prompt` calls return 500 even for trivial nodes like `NoteNode`. The Web UI also breaks because it uses the same API layer.

    **Diagnosis:**
    ```bash
    curl -s --max-time 5 http://127.0.0.1:8188/system_stats   # still responds?
    curl -s -X POST http://127.0.0.1:8188/prompt \
      -H "Content-Type: application/json" \
      -d '{"prompt": {"1": {"class_type": "NoteNode", "inputs": {"text": "test"}}}}'
    # If this also 500 → likely the links-array bug
    tail -20 /path/to/ComfyUI/user/comfyui_8188.log
    # Look for: "TypeError: argument of type 'int' is not iterable"
    ```

    **Fix:** Remove the `links` array from the workflow JSON. Use a pure `nodes` structure instead:
    ```python
    # ✅ Correct — no links array, node inputs reference by ["node_id", output_index]
    {
      "prompt": {
        "1": {"class_type": "CLIPLoader", "inputs": {...}},
        "2": {"class_type": "KSampler", "inputs": {"model": ["1", 0], ...}},
        ...
      }
    }

    # ❌ Wrong — includes links array (triggers the TypeError)
    {
      "prompt": {
        "nodes": [...],
        "links": [[1, 5, 0, "CLIP"], [2, 6, 0, "MODEL"], ...]
      }
    }
    ```

    **Recovery:** No full reinstall needed. Restart the ComfyUI process — the middleware state is not corrupted. After restart, submit workflows in the correct format (no `links` array).

    **Note:** Workflows exported from the ComfyUI web UI in "API format" via "Workflow → Export (API)" (new UI) or "Save (API Format)" (old UI) **do not include a `links` array** and will work correctly. Workflows in "editor format" (top-level `nodes` and `links` arrays) are not directly executable via the API — they must be re-exported from the UI in API format first.

14. **WSL localhost access for ComfyUI** — When running ComfyUI in WSL (Windows Subsystem for Linux), always access it via `http://127.0.0.1:8188` from within WSL, NOT `http://192.168.1.2:8188` (the Windows LAN IP). The latter is blocked by Windows Firewall. The server must listen on `0.0.0.0` (not `127.0.0.1`) to be accessible from WSL.

    **Launching from WSL (Windows-side portable instance):**
    ```bash
    /mnt/c/Windows/System32/cmd.exe /c "cd /d E:\ComfyUI_Mie_2026_V8.0 && start /b run_nvidia_gpu_fast_fp16_accumulation.bat"
    ```
    `cmd.exe` (not `bash`) must be used — `start` is a Windows CMD builtin. The Mie V8.0 bat has been pre-modified with `--listen 0.0.0.0 --port 8188` so WSL can reach it.

15. **Model names with subdirectory paths on Windows ComfyUI** — When submitting workflows via direct REST API (`POST /api/prompt`) on a Windows portable ComfyUI installation, model names that include subdirectory paths (e.g., `SD1.5/majicmixRealistic_v7.safetensors`) must use **backslashes** (`SD1.5\\majicmixRealistic_v7.safetensors`) in the payload. The ComfyUI `list_models` MCP tool and ComfyUI Manager UI display forward slashes, but the internal API validation on Windows requires backslashes. Forward slashes cause `400 Bad Request: Value not in list`. This applies to `ckpt_name` in `CheckpointLoaderSimple` and similar model-loader nodes.

    ```python
    # ❌ Wrong — forward slashes fail on Windows ComfyUI
    {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "SD1.5/majicmixRealistic_v7.safetensors"}}

    # ✅ Correct — backslashes on Windows
    {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "SD1.5\\majicmixRealistic_v7.safetensors"}}
    ```

16. **Retrieve generated images when output path is unknown** — The `SaveImage` node stores images under `type="output"`, but the on-disk output directory may not match the `subfolder` field (ComfyUI portable uses a placeholder `_output_images_will_be_put_here` dir that is actually a file). If `get_output_path` returns "not found", retrieve the image directly via:
    ```python
    # GET /view?filename=<fname>&type=output
    req = urllib.request.Request(f"http://127.0.0.1:8188/view?filename={fname}&type=output")
    with urllib.request.urlopen(req, timeout=10) as resp:
        img_data = resp.read()
    with open("/tmp/output.png", "wb") as f:
        f.write(img_data)
    ```
    The `/api/view` endpoint always resolves images correctly regardless of the on-disk directory structure.

17. **MCP workflow tools (`get_workflow_template`, `validate_before_execute`) have JSON parsing issues** — These tools fail with "No nodes found in workflow" even for valid API-format workflows because they use `mcp_websocket` JSON parsing which doesn't handle certain Unicode or whitespace patterns. Use direct REST API for workflow execution instead. The `run_workflow.py` script and the raw `POST /api/prompt` approach both work reliably.

## Verification Checklist

Use `python3 scripts/health_check.py` to run the whole list at once. Manual:

- [ ] `hardware_check.py` verdict is `ok` OR the user explicitly chose Comfy Cloud
- [ ] `comfy --version` works (or `uvx --from comfy-cli comfy --help`)
- [ ] `curl http://HOST:PORT/system_stats` returns JSON
- [ ] `comfy model list` shows at least one checkpoint (local) OR
      `/api/experiment/models/checkpoints` returns models (cloud)
- [ ] Workflow JSON is in API format
- [ ] `check_deps.py` reports `is_ready: true` (or only `node_check_skipped`
      on cloud free tier)
- [ ] Test run with a small workflow completes; outputs land in `--output-dir`
