# ComfyUI Instance Discovery & Output Path Resolution

## Two ComfyUI Instances on This Machine

| Instance | Path | Role | Output dir |
|----------|------|------|------------|
| **Mie V8.0 (active)** | `E:\\ComfyUI_Mie_2026_V8.0` | Image/video/music generation | `ComfyUI/output/` ✅ real files |
| **Portable** | `E:\\ComfyUI_windows_portable` | MCP工具连接，部分稀疏模型 | `ComfyUI/output/` ❌ broken (placeholder file) |

## Mie V8.0 Startup

**Default launch script (user-specified, 2026-05-12):**
```
E:\ComfyUI_Mie_2026_V8.0\run_nvidia_gpu_fast_fp16_accumulation.bat
```
This bat has been modified to include `--listen 0.0.0.0 --port 8188` so WSL can access it.

**To start from WSL:**
```bash
/mnt/c/Windows/System32/cmd.exe /c "cd /d E:\ComfyUI_Mie_2026_V8.0 && start /b run_nvidia_gpu_fast_fp16_accumulation.bat"
```

**How to discover which instance is active:** check the ComfyUI server at `http://127.0.0.1:8188` — the Mie instance serves generation requests. The portable instance's `output/` directory contains only `_output_images_will_be_put_here` (a placeholder file, not a directory), so generated images won't appear there even if the workflow references it.

**Mie V8.0 instance paths of interest:**
```
E:\\ComfyUI_Mie_2026_V8.0\\ComfyUI\\output\\          ← images land here
E:\\ComfyUI_Mie_2026_V8.0\\ComfyUI\\models\\checkpoints\\SD1.5\\  ← MajicmixRealistic_v7.safetensors
E:\\ComfyUI_Mie_2026_V8.0\\ComfyUI\\models\\diffusion_models\\Flux\\Flux.2-Klein\\  ← flux-2-klein-9b-Q6_K.gguf
```

**Confirmed working (2026-05-13):** ComfyUI 0.20.1, PyTorch 2.10.0+cu130, RTX 5090 32GB, fp16 accumulation enabled, comfy-aimdo 0.2.14, comfy-kitchen 0.2.8, ComfyUI-Manager 3.39.2.

**⚠️ Z-Image-Turbo caveat:** `NunchakuZImageDiTLoader` crashes on Mie V8.0 with `KeyError: 'weight'` when loading `z_image_turbo_bf16.safetensors`. Use SD1.5 + MajicmixRealistic as fallback. See pitfall #12 in SKILL.md.

**Portable instance paths of interest:**
```
E:\ComfyUI_windows_portable\ComfyUI\models\diffusion_models\Z-Image-Turbo\z_image_turbo_bf16.safetensors
E:\ComfyUI_windows_portable\ComfyUI\models\diffusion_models\Flux\  ← subdirs exist but empty
```

## Z-Image-Turbo Checkpoint Location

Z-Image-Turbo lives in `diffusion_models/`, NOT `checkpoints/`:
```
ComfyUI/models/diffusion_models/Z-Image-Turbo/z_image_turbo_bf16.safetensors
```
The `CheckpointLoaderSimple` node will NOT find it — Z-Image-Turbo requires its own custom loader node (`NunchakuZImageDiTLoader` or similar), not the standard checkpoint loader. See pitfall #12 in SKILL.md and `references/zimage-turbo-workflow.md`.

## GET /history Endpoint Format (Critical)

The raw REST API behaves differently from what the ComfyUI docs suggest:

```python
# Direct GET /history/{prompt_id} — returns a LIST, not a dict
import urllib.request, json
req = urllib.request.Request("http://127.0.0.1:8188/history/abc-123")
with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read())  # list: [[8, prompt_id, {nodes}], ...]
    for item in data:
        if item[1] == prompt_id:
            status = item[2].get("status", {})
            outputs = item[2].get("outputs", {})
            break

# GET /history (all) — returns a DICT keyed by prompt_id
req = urllib.request.Request("http://127.0.0.1:8188/history")
with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read())  # {"prompt_id": {...}, ...}
```

The MCP tool `get_history` normalizes this to a dict. Raw REST callers must handle both shapes.

## Output Path Resolution When get_output_path Fails

The MCP `get_output_path` tool often returns wrong paths. Fallback strategy (in order):

1. **MCP `get_history`** — returns filename + `subfolder` from `SaveImage` node output
2. **Direct `GET /view`** — always resolves correctly:
   ```python
   fname = "01_kawaii_cat_00001_.png"
   req = urllib.request.Request(
       f"http://127.0.0.1:8188/view?filename={fname}&type=output"
   )
   with urllib.request.urlopen(req, timeout=10) as resp:
       img_data = resp.read()
   with open("/tmp/output.png", "wb") as f:
       f.write(img_data)
   ```
3. **Filesystem search** — `find /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output -name "*.png" -mmin -30`

## Template + Checkpoint Compatibility

| Template | Works with | Fails with |
|----------|-----------|------------|
| `txt2img_sd15` | SD1.5 checkpoints (majicmix, etc.) | SDXL, Flux checkpoints |
| `txt2img_sdxl` | SDXL checkpoints | SD1.5 checkpoints (path validation fails) |
| `z_image_turbo` (blueprint) | Z-Image-Turbo custom nodes | Standard SD checkpoints |

When a mismatch occurs: `400 Bad Request` with `"Value not in list"` for `ckpt_name`. Fix: switch to a compatible template or use `comfyui-agent-skill-mie` CLI which has registered workflow configs that handle compatibility internally.
