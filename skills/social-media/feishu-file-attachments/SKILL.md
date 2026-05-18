---
name: feishu-file-attachments
description: "Send files to Feishu or WeChat. Feishu supports real attachments via its own API (not MEDIA: prefix). WeChat supports MEDIA prefix for real attachments. Audio: convert FLAC to MP3 for MusicGen output."
category: social-media
tags: [feishu, lark, weixin, wechat, attachment, audio, image, file, send-message]
related_skills: ["comfyui-hermes-integration"]
---

# Feishu and WeChat File Attachments

**When to use this skill:**
- User asks to "send audio/image/video to Feishu" or "send attachment to 飞书"
- User generated a file (audio, image, video) and wants to receive it in Feishu
- User cannot see/play attachments sent via Feishu
- User wants to share generated content (ComfyUI output, MusicGen audio, etc.) via chat

## Supported File Types

Feishu can preview:
- **Images**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- **Audio**: `.mp3`, `.flac`, `.wav`, `.m4a`, `.ogg` — renders as playable audio inline
- **Video**: `.mp4`, `.mov`, `.avi` — renders as inline video
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`

## Send Format

**⚠️ IMPORTANT: `[Attachment:]` syntax is NOT a real file attachment mechanism for Feishu.**

The `[Attachment: path]` syntax in messages is rendered by Hermes as **plain text placeholder** in Feishu — it does NOT upload or deliver an actual playable attachment. This is a known limitation.

### Working alternatives (in order of reliability):

#### ✅ Option 1: Use WeChat (Weixin) instead — RECOMMENDED

WeChat supports the `MEDIA:` prefix for actual file delivery:

```
MEDIA:/mnt/e/ComfyUI/output/audio/test.mp3
```

```python
send_message(
    message=f"音频文件：MEDIA:/mnt/e/ComfyUI/output/audio/test.mp3",
    target="weixin"  # or "weixin:chat_id"
)
```

Supported platforms for `MEDIA:` prefix: **telegram, discord, matrix, weixin, signal**

#### ✅ Option 2: Give the user the file path directly

For audio files that the user can open locally:

```
音频文件已生成，路径：
E:\ComfyUI_Mie_2026_V8.0\ComfyUI\output\audio\test.mp3
```

Copy the path into File Explorer to play.

#### ✅ Option 3: Upload to Feishu Drive and share link

Upload the file to Feishu cloud drive, then send the shareable link.

## Audio Format: FLAC vs MP3

**MusicGen's `MusicGenAudioToFile` node outputs FLAC by default**, but Feishu cannot inline-preview FLAC audio (unlike other audio formats — the built-in player does not render it).

**Solution:** Convert all MusicGen-generated audio to MP3 before use:

```bash
ffmpeg -y -i input.flac -acodec libmp3lame -q:a 2 output.mp3
```

## How Feishu Attachment Delivery Actually Works

**Key finding:** Feishu attachment sending **does work** — but NOT via the `MEDIA:` prefix route.

### The Routing Mechanism

1. `MEDIA:/path/to/file` is routed by platform (line ~560 in `send_message_tool.py`)
   - Supported: `telegram, discord, matrix, weixin, signal` ✅
   - **Excluded: `feishu`** ❌ — so `MEDIA:` prefix silently produces no attachment for Feishu

2. But `_send_feishu` (line ~1419) **does have full attachment support**:
   - `send_image_file()` for images
   - `send_video()` for video
   - `send_voice()` for audio (`.mp3`, `.flac`, `.wav`, `.m4a`, `.ogg`)
   - `send_document()` for other files

### Why `[Attachment: ...]` Appears to Work (but doesn't)

`[Attachment: E:\path\audio.mp3]` is **plain text** — Feishu client renders it as a clickable card because it recognizes the path pattern. No actual file upload occurs.

**Confirmation test:** `[Attachment:]` paths are delivered via the text path only — no `send_voice`/`send_image_file` is ever called.

## Common Pitfalls

### ⚠️ Video to Feishu: Size Limit + Audio Decode Issue

**Video via `MEDIA:` prefix** (`*.mp4`): Succeeds for small files, but fails for files ~20MB+ with:
```
Feishu media send failed: Expecting value: line 1 column 1 (char 0)
```
This is a Feishu API payload size limit. **Compress before sending:**

```bash
# Compress to ~15-16MB before sending to Feishu
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac -b:a 128k -movflags +faststart /tmp/compressed.mp4 -y
```

**Audio silent in Feishu even when aac track is present:** Feishu sometimes plays video but audio is inaudible despite a valid aac stream. Re-encode the audio to fix:

```bash
# Re-encode audio (does NOT re-encode video, just repackages aac)
ffmpeg -i input.mp4 -c:v copy -c:a aac -strict experimental fixed.mp4 -y
```

**Send via `/tmp/` (Linux path) works reliably:**
```python
# ✅ Works
send_message(message="MEDIA:/tmp/apple_video_compressed.mp4", target="feishu:chat_id")
# ✅ Also works (Linux path for Windows ComfyUI output)
send_message(message="MEDIA:/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/video.mp4", target="feishu:chat_id")
```

**Plain text Windows path works for reference but user cannot play:**
```python
# Shows as clickable card but no actual upload — NOT recommended
send_message(message="E:\\ComfyUI_Mie_2026_V8.0\\...\\video.mp4", target="feishu:chat_id")
```

~~```
MEDIA:/mnt/e/audio.mp3  ← Works for telegram/discord/matrix/weixin/signal
                          ← Feishu: attachment silently dropped
```~~

The earlier finding that "Feishu is excluded from MEDIA handling" was based on incorrect assumptions. Verified 2026-05-08: images sent via `MEDIA:/mnt/e/...` appear correctly in Feishu.

### ❌ `[Attachment:]` renders as plain text (not a real upload)

```
[Attachment: E:\\audio.mp3]  ← Shows as clickable text card
                               ← But no file is actually uploaded
                               ← Recipient cannot play/view it
```

### ❌ Bare attachment path without surrounding text

Some Feishu configurations reject messages containing only an attachment reference. Always include at least a short text label.

### ✅ WeChat (weixin) works with `MEDIA:` prefix

WeChat supports `MEDIA:` native file delivery — use this for actual playable attachments.

## Examples

### Send audio via WeChat (recommended)

```python
send_message(
    message=f"背景音乐已生成，请查收：MEDIA:/mnt/e/ComfyUI/output/audio/test.mp3",
    target="weixin"
)
```

### Send image via WeChat

```python
send_message(
    message=f"封面图效果：MEDIA:/mnt/e/ComfyUI/output/image_0001_.png",
    target="weixin"
)
```

### Give user file path (fallback — works for all platforms)

```python
send_message(
    message="音频文件已生成，路径：\nE:\\ComfyUI_Mie_2026_V8.0\\ComfyUI\\output\\audio\\test.mp3\n复制到文件管理器即可播放",
    target="feishu"
)
```

### Send to a specific channel

```python
send_message(
    message="报告文件：E:\\Users\\Documents\\report.pdf",
    target="feishu:#work-group"
)
```

## Sending Text-Only Messages (Reports, Alerts)

For text reports and plain messages (no file attachment), the Hermes gateway's `send_message` tool may not be available in cron/sandbox contexts. Use the direct Feishu REST API via `httpx` — see `references/text-message-via-rest-api.md` for the full recipe including token acquisition and the `lark_oapi` SDK gotcha.

## Verification

Check if a file exists before sending:

```bash
ls -la "/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/audio/test.mp3"
```
