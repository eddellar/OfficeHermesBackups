# LTX Video Generation Pipeline (素笺漫拾 Reference)

Working end-to-end pipeline for generating 6-segment × 5-second landscape videos
with LTX 2.3, using the local ComfyUI portable on Windows/WSL.

## Tested Pipeline (LTX 2.3 + LTXAVTextEncoderLoader)

### Node Chain

```
CheckpointLoaderSimple
  → model[0], clip[1], VAE[2]

LTXAVTextEncoderLoader (text_encoder=gemma_3_12B_it_fp4_mixed.safetensors)
  → clip[0]

CLIPTextEncode (positive)  ← text_encoder from LTXAVTextEncoderLoader
CLIPTextEncode (negative)  ← text_encoder from LTXAVTextEncoderLoader

EmptyLTXVLatentVideo (width=720, height=1280, length=120, batch_size=1)
  → latent

LTXVConditioning (positive, negative, frame_rate=24.0)

KSampler (euler_ancestral, sgm_uniform, steps=40, cfg=4.0, seed=N, denoise=1.0)

VAEDecode (samples, vae=VAE[2])

CreateVideo (images, fps=24.0)

SaveVideo (video, filename_prefix="...", format=mp4, codec=h264)
```

### Known-Good Parameters (素笺漫拾 Verified)

| Param | Value | Notes |
|-------|-------|-------|
| Resolution | 720×1280 | Portrait 9:16, ~26GB VRAM for 120 frames |
| Frames | 120 | 5 seconds @ 24fps |
| fps | 24.0 | |
| steps | 40 | |
| cfg | 4.0 | |
| sampler | euler_ancestral | |
| scheduler | sgm_uniform | |
| seed | per-segment (e.g. 2024001–2024006) | |
| denoise | 1.0 | |
| model | LTX2.3\\ltx-2.3-22b-dev-fp8.safetensors | 28GB, present at `E:\ComfyUI_Mie_2026_V8.0\ComfyUI\models\checkpoints\LTX2.3\` |
| text_encoder | gemma_3_12B_it_fp4_mixed.safetensors | 8.8GB |

### Output Files

```
E:\ComfyUI_Mie_2026_V8.0\ComfyUI\output\素笺漫拾\{主题名}\
```
  ├── 第2段_xxx_00001_.mp4
  └── ...
```

Merge to 30s with FFmpeg:
```bash
cd "E:\ComfyUI_Mie_2026_V8.0\ComfyUI\output\素笺漫拾\{主题名}"
ffmpeg -y -f concat -safe 0 -i <(for f in segment*.mp4; do echo "file '$PWD/$f'"; done) \
  -c:v libx264 -crf 18 -preset medium "../{主题名}_完整版.mp4"
```

## Common Errors

### 500 / AttributeError on `_meta`

```
AttributeError: 'str' object has no attribute 'get'
  File "ComfyUI/execution.py", line 1096, in validate_prompt
    node_title = node_data.get('_meta', {}).get('title')
```

**Cause:** `_meta: {"title": "..."}` or `_comment: "..."` in the workflow JSON.
**Fix:** Strip all `_meta` nodes and top-level `_comment` before submission.

### 500 on submission with "no_prompt"

**Cause:** Wrong payload wrapping. Must be `{"prompt": workflow_dict}`, not
`{"workflow": workflow_dict}` or `{"prompt": {"prompt": workflow_dict}}`.

## Video Merge (No Native Node)

ComfyUI has no "merge video files" node in this build. Options:

1. **FFmpeg concat demuxer** (preferred — no quality loss):
   ```bash
   ffmpeg -y -f concat -safe 0 -i <(for f in seg*.mp4; do echo "file '$PWD/$f'"; done) \
     -c:v libx264 -crf 18 -preset medium -c:a copy ../merged.mp4
   ```

2. **ComfyUI-Manager nodes** — search for `VideoConcat` or `VideoMerge` in
   ComfyUI-Manager's custom node list.

## 6-Segment Narrative Template

For 素笺漫拾 portrait 9:16 landscape videos (30s = 6×5s):

| Segment | Shot | Movement | Example |
|---------|------|---------|---------|
| 1 | 远景 (Wide) | Fixed / slow pan | Misty pond, full view |
| 2 | 全景 (Full) | Slow push | Camera pushes into scene |
| 3 | 中景 (Medium) | Lateral tracking | Walking along a walkway |
| 4 | 近景 (Close) | Slow orbit | Circling a flower/object |
| 5 | 特写 (Extreme close) | Push-in | Detail macro: petals, droplets |
| 6 | 远景 (Wide aerial) | Pull back + rise | Reveal full scene,收尾 |

Negative prompt (verified):
```
blurry, low quality, distorted, watermark, text, logo, signature, cropped,
out of frame, deformed, bad anatomy, bad proportions, extra limbs,
cloned face, studio lighting, artificial, synthetic, noise, oversaturated,
washed out, flat lighting, harsh shadows
```
