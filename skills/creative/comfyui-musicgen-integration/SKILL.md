---
name: comfyui-musicgen-integration
description: |
  Integrate Facebook MusicGen (text-to-music) into ComfyUI for AI-generated background music.
  Covers: node installation, model download (via WSL workaround), workflow configuration, and execution.
  Models: small (5.4GB), medium (11GB), large (19GB). RTX 5090 32GB can run large.
version: 1.0.0
license: Apache-2.0
platforms: [windows, wsl]
tags: [comfyui, music, audio-generation, musicgen, text-to-music]
prerequisites:
  commands: ["git"]
  env_vars: []
metadata:
  hermes:
    tags: [comfyui, music-generation, audio, musicgen, text-to-music]
    related_skills: [comfyui-hermes-integration, comfyui-skill-openclaw]
---

# ComfyUI MusicGen Integration

## Overview

Facebook's **MusicGen** (transformers-based) can be integrated into ComfyUI via the `ComfyUI-MusicGen-HF` custom node.
Produces significantly better music than `stable-audio-open-1.0` (which is a sound-effects model, not a music model).

## Architecture

```
Hermes (WSL) → ComfyUI (Windows) → MusicGen (transformers) → ComfyUI AUDIO format
                ↑                    ↑
          WSL gateway:          model cached in:
          172.31.0.1:8188      ~/.cache/huggingface/hub/
```

## Key Finding

> **Important**: ComfyUI's embedded Python 3.13 has SSL connectivity issues to HuggingFace 
> (`SSL EOF error`). Models must be downloaded via WSL's Python and then made accessible to ComfyUI.

## Step 1: Install Custom Node

```bash
cd /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/custom_nodes
git clone https://github.com/ebrinz/ComfyUI-MusicGen-HF.git
```

Nodes installed:
- `HuggingFaceMusicGen` — main text-to-music node
- `BPMDurationInput` — calculate duration from BPM + bars
- `LoopingAudioPreview` — preview generated audio
- `SaveAudioStandalone` — save as WAV/FLAC/MP3/Opus

## Step 2: Download Model via WSL (SSL workaround)

ComfyUI's embedded Python cannot access HuggingFace due to SSL errors. Use WSL's Python instead:

```bash
# WSL terminal (or use python3 from this skill)
python3 -c "
from huggingface_hub import snapshot_download
token = 'hf_YOUR_TOKEN'
path = snapshot_download(repo_id='facebook/musicgen-large', token=token)
print(path)
"
```

Model sizes (RTX 5090 32GB can load all):
| Model | Size | VRAM needed |
|-------|------|-------------|
| `facebook/musicgen-small` | 5.4 GB | ~6GB |
| `facebook/musicgen-medium` | 11 GB | ~12GB |
| `facebook/musicgen-large` | 19 GB | ~20GB |

Cache location: `~/.cache/huggingface/hub/models--facebook--musicgen-large/`

## Step 3: Make Model Available to ComfyUI

The model cache at `~/.cache/huggingface/hub/` should be accessible to ComfyUI's Python.
If ComfyUI can't see it (Windows↔WSL filesystem boundary), either:

**Option A**: Copy to a Windows-accessible path (slow for 19GB)
**Option B**: Keep cache in WSL, ComfyUI will re-download via its Python (may hit SSL issues again)

If re-downloading, ensure `HF_TOKEN` env var is set or pass `token=` explicitly.

## Step 4: Restart ComfyUI

Restart ComfyUI to load the new nodes. Verify with:
```bash
curl -s http://172.31.0.1:8188/api/object_info | python3 -c "
import sys,json; data=json.load(sys.stdin)
nodes = [k for k in data.keys() if 'HuggingFace' in k or 'MusicGen' in k]
print('MusicGen nodes:', nodes)
"
```

## Step 5: Execute via comfyui-skill or API

### Recommended Workflow (BPM → MusicGen → Preview → Save)

```
BPMDurationInput(120 BPM, 4 bars) 
  → HuggingFaceMusicGen(model=large, duration=auto, prompt="...")
  → LoopingAudioPreview 
  → SaveAudioStandalone
```

### HuggingFaceMusicGen Parameters

| Parameter | Default | Recommended | Notes |
|-----------|---------|-------------|-------|
| `model_size` | small | **medium** or large | large=best quality |
| `duration` | 10.0 | 10-30 | seconds |
| `guidance_scale` | 3.0 | 3.0-5.0 | higher=strict prompt following |
| `do_sample` | True | True | enables diversity |
| `max_new_tokens` | 256 | 512-1024 | affects audio length |
| `temperature` | 1.0 | 1.0 | only used when do_sample=True |
| `seed` | 42 | random | reproducibility |

### Submit via API

```bash
curl -s http://172.31.0.1:8188/api/prompt -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": {...}}'
```

### Submit via comfyui-skill

```bash
cd ~/.hermes/skills/creative/comfyui-skill-openclaw
comfyui-skill --json submit local/musicgen --args '{
  "model_size": "large",
  "prompt": "peaceful piano and violin duet in a forest at dawn",
  "duration": 15,
  "guidance_scale": 3.5,
  "seed": 42
}'
```

## Dependencies (Already Installed)

ComfyUI's embedded Python already has all required packages:
```
transformers, accelerate, scipy, torch, torchaudio, av, soundfile, librosa
```

## Troubleshooting

### MusicGen node not showing after install
- **Restart ComfyUI** — new custom nodes require restart to be registered
- Check node list: `curl http://172.31.0.1:8188/api/object_info | grep MusicGen`

### SSL errors when ComfyUI tries to download model
- **Normal** — ComfyUI's Python 3.13 has this issue
- **Solution**: Download via WSL first (`snapshot_download` with WSL python3), 
  then let ComfyUI use its local cache (may still fail if SSL persists)
- Alternative: Download in WSL to a path, copy to ComfyUI models folder

### CUDA out of memory with large model
- RTX 5090 32GB: large (19GB) fits with room to spare
- If OOM: reduce `max_new_tokens` or switch to `medium`

### Generated audio is too short
- `max_new_tokens` controls length. 50 tokens ≈ 1 second at 32kHz
- For 30s audio: `max_new_tokens` = 1500 (hard limit)
- Use `BPMDurationInput` node for precise loop timing

### Monotonous or poor quality output
- MusicGen is better at text descriptions than abstract prompts
- Use specific instrument names: "piano", "violin", "soft drums"
- Add mood descriptors: "peaceful", "melancholic", "uplifting"
- Try `do_sample=True` with `temperature=1.0-1.3`
- Consider generating multiple segments and concatenating with `AudioConcat`

## Comparison: MusicGen vs StableAudio

| | MusicGen | StableAudio Open |
|---|---|---|
| Model size | 5-19 GB | 4.6 GB |
| Purpose | **Music generation** | Sound effects |
| Quality | Much better for music | Limited, monotonous |
| Format | Transformers | Diffusers |
| License | CC-BY-NC-4.0 | Custom (Stability) |
| VRAM (large) | ~20GB | ~5GB |

**Recommendation**: Use MusicGen for video background music, StableAudio for sound effects only.

## Repositories & References

- ComfyUI Node: https://github.com/ebrinz/ComfyUI-MusicGen-HF (stars: 9)
- MusicGen Models: https://huggingface.co/facebook/musicgen-small | medium | large
- Paper: https://arxiv.org/abs/2306.05284
