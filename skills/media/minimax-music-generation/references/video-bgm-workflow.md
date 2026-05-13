# MiniMax Music — Video BGM Workflow Reference

## 素笺漫拾 Brand BGM Prompt (verified working)

**Mang Mang (芒种) theme — "细雨荷塘·初夏·梅雨时节":**

```
Chinese healing ambient music, traditional Chinese guzheng zither, bamboo flute xiao,
light summer rain on lotus pond, morning mist over water, distant frogs and cicadas,
warm golden light, slow meditative pace, serene contemplative mood,
peaceful atmosphere, cinematic instrumental soundtrack, natural fade out, no vocals
```

**Prompt formula (verified effective):**
```
[Genre/mood] music, [instruments: guzheng + bamboo flute],
[concrete scene imagery], [ambient details: rain/mist/creatures],
slow meditative pace, serene contemplative mood, peaceful atmosphere,
cinematic instrumental soundtrack, natural fade out, no vocals
```

**Brand constants (always include):**
- Instruments: `guzheng zither` + `bamboo flute xiao`
- Mood: `healing`, `serene`, `contemplative`
- Technical: `cinematic instrumental soundtrack`, `no vocals`

---

## Duration Targeting for Video BGM

MiniMax Music has **no duration control** — model decides (typically 30s–5min).

**Targeting workflow (素笺漫拾 pattern):**
1. Generate full track (~3-5 min)
2. Probe for good segment: `ffmpeg -i raw.mp3 -ss 60 -t 5 /tmp/probe.mp3`
3. Take 45s from good start point: `ffmpeg -i raw.mp3 -ss 60 -t 45 out.mp3`
4. Trim to exact video duration + 2.3s fade-out:
   ```bash
   ffmpeg -i music_45s.mp3 -t 28.3 -af "afade=t=out:st=26:d=2.3" music_final.mp3
   ```
5. 素笺漫拾 video duration: **28.3 seconds** (6 segments × ~5s)

---

## FFmpeg Audio Injection — Critical Findings

### Video has NO audio track (LTX 2.3 outputs silent video)

Attempting `amix` filter fails with **"matches no streams"** error.

**Correct injection:**
```bash
ffmpeg -i video_no_audio.mp4 -i music_final.mp3 \
  -c:v copy -map 0:v -map 1:a -shortest \
  video_with_music.mp4
```

### Video has existing audio (e.g., camera audio)

```bash
ffmpeg -i video_with_audio.mp4 -i music.mp3 \
  -filter_complex "[0:a]volume=0.5[va];[1:a]volume=0.7[ma];[va][ma]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  video_mixed.mp4
```

### Volume preferences (素笺漫拾 confirmed)

| Track | Volume |
|-------|--------|
| Background music | 0.7 |
| Video original (if present) | 0.5 |

---

## Status Code Quick Ref

| Code | Meaning | Fix |
|------|---------|-----|
| 2013 | lyrics required | Set `is_instrumental: true` |
| 2061 | plan doesn't support model | Use `music-2.6` not `music-2.6-free` |
| timeout | `output_format: 'url'` | Switch to `output_format: 'hex'`, decode with `bytes.fromhex()` |
