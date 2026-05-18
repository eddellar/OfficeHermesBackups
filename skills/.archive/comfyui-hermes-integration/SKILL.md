---
name: comfyui-hermes-integration
description: |
  Connect Hermes Agent to ComfyUI v0.20.1 running on Windows (port 8188, single instance).
  Covers: network setup (WSL→Windows), ComfyUI-Manager v4.2.1 pip install, VRAM management,
  LTX 2.3 T2V workflow (primary local T2V), Wan 2.2 native nodes, and the complete v0.20.1
  node landscape (692 nodes: 30+ T2V/I2V options including ByteDance2, Kling, HunyuanVideo,
  Moonvalley, Minimax, Vidu, Luma, Pixverse, CogVideoX). Includes LTXV2 upgrade path.
version: 2.1.0
license: Apache-2.0
platforms: [windows, linux, wsl]
prerequisites:
  commands: ["curl"]
  env_vars: []
metadata:
  hermes:
    tags: [comfyui, image-generation, video-generation, workflow, ltx, wan22, flux, comfy-cli]
    related_skills: [comfyui, comfyui-skill-openclaw]
---

# ComfyUI + Hermes Integration

## Single Instance — Port 8188

```
Hermes (WSL) → ComfyUI v0.20.1 (Windows, port 8188)
                   │
                   └── E:\ComfyUI_windows_portable (single instance)
                         • Models: E:\ComfyUI_windows_portable\ComfyUI\models\
                         • Launch: run_nvidia_gpu_fast_fp16_accumulation.bat
```

**端口固定 8188**，其他端口均已下线。

## Quick Start

### 检查 ComfyUI 状态
```bash
curl http://localhost:8188/system_stats
# 返回版本+VRAM信息 → 在线
```

### 启动（如未运行）
```bash
# 方式1：直接启动（常用）
cd /mnt/e/ComfyUI_windows_portable
./python_embeded/python.exe -s ComfyUI/main.py --windows-standalone-build \
  --listen 0.0.0.0 --port 8188 --enable-cors-header \
  --disable-smart-memory --disable-auto-launch

# 方式2：官方 comfy-cli（Hermes v0.12+ 内置 skill 使用）
# 先跑 hardware_check 确认 local vs cloud：
python3 ~/.hermes/skills/creative/comfyui/scripts/hardware_check.py
# 再用 comfy-cli 管理：
comfy launch --listen 0.0.0.0 --port 8188
```

## LTX 2.3 T2V Workflow

**LTX 2.3 是主力本地 T2V 方案。**

### ✅ Working LTX 2.3 Local T2V Node Chain (verified 2026-05-03, v0.20.1)

> **No ModelSamplingLTXV node exists** — that entry in community docs is incorrect for v0.20.1. The checkpoint is loaded directly by KSampler.
>
> **VAE is embedded in checkpoint** — `CheckpointLoaderSimple` outputs VAE at index `[2]`, no separate VAE file needed.
>
> **⚠️ CLIP from CheckpointLoaderSimple is NOT usable for LTX 2.3.** Must use `LTXAVTextEncoderLoader`.

```
Node 2:  CheckpointLoaderSimple
           ckpt_name="LTX2.3\\ltx-2.3-22b-dev-fp8.safetensors"
           ├─ MODEL  [0] ──────────────────────────────→ KSampler
           └─ VAE    [2] ──────────────────────────────→ VAEDecode

Node 3:  LTXAVTextEncoderLoader
           ckpt_name="LTX2.3\\ltx-2.3-22b-dev-fp8.safetensors"
           text_encoder="gemma_3_12B_it_fp4_mixed.safetensors"
           device="default"
           └─ CLIP   [0] ──────────────────────────────→ CLIPTextEncode

Node 4:  CLIPTextEncode (positive)  ← clip=[3, 0]
Node 5:  CLIPTextEncode (negative)  ← clip=[3, 0]

Node 6:  EmptyLTXVLatentVideo
           width=720, height=1280, length=120, batch_size=1
           └─ LATENT [0] ──────────────────────────────→ KSampler

Node 7:  LTXVConditioning
           positive=[4, 0], negative=[5, 0], frame_rate=24.0
           └─ CONDITIONING [0]=positive, [1]=negative → KSampler

Node 8:  KSampler
           model=[2, 0]          ← direct from CheckpointLoader (NOT from ModelSamplingLTXV)
           positive=[7, 0]
           negative=[7, 1]
           latent_image=[6, 0]
           steps=40, cfg=4.0, sampler_name="euler_ancestral", scheduler="sgm_uniform"
           denoise=1.0, seed=<random>

Node 9:  VAEDecode
           samples=[8, 0], vae=[2, 2]

Node 10: CreateVideo
           images=[9, 0], fps=24.0

Node 11: SaveVideo
           video=[10, 0], filename_prefix="output_name", format="mp4", codec="h264"
```

**Python API submission:**
```python
import urllib.request, json, random

prompt = {
    "2": {"class_type": "CheckpointLoaderSimple",
          "inputs": {"ckpt_name": "LTX2.3\\ltx-2.3-22b-dev-fp8.safetensors"}},
    "3": {"class_type": "LTXAVTextEncoderLoader",
          "inputs": {"ckpt_name": "LTX2.3\\ltx-2.3-22b-dev-fp8.safetensors",
                     "text_encoder": "gemma_3_12B_it_fp4_mixed.safetensors",
                     "device": "default"}},
    "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "English prompt...", "clip": ["3", 0]}},
    "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality...", "clip": ["3", 0]}},
    "6": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": 720, "height": 1280, "length": 120, "batch_size": 1}},
    "7": {"class_type": "LTXVConditioning", "inputs": {"positive": ["4", 0], "negative": ["5", 0], "frame_rate": 24.0}},
    "8": {"class_type": "KSampler", "inputs": {
        "model": ["2", 0], "seed": random.randint(0, 0xFFFFFFFFFFFFFFFF),
        "steps": 40, "cfg": 4.0, "sampler_name": "euler_ancestral",
        "scheduler": "sgm_uniform", "positive": ["7", 0], "negative": ["7", 1],
        "latent_image": ["6", 0], "denoise": 1.0}},
    "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["2", 2]}},
    "10": {"class_type": "CreateVideo", "inputs": {"images": ["9", 0], "fps": 24.0}},
    "11": {"class_type": "SaveVideo", "inputs": {"video": ["10", 0], "filename_prefix": "output", "format": "mp4", "codec": "h264"}},
}
data = json.dumps({"prompt": prompt}).encode()
req = urllib.request.Request("http://127.0.0.1:8188/api/prompt", data=data,
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    pid = json.load(resp)["prompt_id"]
print(f"Submitted: {pid}")
```

**⚠️ Network: Use `http://127.0.0.1:8188` from WSL.** `http://192.168.1.2:8188` is blocked by Windows Firewall. ComfyUI binds to `0.0.0.0:8188` on Windows; WSL accesses it via `127.0.0.1` (localhost loopback).

**⚠️ Prompt language: Use English.** LTX was trained on English captions. Short Chinese prompts generate people instead of landscapes. Structure prompts as a cinematographer's shot list.

**Structure prompts as a cinematographer's shot list:**
```
Pink peach blossoms in full bloom on a gentle hillside,
soft petals drifting down in a light spring breeze,
slowly falling onto the still surface of a peaceful lake creating gentle ripples,
warm golden sunlight illuminating the scene from the side,
camera slowly pushes forward through the flower grove,
distant green mountains and blue sky with white clouds in the background,
tranquil and serene atmosphere, cinematic wide shot, soft focus background
```

### Recommended Params
| Parameter | Value |
|-----------|-------|
| CFG | 3.0–4.0 (LTX dislikes high CFG; 4.0 is safe upper bound) |
| Steps | 40+ (quality) |
| Resolution | ≤ 720×1280 (竖屏 9:16), divisible by 32 |
| Frames (length) | 120 (5s @ 24fps) — verified on RTX 5090 32GB |
| Sampler | `euler_ancestral` (slight randomness good for mist/steam) |
| Scheduler | `sgm_uniform` (video-optimized) |
| ModelSamplingLTXV | base_shift=0.85, max_shift=1.80 (写意风格) |

---

## Wan 2.2 — Critical Clarification

> ⚠️ **`comfyui_wan_video` does NOT exist.** The node types `LoadWanVideoT5TextEncoder`, `WanVideoSampler`, `WanVideoModelLoader`, `WanVideoTextEncode`, `WanVideoEmptyEmbeds`, `WanVideoVAELoader`, `WanVideoDecode` referenced in community workflow files **do not exist in any known package** — not in base ComfyUI v0.20.1, not in any custom node. If a workflow uses these nodes, it has never been runnable locally.

**Actual Wan 2.2 options in v0.20.1:**

| Node | Type | Local? | Notes |
|------|------|--------|-------|
| `WanAnimateToVideo` | T2V sampler | ✅ Yes | Pure T2V, accepts `positive`/`negative` CONDITIONING + `vae`, no model input needed |
| `WanTextToVideoApi` | T2V | ❌ Cloud only | Returns 401 Unauthorized locally |
| `Wan2TextToVideoApi` | T2V | ❌ Cloud only | Returns 401 Unauthorized locally |
| `Wan22ImageToVideoLatent` | I2V prep | ✅ Yes | For image-to-video latent preparation |
| `LTXVImgToVideo` | I2V | ✅ Yes | LTX image-to-video |

**For 素笺漫拾 pure T2V:** Use LTX 2.3 (`LtxvApiTextToVideo`) — it is the only locally-working pure text-to-video solution. Wan `WanAnimateToVideo` requires a start image (I2V workflow), not pure T2V.

### Actual Wan 2.2 Local Nodes

| class_type | Purpose | Notes |
|---|---|---|
| `WanAnimateToVideo` | Main T2V sampler | Pure T2V (no start image needed), accepts `positive`/`negative` CONDITIONING + `vae` |
| `Wan22ImageToVideoLatent` | I2V latent prep | For image-to-video workflows |
| `WanI2VLoraLoader` | Load I2V LoRA | |
| `LTXVImgToVideo` | LTX I2V | Image-to-video with LTX 2.3 |

### ⚠️ `*Api` Nodes — Cloud-Only (401 Unauthorized locally)
| Node | Error if used locally |
|---|---|
| `WanTextToVideoApi` | "Unauthorized: Please login first" |
| `Wan2TextToVideoApi` | Same |
| `WanImageToVideoApi` | Same |

These return 401 because they route to Comfy Cloud authentication. They are useless for local generation.

### Wan 2.2 Video Generation Options in v0.20.1

**For 素笺漫拾 (pure text-to-video):** Use `WanAnimateToVideo` with `WanVideoTextEncode` for text conditioning.

**For reference/control:** `Wan22ImageToVideoLatent` accepts a start image and produces latent motion vectors.

**LoRA ecosystem (HuggingFace: Kijai/WanVideo_comfy, 6M downloads):**
- Wan22-Lightning/ — 4-step distilled LoRAs (HIGH/LOW rank)
- Wan22-Turbo/ — Turbo TI2V LoRAs
- Lightx2v/ — CFG step distillation LoRAs (T2V + I2V)
- Fun/ — VACE module for video editing/composition
- CineScale/ — camera motion control LoRAs
- SVI/ — Stable-Video-Infinity extended motion LoRAs

### Other Native T2V Nodes in v0.20.1

| Node | Type | Notes |
|---|---|---|
| `ByteDance2TextToVideoNode` | T2V | ByteDance MiniMax |
| `KlingTextToVideoNode` | T2V | Kuaishou Kling |
| `MoonvalleyTxt2VideoNode` | T2V | Moonvalley |
| `MinimaxTextToVideoNode` | T2V | MiniMax (Hailuo) |
| `PixverseTextToVideoNode` | T2V | Pixverse |
| `HunyuanVideo15ImageToVideo` | I2V | Tencent Hunyuan |
| `Vidu3TextToVideoNode` | T2V | Vidu |
| `RunwayTextToImageNode` | T2V | Runway |
| `LumaVideoNode` | T2V/I2V | Luma Dream Machine |

### T2V VAE — Must Use 16ch Version
The bundled VAE is 48ch I2V. Use the T2V VAE from `Wan-AI/Wan2.2-T2V-A14B-Diffusers`:
- Path: `models/vae/Wan_2.2\\wan2.2_t2v_vae.safetensors`
- Channel check: `conv_in.weight` should be `[16, 384, 3, 3, 3]`

---

## VRAM Management

RTX 5090 32GB + RTX 5070 Ti 16GB:

### `--disable-cuda-malloc` (REQUIRED)
The `comfy-aimdo` package's `cudaMallocAsync` causes wildly incorrect VRAM reporting.
- Edit `launcher/config.json`, set `"extra_args": "--disable-cuda-malloc"`
- Verify: `GET /system_stats` shows `allocator: "native"`

### `--novram` for Dual-Model Workflows
When using both high_noise + low_noise Wan models simultaneously:
- `"vram_mode": "--novram"` in `launcher/config.json`

### Frame Count vs VRAM
| Frames | Resolution | Notes |
|--------|------------|-------|
| 13 | 832×480 | Safe for 32GB at 5 steps |
| 25 | 832×480 | Near VRAM limit |
| 81 | any | Requires FP8 models |

---

## Process Management

### Check Running Instance
```bash
curl -s --connect-timeout 2 http://localhost:8188/system_stats | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f'ComfyUI-{d[\"system\"][\"comfyui_version\"]} VRAM {d[\"devices\"][0][\"vram_free\"]//1024**3}GB free')"
```

### Kill All ComfyUI
```bash
# Find PIDs
ps aux | grep -iE "comfyui.*main|python.*comfyui" | grep -v grep | awk '{print $2}'

# Kill parents first, then children
kill <bash_wrapper_pid>
sleep 1
kill -9 <init_child_pid>
```

---

## Comfy Cozy (MCP)

JosephOIbrahim/Comfy-Cozy — AI co-pilot for ComfyUI, 114 tools.

**Status (as of 2026-05-01):** ComfyUI Manager (`ltdrdata/ComfyUI-Manager`) and `comfyanonymous/ComfyUI_TensorRT` are now cloned to `Custom_Nodes/`. Both require **ComfyUI restart** to take effect. Manager provides registry data for node discovery and one-click installs.

**Config (`E:\ComfyUI_windows_portable\ComfyUI\Custom_Nodes\ComfyUI-Manager\.git\`):** Manager registry files:
- `custom-node-list.json` — community node index
- `extension-node-map.json` — node-to-pack mapping
- `model-list.json` — community model index

**ComfyUI Manager v4.x — pip package, NOT a custom node：**

ComfyUI-Manager v4.x (4.0+) 是 pip 包，不进 `custom_nodes/`。它通过 `--enable-manager` 参数从 Python site-packages 加载。

⚠️ **v3.x → v4.x 重大变化：**
- v3.x：git clone 到 `Custom_Nodes/`，ComfyUI 自动扫描加载
- v4.x：pip 安装到 embedded Python，通过 `--enable-manager` 显式加载
- v4.x 根目录没有 `__init__.py`（不是 custom node）

**安装步骤：**

```bash
# 1. 删除 custom_nodes 里的旧 Manager（v4.x 不在这里！）
rm -rf /mnt/e/ComfyUI_windows_portable/ComfyUI/Custom_Nodes/ComfyUI-Manager

# 2. 克隆到临时目录（不要放 custom_nodes 里！）
git clone --branch 4.2.1 --depth=1 https://github.com/ltdrdata/ComfyUI-Manager.git \
  /mnt/e/ComfyUI_temp_Manager

# 3. pip install 到 embedded Python
cd /mnt/e/ComfyUI_temp_Manager
/mnt/e/ComfyUI_windows_portable/python_embeded/python.exe -m pip install . --quiet

# 4. 验证安装
/mnt/e/ComfyUI_windows_portable/python_embeded/python.exe -c \
  "import comfyui_manager; print(comfyui_manager.__file__)"
# 输出应包含 site-packages/comfyui_manager/__init__.py

# 5. 确认版本 tag 正确（Manager tag 是 "4.2.1"，没有 v 前缀！）
git -C /mnt/e/ComfyUI_temp_Manager describe --tags
```

**启动参数（必须同时加两个标志）：**
```batch
# 在 run_nvidia_gpu_fast_fp16_accumulation.bat 中添加：
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build ... --enable-manager --enable-manager-legacy-ui
```

> ⚠️ **Both flags required:** `--enable-manager` 加载 Manager 后端（API 端点）。`--enable-manager-legacy-ui` 注册前端 JavaScript 到 `/extensions/comfyui-manager-legacy/`。缺少 `--enable-manager-legacy-ui` 会导致 Manager API 正常工作，但浏览器里不出现 Manager UI 图标。

**验证 Manager 加载成功：**
```bash
# Manager API 端点应该返回 200（不再是 404）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8188/v2/manager/queue/status
# 输出 200 即成功

# 前端扩展列表中应该有 manager
curl -s http://127.0.0.1:8188/api/extensions | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('Manager found:', any('manager' in e for e in d))"
```

**诊断：**
- 启动报 "package must be installed first" → pip install 没成功或路径不对
- `/api/extensions` 无 Manager 条目 → `--enable-manager` 没加或 Manager 未正确安装
- Manager API 全 404 → 确认 pip install 成功 + 加了 `--enable-manager` + 重启了 ComfyUI

重启 ComfyUI 后 Manager UI 应该正常。

**TensorRT 节点未注册：** 代码已克隆，但 `tensorrt>=10.0.1` Python 库未装。ComfyUI embedded Python 3.13 的 pip 有 `BackendUnavailable` 问题（wheel_stub.buildapi 损坏），直接 `pip install tensorrt` 会报 `Cannot import 'wheel_stub.buildapi'`。

**绕过方法（已验证成功）：** 从 WSL 用完整 Windows 路径调用 embedded Python 并加 `--no-build-isolation`：

```bash
python3 -m pip install tensorrt \
  --extra-index-url https://pypi.nvidia.com \
  --no-build-isolation
```

原理：embedded Python 的 pip 26.1 wheel builder 损坏，但 `tensorrt_cu13_libs` 是预编译的 1.9GB wheel（无需 build），`--no-build-isolation` 跳过源码编译步骤，直接装 wheel。

安装后重启 ComfyUI，`Load TensorRT Engine` 和 `TensorRTLoader` 节点才会出现。

**Config (`E:\\ComfyUI_windows_portable\\ComfyUI\\Custom_Nodes\\ComfyUI-Manager\\.git\\`):** Manager registry files:
- `custom-node-list.json` — community node index
- `extension-node-map.json` — node-to-pack mapping
- `model-list.json` — community model index

**Config (`E:\Comfy-Cozy\.env`):**
```bash
COMFYUI_PORT=8188
COMFYUI_DATABASE=E:/ComfyUI_windows_portable/ComfyUI
ANTHROPIC_API_KEY=***
```

**Wrapper script** (`E:\Comfy-Cozy\run_mcp.sh`):
```bash
#!/bin/bash
cd /mnt/e/Comfy-Cozy
export COMFYUI_DATABASE="E:/ComfyUI_windows_portable/ComfyUI"
exec python3 -m agent.cli mcp
```

Add to Hermes:
```bash
hermes mcp add comfy-cozy -- bash /mnt/e/Comfy-Cozy/run_mcp.sh
```

---

## Troubleshooting

### `CLIPTextEncode: clip input is invalid`
**Root cause:** Using `CheckpointLoaderSimple`'s CLIP slot for LTX 2.3 — it outputs `None` for LTX checkpoints because LTX doesn't use a CLIP text encoder internally.
**Fix:** Use `LTXAVTextEncoderLoader` + `gemma_3_12B_it_fp4_mixed.safetensors` for all `CLIPTextEncode` nodes.

### `execute_workflow` MCP returns HTTP 500
**Symptoms:** `mcp_comfy_cozy_execute_workflow` returns `HTTP 500: 500 Internal Server Error` repeatedly, but `get_system_stats` shows ComfyUI is running fine with plenty of VRAM.

**Root cause:** The MCP tool's internal workflow context may not be correctly loaded, or the tool has a known failure mode with the current payload.

**Workaround:** Bypass the MCP tool entirely. Submit the workflow directly via Python REST API:

```python
import urllib.request, json, random
# (use the Python API Submission code block from this skill)
# Then poll with:
#   GET http://localhost:8188/history/{prompt_id}
# Or use MCP: mcp_comfy_cozy_get_execution_status(prompt_id="...")
```

**Reliable pattern:** Always prefer direct REST API submission via `execute_code` for sequential multi-shot generation. Use MCP tools only for status checks and file discovery.

### `/prompt` returns HTTP 500
Check for float values in payload — `apply_replacements` crashes on ints vs floats. Use Python `int()` explicitly for all integer fields.

### Reliable Status Polling for Sequential Multi-Shot Generation
**`/prompt/{prompt_id}` returns 404** — this endpoint does not work for status lookups.

**Correct approach: combine `/queue` + `/history`**
```python
def poll_all_statuses(prompt_ids):
    req = urllib.request.Request("http://localhost:8188/queue",
        headers={"Content-Type": "application/json"}, method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    running = {item[1] for item in data.get("queue_running", [])}
    pending = {item[1] for item in data.get("queue_pending", [])}

    req2 = urllib.request.Request("http://localhost:8188/history?limit=20",
        headers={"Content-Type": "application/json"}, method="GET")
    with urllib.request.urlopen(req2, timeout=10) as resp:
        history = json.loads(resp.read())

    statuses = {}
    for name, pid in prompt_ids.items():
        if pid in running:
            statuses[name] = "running"
        elif pid in pending:
            statuses[name] = "pending"
        elif pid in history and history[pid].get("status", {}).get("status_str") == "success":
            statuses[name] = "completed"
        else:
            statuses[name] = "unknown"
    return statuses
```

**Key insight:** When submitting 3 shots sequentially, ALL appear in the queue at once. `queue_running[0]` = currently executing, `queue_pending` = waiting. They clear from queue as they complete and move to history.

### `mcp_comfy_cozy_execute_workflow` MCP returns HTTP 500
See: "execute_workflow MCP returns HTTP 500" workaround above. **Always use direct REST API via `execute_code` for sequential multi-shot generation.** Use MCP tools only for status checks and file discovery.

### VRAM OOM — "Allocation would exceed"
Check real VRAM first: `GET /system_stats` → `vram_free`. If > 25GB free, it's comfy-aimdo false alarm. Apply `--disable-cuda-malloc`.

### Wan 2.2 produces empty/degenerate video
- Check VAE: must be the 16ch T2V VAE, not the 48ch I2V VAE
- Check `WanVideoSampler.riflex_freq_index`: must be `0` for T2V

### `CLIPTextEncode: clip input is invalid`
Using wrong text encoder. For LTX: must use `LTXAVTextEncoderLoader`, not checkpoint's CLIP slot.

## Model Locations

## Model Locations

| Model | Path |
|-------|------|
| LTX 2.3 FP8 | `E:\ComfyUI_windows_portable\ComfyUI\models\checkpoints\LTX2.3\` |
| LTX text encoder | `E:\ComfyUI_windows_portable\ComfyUI\models\text_encoders\LTX-2\` |
| Wan 2.2 T2V | `E:\ComfyUI_windows_portable\ComfyUI\models\diffusion_models\Wan2.2\T2V\` |
| Wan 2.2 VAE (T2V) | `E:\ComfyUI_windows_portable\ComfyUI\models\vae\Wan_2.2\` |
| Wan text encoder | `E:\ComfyUI_windows_portable\ComfyUI\models\text_encoders\` |
