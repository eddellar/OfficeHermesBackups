---
name: minimax-music-generation
description: "MiniMax Music-2.6 API: text-to-music generation for video soundtracks. Supports instrumental music, hex-encoded MP3 output, and post-processing pipeline."
version: 1.0.0
license: Apache-2.0
platforms: [linux, wsl]
prerequisites:
  commands: [python3, ffmpeg]
  env_vars: [MINIMAX_CN_API_KEY]
metadata:
  hermes:
    tags: [music, audio, generation, api, minimax, instrumental, text-to-music, video-soundtrack]
    related_skills: [heartmula, audiocraft-audio-generation, comfyui-hermes-integration]
---

# MiniMax Music-2.6 API

## Overview

MiniMax Music-2.6 is a cloud text-to-music API. It generates music from text prompts, with support for instrumental (lyrics-free) generation and various output formats.

**Use this skill when:**
- User wants to generate background music for video content (social media, YouTube, WeChat video)
- User asks about MiniMax music generation API
- User needs Chinese/instrumental/ambient music for video soundtracks
- User wants to generate pure music without vocals

## API Reference

**Endpoint:** `POST https://api.minimaxi.com/v1/music_generation`

**Authentication:** Bearer token from `MINIMAX_CN_API_KEY` env var (in `~/.hermes/.env`)

### Key Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | — | `music-2.6` (paid), `music-2.6-free` (free tier) |
| `prompt` | string | — | Music description: style, mood, scene. Max 2000 chars |
| `is_instrumental` | boolean | `false` | **Set to `true`** for pure music without vocals. Makes `lyrics` optional |
| `output_format` | string | `hex` | `hex` (default, hex-encoded bytes) or `url` (download link, times out frequently) |
| `lyrics` | string | — | Song lyrics. Required unless `is_instrumental: true` |
| `stream` | boolean | `false` | Stream mode (rarely needed) |
| `audio_setting.format` | string | `mp3` | Output codec: `mp3`, `wav`, `pcm`. **No FLAC support** |
| `aigc_watermark` | boolean | `false` | Add watermark at end |

### Critical Findings

1. **`is_instrumental: true`** — The only way to generate pure music without vocals. Without this, the API returns `status_code: 2013 lyrics is required`
2. **`output_format: 'hex'`** — Returns hex-encoded MP3 bytes. The hex string starts with `49443304` = `ID3` (MP3 header). Use `bytes.fromhex(audio_hex)` — **NOT base64**
3. **`output_format: 'url'`** — Returns a download URL, but API **frequently times out** even with 300s timeout. Use `hex` instead
4. **No duration parameter** — The API has NO way to control output length. Model decides. Typical output: 30s–5min. Use `extra_info.music_duration` to check actual length, then trim with ffmpeg
5. **Audio is hex-encoded, NOT base64** — Common mistake. Use `bytes.fromhex(audio_hex)` not `base64.b64decode()`
6. **FLAC not supported natively** — `audio_setting.format` only supports `mp3`, `wav`, `pcm`. Convert with ffmpeg. **Note: Feishu CAN play FLAC attachments**
7. **API is slow and may timeout** — Non-streaming `hex` mode often times out for 3–5min audio at 600s limit. Use background processing for long audio
8. **Streaming mode (`stream: true`)** returns SSE/chunked JSON — not raw audio. Each chunk is a JSON object containing hex data that must be parsed. Use background mode for reliability

## Complete Generation Pipeline

```python
import os, requests, base64

# 1. Read API key
env_path = os.path.expanduser("~/.hermes/.env")
key = None
for line in open(env_path):
    if line.startswith("MINIMAX_CN_API_KEY="):
        key = line.split("=", 1)[1].strip()
        break

# 2. Generate music
headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
r = requests.post(
    "https://api.minimaxi.com/v1/music_generation",
    headers=headers,
    json={
        "model": "music-2.6",
        "prompt": "Chinese healing ambient, guzheng bamboo flute, mountain stream, serene meditation",
        "is_instrumental": True,
        "output_format": "hex"
    },
    timeout=300
)
data = r.json()

# 3. Check response
if data["base_resp"]["status_code"] != 0:
    print(f"Error: {data['base_resp']}")
    exit(1)

# 4. Decode hex to bytes (NOT base64!)
audio_hex = data["data"]["audio"].rstrip("=")
audio_bytes = bytes.fromhex(audio_hex)

# 5. Check duration from extra_info
duration_ms = data.get("extra_info", {}).get("music_duration", 0)
print(f"Generated duration: {duration_ms/1000:.1f}s")

# 6. Save MP3
mp3_path = "/tmp/music_raw.mp3"
with open(mp3_path, "wb") as f:
    f.write(audio_bytes)
print(f"MP3 saved: {len(audio_bytes)/1024/1024:.1f}MB")
```

## Post-Processing

### Trim to specific duration (e.g., 15 seconds)
```bash
ffmpeg -i /tmp/music_raw.mp3 -y -t 15 /tmp/music_15s.mp3
```

### Convert to FLAC
```bash
ffmpeg -i /tmp/music_raw.mp3 -y /tmp/music.flac
```

### Trim + Convert to FLAC in one step
```bash
ffmpeg -i /tmp/music_raw.mp3 -y -t 15 /tmp/music_15s.flac
```

## Recommended Prompts for Video Content

> ⚠️ **For 素笺漫拾 brand BGM — see `references/video-bgm-workflow.md`** for verified working prompts and FFmpeg audio injection patterns. Key findings:
> - LTX 2.3 videos have **no audio track** — use direct injection (`-map 0:v -map 1:a`), NOT amix
> - Brand prompt always includes: `guzheng zither` + `bamboo flute xiao` + `healing` + `slow meditative pace`

### Prompt Formula (brand-verified)

```
Chinese healing ambient music, traditional Chinese guzheng zither, bamboo flute xiao,
[concrete scene imagery: lotus pond, rain, mist],
[ambient creatures: distant frogs, cicadas, orioles],
slow meditative pace, serene contemplative mood, peaceful atmosphere,
cinematic instrumental soundtrack, natural fade out, no vocals
```

### Style Examples

| Style | Prompt |
|-------|--------|
| Chinese healing | `Chinese healing ambient, guzheng bamboo flute, mountain stream, serene meditation` |
| Zen/peaceful | `Zen ambient, soft piano, singing bowl, peaceful morning, minimalist` |
| Nature | `Forest ambiance, birds, gentle stream, morning light, organic` |
| Romantic wistful | `Slow piano, nostalgic, warm, bittersweet, cinematic` |
| Spring/seasonal | `Spring morning, light breeze, cherry blossoms, gentle flute, uplifting` |
| **素笺漫拾 芒种** | `Chinese healing ambient music, traditional Chinese guzheng zither, bamboo flute xiao, light summer rain on lotus pond, morning mist over water, distant frogs and cicadas, warm golden light, slow meditative pace, serene contemplative mood, peaceful atmosphere, cinematic instrumental soundtrack, natural fade out, no vocals` |

### Troubleshooting

#### `status_code: 2013 lyrics is required`
- Set `is_instrumental: true` to make lyrics optional

#### `status_code: 2061 your current token plan not support model`
- User's plan doesn't support `music-2.6-free`. Use `music-2.6` instead

#### API times out with `output_format: 'url'`
- Use `output_format: 'hex'` instead. Decode with `bytes.fromhex()`

#### Non-streaming `hex` mode times out for long audio (3-5min)
- Long audio generates too much hex data for the response timeout
- **Solution**: Use `terminal(background=true)` with `notify_on_complete=true` to run the request in background
- The streaming mode (`stream: true`) with SSE/chunked JSON is also an option but requires parsing JSON chunks, not raw bytes

#### Decoded audio is corrupted
- Audio is hex-encoded, NOT base64. Use `bytes.fromhex()` not `base64.b64decode()`

#### FLAC not in output options
- `audio_setting.format` only supports mp3/wav/pcm. Use ffmpeg to convert

#### Generated music is too long
- No duration control in API. Use ffmpeg to trim: `ffmpeg -i input.mp3 -t 15 output.mp3`

#### Video has no audio track — amix fails
- **LTX 2.3 videos have no audio track.** Attempting `amix` filter returns error: `Stream specifier ':a' matches no streams.`
- **Fix:** Use direct injection instead: `ffmpeg -i video.mp4 -i music.mp3 -c:v copy -map 0:v -map 1:a -shortest output.mp4`
- See `references/video-bgm-workflow.md` for full patterns (volume levels, fade-out timing, duration targeting)

## Sending Audio to Feishu

Feishu supports FLAC attachments — no conversion needed. Send directly:

```
[Attachment: /path/to/music.flac]
```

If user prefers MP3 or if FLAC doesn't work for their Feishu version:
```bash
ffmpeg -y -i music.mp3 music.flac   # Feishu plays FLAC fine
```

For MP3 delivery (less reliable):
```
[Attachment: /path/to/music.mp3]
```

## Background Processing for Long Audio

For audio > ~60s, `hex` mode response exceeds HTTP timeout. Use background mode:

```bash
terminal(background=true, notify_on_complete=true, timeout=900)
```

**Confirmed working polling sequence (2026-05-09, 177s track):**
1. Start background process
2. `process(action='wait', session_id=..., timeout=55)` — repeats until `exited`
3. Each wait call returns quickly (~83s total for 177s track)
4. Parse `stdout` text for result (script must `print()` the JSON summary)

**Known issue:** `notify_on_complete: true` fires but `process` still shows `running` — must poll to `exited`.

**Example script (print to stdout for capture):**
```python
import os, requests

key = [l for l in open(os.path.expanduser("~/.hermes/.env")).readlines()
        if l.startswith("MINIMAX_CN_API_KEY=")][0].split("=",1)[1].strip()

r = requests.post("https://api.minimaxi.com/v1/music_generation",
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    json={"model": "music-2.6", "prompt": "...", "is_instrumental": True, "output_format": "hex"},
    timeout=600)

data = r.json()
audio_bytes = bytes.fromhex(data["data"]["audio"])
duration_ms = data.get("extra_info", {}).get("music_duration", 0)
print(f"Generated: {len(audio_bytes)/1024/1024:.1f}MB, duration: {duration_ms/1000:.1f}s")
with open("/tmp/bgm_emotional.mp3", "wb") as f:
    f.write(audio_bytes)
```

**Audio file appears at the path your script saves it to** (e.g. `/tmp/bgm_emotional.mp3`), not automatically. The script must write the file.

---

## Appendix: Local MusicGen (Transformers/PyTorch)

Alternative to MiniMax cloud API — generate music locally via Meta's MusicGen model using `transformers + PyTorch + CUDA`. Output WAV/MP3 for social media delivery.

**When to use local MusicGen instead of MiniMax:**
- No API key required
- Offline generation
- Shorter audio clips (~15-30s)
- User wants open-source local alternative

**Environment (already in Hermes venv):**
```bash
/home/eddellar/.hermes/hermes-agent/venv/bin/python -c "import transformers; import torch; print('OK')"
```

**Python script:**
```python
import torch
from transformers import MusicgenForConditionalGeneration, AutoProcessor
import scipy.io.wavfile as wavfile

processor = AutoProcessor.from_pretrained("facebook/musicgen-small")
model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
if torch.cuda.is_available():
    model = model.to("cuda")

prompt = "Gentle healing ambient, Chinese guzheng and bamboo flute, mountain stream, serene, peaceful"
inputs = processor(text=prompt, padding=True, return_tensors="pt")
if torch.cuda.is_available():
    inputs = {k: v.to("cuda") for k, v in inputs.items()}

audio_values = model.generate(
    **inputs,
    max_new_tokens=768,  # ~15s at 32kHz
    do_sample=True, top_k=250, top_p=0.9, temperature=0.9,
)

audio_np = audio_values[0, 0].cpu().numpy()
wavfile.write("/tmp/output.wav", model.config.sampling_rate, audio_np)
```

**Prompt formula:** `Genre + Mood + Instruments + Dynamics + BPM + Cultural reference`

| Style | Prompt |
|-------|--------|
| 中国风治愈 | `"Gentle healing ambient, Chinese guzheng and bamboo flute, mountain stream"` |
| 治愈钢琴 | `"Slow piano with soft strings, emotional and warm, healing mood, gentle melody, cinematic, 70 BPM"` |
| 禅意养生 | `"Traditional Chinese wellness music, serene nature sounds, gentle wind chimes, peaceful morning, zen"` |

**Key parameters:**

| Parameter | Default | Notes |
|-----------|---------|-------|
| `max_new_tokens` | 768 | ~15s. 1536 = ~30s. 3072 = ~60s |
| `do_sample` | True | Set False for reproducible |
| `temperature` | 0.9 | Lower = more deterministic |

**Model variants:** `facebook/musicgen-tiny` (~900MB), `facebook/musicgen-small` (~3.3GB, default), `facebook/musicgen-medium` (~6GB), `facebook/musicgen-large` (~13GB)

**Known issues:**
1. `model.config.audio_encoder_sample_rate` doesn't exist — use `model.config.sampling_rate` (returns 32000)
2. Do NOT use `max_length` — use `max_new_tokens` for MusicGen
3. Audio output shape is `(audio_length,)` mono — always call `.cpu().numpy()` before saving

**Output formats:** WAV 32kHz (direct use), MP3 (`ffmpeg -i input.wav -b:a 128k output.mp3`), FLAC (high quality)

**Sending to Feishu/WeChat:** Always include text along with the media path. For WeChat use `MEDIA:/path/to/file`. For Feishu, FLAC attachments work directly.
