---
name: musicgen-local-text-to-music
description: "Local MusicGen text-to-music generation via transformers + PyTorch + CUDA, output as WAV/MP3 for social media delivery."
version: 1.0.0
tags: [music, audio, generation, musicgen, transformers, local-ai, cuda, wechat-video, short-video]
triggers:
  - generate music with text description
  - local AI music generation
  - MusicGen text prompt
  - 生成背景音乐
  - 视频号配乐
  - 素笺漫拾 music
---

# MusicGen Local Text-to-Music

Generate music from text descriptions locally using Meta's MusicGen model via transformers + PyTorch + CUDA. Output is WAV/MP3 ready for social media (WeChat video, Feishu, etc.).

## When to Use

- User wants to generate music from a text prompt (style, mood, instruments)
- User wants an open-source local alternative to Suno API
- User wants to generate background music for short videos (WeChat video号, Douyin, etc.)
- User asks about MusicGen with text descriptions

## Environment Setup

**No extra installation needed** — Hermes Agent's venv already has everything:
- Python 3.11
- `transformers >= 5.0` (tested: 5.6.2)
- `torch >= 2.0` with CUDA (tested: 2.11.0+cu130)
- `scipy` for WAV writing

```bash
# Verify environment
/home/eddellar/.hermes/hermes-agent/venv/bin/python -c "import transformers; import torch; print('transformers:', transformers.__version__, '| torch:', torch.__version__, '| CUDA:', torch.cuda.is_available())"
```

## Python Script

```python
#!/usr/bin/env python3
"""
MusicGen text-to-music generation.
Uses Hermes Agent venv: /home/eddellar/.hermes/hermes-agent/venv/bin/python
"""
import torch
from transformers import MusicgenForConditionalGeneration, AutoProcessor
import scipy.io.wavfile as wavfile
import numpy as np

# Load model
processor = AutoProcessor.from_pretrained("facebook/musicgen-small")
model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
if torch.cuda.is_available():
    model = model.to("cuda")

# Text prompt
prompt = "Gentle healing ambient, Chinese guzheng and bamboo flute, mountain stream, serene, peaceful, meditative, soft"
inputs = processor(text=prompt, padding=True, return_tensors="pt")
if torch.cuda.is_available():
    inputs = {k: v.to("cuda") for k, v in inputs.items()}

# Generate
audio_values = model.generate(
    **inputs,
    max_new_tokens=768,  # ~15s at 32kHz
    do_sample=True,
    top_k=250,
    top_p=0.9,
    temperature=0.9,
)

# Save as WAV
audio_np = audio_values[0, 0].cpu().numpy()
sr = model.config.sampling_rate  # 32000 Hz
wavfile.write("/tmp/output.wav", sr, audio_np)
print(f"Saved: {len(audio_np)/sr:.2f}s @ {sr}Hz")
```

## Prompt Formula

```
Genre + Mood + Instruments + Dynamics + BPM + Cultural reference
```

**Examples:**

| Style | Prompt |
|-------|--------|
| 中国风治愈 | `"Gentle healing ambient, Chinese guzheng and bamboo flute, mountain stream, serene, peaceful, meditative, soft"` |
| 治愈钢琴 | `"Slow piano with soft strings, emotional and warm, healing mood, gentle melody, cinematic, 70 BPM"` |
| 禅意养生 | `"Traditional Chinese wellness music, serene nature sounds, gentle wind chimes, peaceful morning, zen, calming"` |
| 自然氛围 | `"Ambient nature sounds, flowing river, birds singing, gentle breeze, wind through bamboo, peaceful, 60 BPM"` |
| 温暖治愈 | `"Warm ambient pad, soft bells, emotional, hopeful, gentle texture, cinematic, 75 BPM"` |

## Output Formats

| Format | Use Case | How |
|--------|----------|-----|
| WAV 32kHz | Direct use, Feishu/WeChat | `scipy.io.wavfile.write(path, sr, audio_np)` |
| MP3 | Compressed, smaller size | `ffmpeg -i input.wav -b:a 128k output.mp3` |
| FLAC | High quality, Feishu compatible | `ffmpeg -i input.wav output.flac` |

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_new_tokens` | 768 | ~15s audio. 1536 = ~30s. 3072 = ~60s |
| `do_sample` | True | Use sampling (set False for reproducible) |
| `top_k` | 250 | Sampling top-k |
| `top_p` | 0.9 | Nucleus sampling |
| `temperature` | 0.9 | Randomness (lower = more deterministic) |

## Sending to Feishu

```
MEDIA:/tmp/output.wav

Caption text here
```

**Important:** For Feishu, always include text along with the MEDIA path. If the message contains ONLY the media path, it will fail with "only media attachments" error.

## Model Variants

| Model | Size | Quality | Speed |
|-------|------|---------|-------|
| `facebook/musicgen-tiny` | ~900MB | Lower | Fastest |
| `facebook/musicgen-small` | ~3.3GB | Medium | ~30s for 15s audio |
| `facebook/musicgen-medium` | ~6GB | High | Slower |
| `facebook/musicgen-large` | ~13GB | Highest | Slowest |

Default to `musicgen-small` for balance of quality and speed.

## Known Issues

1. **`model.config.audio_encoder_sample_rate` doesn't exist** — use `model.config.sampling_rate` instead (returns 32000)
2. **CUDA OOM on large models** — use `musicgen-small` or add `torch.cuda.empty_cache()`
3. **Slow first generation** — model downloads on first run (~3GB for small), cached after

## Pitfalls

- Do NOT use `max_length` — use `max_new_tokens` for MusicGen
- Audio output shape is `(audio_length,)` mono — reshape to `(audio_length,)` not `(1, audio_length)`
- Always call `.cpu().numpy()` before saving
- Hermes Agent's venv is at `/home/eddellar/.hermes/hermes-agent/venv/bin/python`
