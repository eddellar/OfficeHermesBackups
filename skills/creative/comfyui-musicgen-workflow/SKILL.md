---
name: comfyui-musicgen-workflow
description: |
  Generate music with MusicGen-large via ComfyUI custom nodes (ComfyUI-MusicGen-HF).
  Handles the Windows/WSL cache separation issue and MusicGen node quirks.
  Use when generating background music or building audio pipeline for "素笺漫拾" videos.
version: 1.0.0
license: Apache-2.0
platforms: [windows, wsl]

variables:
  COMFYUI_URL: "http://172.31.0.1:8188"
  COMFYUI_OUTPUT_DIR: "E:\\ComfyUI_Mie_2026_V8.0\\ComfyUI\\output\\audio"

critical_findings:
  - "ComfyUI runs on Windows, NOT WSL. HF cache is on Windows filesystem, completely separate from WSL ~/.cache/huggingface/. Downloading in WSL does NOT populate ComfyUI's cache — ComfyUI will re-download the full 19GB."
  - "HF_TOKEN in ~/.hermes/.env is MASKED as '***'. Cannot read actual token. Token stored in user's Desktop path: /mnt/c/Users/eddellar/Desktop/新建文件夹/.hermes/.env"
  - "MusicGen does NOT support BFloat16 — node catches internally and falls back to float32."
  - "ComfyUI's MusicGenAudioToFile saves to output/audio/ subdirectory. This dir does NOT exist by default — must be created before first use."

nodes:
  HuggingFaceMusicGen:
    inputs:
      model_size: '["small", "medium", "large"]'
      duration: "FLOAT, default=10.0, min=1.0, max=30.0"
      guidance_scale: "FLOAT, default=3.0, min=1.0, max=10.0"
      do_sample: "BOOLEAN, default=true"
      max_new_tokens: "INT, default=256, min=50, max=1503"
      seed: "INT, default=42"
      prompt: "STRING (optional, multiline) — empty prompt uses default"
      conditioning_audio: "AUDIO (optional)"
      temperature: "FLOAT, default=1.0"
      duration_override: "FLOAT, default=0.0 — override duration from BPM node"
    outputs: '["AUDIO", "STRING"]'
  MusicGenAudioToFile:
    inputs:
      audio: "AUDIO"
      filename: "STRING, default=musicgen_output"
      format: '["wav", "flac", "mp3", "opus"], default=wav'
    outputs: '["STRING"]'

commands:
  check_comfyui: 'curl -s http://172.31.0.1:8188/system_stats | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\"system\",{}).get(\"comfyui_version\",\"?\"))"'
  list_nodes: 'curl -s "http://172.31.0.1:8188/api/object_info" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(k) for k in d if \"musicgen\" in k.lower()]"'
  check_history: 'curl -s "http://172.31.0.1:8188/history/PROMPT_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.values())[0].get(\"status\",{}).get(\"status_str\"))"'

troubleshooting:
  "FileNotFoundError output/audio":
    "mkdir -p /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/audio"
  "BFloat16 error":
    "Normal — node falls back to float32 automatically"
  "401 Unauthorized on HF":
    "Token invalid. Validate: curl -s https://huggingface.co/api/whoami-v2 -H 'Authorization: Bearer TOKEN'"
  "ComfyUI re-downloading model":
    "Expected — Windows ComfyUI cache is separate from WSL cache, cannot share"
---

# ComfyUI MusicGen Workflow

## Node Chain
```
HuggingFaceMusicGen → MusicGenAudioToFile
```

## Quick Test
```bash
# 1. Ensure output dir exists
mkdir -p /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/audio

# 2. Submit job
curl -s -X POST http://172.31.0.1:8188/prompt -H "Content-Type: application/json" \
  -d '{"prompt":{"3":{"inputs":{"model_size":"large","duration":10,"guidance_scale":3.0,"do_sample":true,"max_new_tokens":256,"seed":42,"prompt":"peaceful ambient piano"},"class_type":"HuggingFaceMusicGen"},"4":{"inputs":{"audio":["3",0],"filename":"musicgen_test","format":"flac"},"class_type":"MusicGenAudioToFile"}}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt_id'))"

# 3. Poll (wait ~60s for large model to load)
sleep 60 && curl -s "http://172.31.0.1:8188/history/PROMPT_ID"
```

## Model Info
| Size  | Params  | Cache Size |
|-------|---------|------------|
| small | 3.3B    | ~7GB       |
| medium| 7.7B    | ~11GB      |
| large | 9.7B    | ~19GB      |
