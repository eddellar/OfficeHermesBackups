# LTX Video Debugging Guide

## Symptom: 400 Bad Request on LTX workflows

**Error pattern:**
```
Workflow execution failed: Request failed with status code 400: Bad Request
```

**Diagnosis step — find exact node causing 400:**
```python
import json, urllib.request
with open('PATH_TO_WORKFLOW_JSON') as f:
    wf = json.load(f)
data = json.dumps({'prompt': wf}).encode()
req = urllib.request.Request('http://127.0.0.1:8188/prompt', data=data,
    headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode()[:2000])  # contains node_id and bad value
```

**Common causes:**

1. **Model path mismatch** (most common, 2026-05-08)
   - Error: `ckpt_name: 'LTX-2.3\\...' not in ['LTX2.3\\...']`
   - Fix: `sed -i 's/LTX-2\.3\\/LTX2.3\\/g'` on all workflow JSON copies
   - Then restart ComfyUI to rescan model list

2. **Missing model file**
   - Error: `model_not_found` or similar
   - Fix: verify at expected path (see SKILL.md Section: LTX Model Path)

3. **Image aspect ratio / resolution not supported**
   - LTX I2V may reject unusual aspect ratios
   - Fix: use standard preset sizes (768×512, 1280×704, 1920×1088)

## Confirm LTX Video is Working

```bash
comfyui-skill generate --workflow ltx_23_t2v_distill \
  -p "A beautiful red apple on a tree, gentle wind, golden hour light" \
  --width 768 --height 512
```

If this succeeds, LTX is working. Then try with full prompt.

## Video Generation — Current State (2026-05-09)

**TL;DR: For video, use `ltx_23_t2v_distill` via `comfyui-skill`. Wan 2.2 T2V is blocked at the API level.**

### Wan 2.2 T2V — blocked
- `WanVideoModelLoader` only accepts these Wan 2.2 models: `Wan2.2\Animate\Wan2.2-Animate-14B-Q6_K.gguf`
- `Wan2.2\T2V\wan2.2_t2v_high_noise_14B_fp16.safetensors` and `wan2.2_t2v_low_noise_14B_fp16.safetensors` are NOT in the allowed list — HTTP 400
- `Wan2TextToVideoApi` (the single-node API node) returns "Prompt has no outputs" when submitted via REST `/prompt` — it uses ComfyUI 1.x UUID format that the REST API cannot parse
- The "Text to Video (Wan 2.2)" blueprint is UUID-based, not standard node connections — cannot be executed via REST API

### LTX 2.3 — audio nodes broken, but CLI workflow works
- Full LTX 2.3 with audio nodes (`LTXVAudioVAEDecode`, `LTXVLatentUpsampler`) crashes: tensor dimension mismatch (1408 vs 128) and `AudioVAE.per_channel_statistics` missing
- **However**, `comfyui-skill generate --workflow ltx_23_t2v_distill` works correctly (the skill's JSON has the correct model path)
- Use `comfyui-skill generate --workflow ltx_23_t2v_distill -p "..." --width 720 --height 1280` for video

### DO NOT use direct REST API for video
- Direct `/prompt` calls fail for both LTX (audio nodes) and Wan 2.2 (model not in list)
- Always use `comfyui-skill generate --workflow ltx_23_t2v_distill ...` for video generation
- `comfyui-skill generate -p "..."` defaults to `z_image_turbo` for images (confirmed working)
