# Z-Image-Turbo Workflow Reference

**⚠️ WARNING — Mie V8.0 incompatibility (2026-05-13):** `NunchakuZImageDiTLoader` crashes with `KeyError: 'weight'` on Mie V8.0 when loading `Z-Image-Turbo\z_image_turbo_bf16.safetensors`. This is a node bug, not a workflow issue. **Use SD1.5 + MajicmixRealistic as fallback** for image generation on Mie V8.0.

## Verified Working Node Chain (non-Mie instances)

```
NunchakuZImageDiTLoader → CLIPLoader(type=lumina2) → CLIPTextEncodeLumina2
                                                        ↓
                                                  ConditioningZeroOut
                                                        ↓
                        EmptyLatentImage ← VAELoader(Flux\ae.sft)
                                                        ↓
                                                   KSampler
                                                    steps=8, cfg=1.0
                                                    sampler=euler_ancestral
                                                    scheduler=normal
                                                        ↓
                                                  VAEDecode
                                                        ↓
                                                 SaveImage
```

## API Format Workflow (for direct REST submission)

```python
import json, urllib.request, random

SERVER = "http://127.0.0.1:8188"

workflow = {
    "1": {
        "class_type": "NunchakuZImageDiTLoader",
        "inputs": {"model_name": "Z-Image-Turbo\\z_image_turbo_bf16.safetensors"}
    },
    "2": {
        "class_type": "CLIPLoader",
        "inputs": {"clip_name": "Qwen\\qwen_3_4b.safetensors", "type": "lumina2"}
    },
    "3": {
        "class_type": "CLIPTextEncodeLumina2",
        "inputs": {
            "system_prompt": "superior",
            "user_prompt": "your prompt here",
            "clip": ["2", 0]
        }
    },
    "4": {
        "class_type": "ConditioningZeroOut",
        "inputs": {"conditioning": ["3", 0]}
    },
    "5": {
        "class_type": "VAELoader",
        "inputs": {"vae_name": "Flux\\ae.sft"}
    },
    "6": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 832, "height": 1280, "batch_size": 1}
    },
    "7": {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0],
            "seed": random.randint(1, 999999999),
            "steps": 8,
            "cfg": 1.0,
            "sampler_name": "euler_ancestral",
            "scheduler": "normal",
            "positive": ["3", 0],
            "negative": ["4", 0],
            "latent_image": ["6", 0],
            "denoise": 1.0
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["7", 0], "vae": ["5", 0]}
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "output", "images": ["8", 0]}
    }
}

payload = json.dumps({"prompt": workflow}).encode("utf-8")
req = urllib.request.Request(
    f"{SERVER}/api/prompt",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(req, timeout=30) as resp:
    result = json.loads(resp.read())
prompt_id = result["prompt_id"]
```

## Common Errors

### `KeyError: 'weight'` at NunchakuZImageDiTLoader
- **Cause:** Bug in `unchaku/utils.py` — `quantization_config` dict missing `"weight"` key
- **Fix:** Switch to SD1.5 + MajicmixRealistic on Mie V8.0

### `return_type_mismatch` — received CONDITIONING, expected VAE
- **Cause:** Connected `CLIPTextEncodeLumina2` output directly to `VAEDecode.vae`
- **Fix:** `CLIPTextEncodeLumina2` outputs CONDITIONING only. Use a separate `VAELoader` node for the VAE input on `VAEDecode`

### White/blank output images
- **Cause:** Wrong VAE (e.g., `SD1.5\vae...`) for Z-Image latent space
- **Fix:** Use `Flux\ae.sft` VAE

## Output Image Download with Chinese Filenames

When saving images with Chinese characters in the filename (e.g., `turtle_小绿_00001_.png`), the URL must be URL-encoded:

```python
import urllib.parse

def get_view(fname):
    encoded = urllib.parse.quote(fname, safe='')
    req = urllib.request.Request(f"http://127.0.0.1:8188/view?filename={encoded}&type=output")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()
```

Without `urllib.parse.quote`, Python's `http.client` encodes the URL with ASCII and fails with `UnicodeEncodeError: 'ascii' codec can't encode characters`.

## Model Locations (Mie V8.0)

| Model | Path |
|-------|------|
| Z-Image-Turbo bf16 | `diffusion_models/Z-Image-Turbo/z_image_turbo_bf16.safetensors` |
| Qwen CLIP | `text_encoders/Qwen/qwen_3_4b.safetensors` |
| Flux ae VAE | `vae/Flux/ae.sft` |
| SD1.5 Majicmix | `checkpoints/SD1.5/majicmixRealistic_v7.safetensors` |
