---
name: social-media-video-production
description: >
  End-to-end AI video pipeline for Chinese social media accounts (WeChat 视频号, 公众号).
  Covers two account types: food-character entertainment series and literary/healing themed
  accounts. Both share the same execution stack: comfyui-skill → LTX 2.3 T2V/I2V →
  MiniMax Music → FFmpeg → Feishu delivery.
hermes:
  trigger: ["social media video", "微信视频号", "公众号视频", "food character video", "素笺漫拾"]
  auto_load: false
category: social-media
version: 1.0.0
---

# Social Media Video Production

## Shared Execution Stack

All social media video production uses this pipeline:

```
comfyui-skill (LTX 2.3) → FFmpeg vertical crop → MiniMax Music BGM → FFmpeg merge → Feishu
```

**Commands:**

```bash
# Video generation
comfyui-skill generate --workflow ltx_23_t2v_distill -p "prompt"          # T2V
comfyui-skill generate --workflow ltx_23_i2v_distilled --image ref.png -p "motion"  # I2V

# BGM generation (see minimax-music-generation skill)
# MiniMax Music - is_instrumental:true for no lyrics

# Vertical crop (T2V outputs 768x512 horizontal → 9:16 vertical)
ffmpeg -i input.mp4 -vf "crop=ih*9/16:ih" output_vertical.mp4

# Merge video + BGM
ffmpeg -y -f concat -safe 0 -i /tmp/seg_list.txt -c copy /tmp/video_raw.mp4
ffmpeg -y -i /tmp/video_raw.mp4 -i /tmp/bgm.mp3 -c:v copy -map 0:v -map 1:a -shortest output.mp4
```

**Standard parameters (素笺漫拾 / food-character):**
- Resolution: 768×512 (T2V fixed) → crop to 9:16 vertical
- Segments: 5 seconds / 120 frames / 24fps
- Steps: 40, CFG: 4.0
- Sampler: euler_ancestral, scheduler: sgm_uniform

**Delivery (Feishu):**
- Use `MEDIA:/mnt/e/...` Linux path format — NOT Windows absolute paths
- Compress >20MB before sending
- Re-encode audio if silent: `ffmpeg -i input.mp4 -c:v copy -c:a aac output.mp4`

### Content Strategy & Topic Planning

For long-form content strategy (选题规划, editorial calendars, platform-specific posting strategy), also check **agency-agents** (`/tmp/agency-agents`):

```bash
# Installed agents (184 total) — useful ones for this workflow:
~/.config/opencode/agents/wechat-official-account-manager.md   # 微信公众号运营专家
~/.config/opencode/agents/xiaohongshu-specialist.md           # 小红书专家
~/.config/opencode/agents/bilibili-content-strategist.md       # B站 UP主策略
~/.config/opencode/agents/content-creator.md                   # 多平台内容创建
~/.config/opencode/agents/social-media-strategist.md          # 社交媒体战略
```

Activate via OpenCode subagent: `@wechat-official-account-manager 帮我规划本周素笺漫拾选题`

> **Note:** agency-agents README advertises `--path` for global OpenCode install, but `install.sh` does NOT implement this flag. Manual install required:
> ```bash
> mkdir -p ~/.config/opencode/agents
> cp -r /tmp/agency-agents/integrations/opencode/agents/*.md ~/.config/opencode/agents/
> # Also install to project dir if needed:
> mkdir -p ~/projects/.opencode/agents && cp ... ~/projects/.opencode/agents/
> ```

**CLI limitations (ltx_23_t2v_distill / i2v_distilled):**
| Flag | Supported | Note |
|------|-----------|------|
| `-p "prompt"` | ✅ | |
| `--seed N` | ❌ | Returns INVALID_PARAM; seed in output metadata |
| `--width/--height` | ❌ | Fixed 768×512; crop with FFmpeg |
| `--steps` | ❌ | Fixed by workflow |
| `--image` | ✅ | I2V only |

---

## Account Type A: Food Character Entertainment Series

*For character-driven entertainment accounts (e.g. 打工包天团).*  
**Core principle: I2V preserves character identity. T2V invents new appearances — never use T2V for character scenes.**

### Character Definition

Define a fixed roster BEFORE any generation. Each character needs:
- Visual: color, shape, distinguishing feature, common expressions
- Persona: job/role, catchphrase, personality
- Consistency: same seed + style prompts + same physical features across all images

Example roster: 白包子 (HR), 棕包子 (Programmer), 水晶虾饺 (Intern), 绿包子 (Fitness Coach), 金黄烤包子 (CEO)

**Always reference the user's confirmed reference image first** via `mcp_minimax_understand_image`. Describe exact colors/features back to user for verification. Include all distinguishing features explicitly — model invents wrong colors if given only names.

### Video Production

**ALWAYS use I2V (`ltx_23_i2v_distilled`) for character scenes.** Pass the character's confirmed portrait as `--image`. T2V generates from scratch and loses character identity.

```bash
comfyui-skill generate --workflow ltx_23_i2v_distilled \
  --image /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[character_ref].png \
  -p "Motion description"
```

**Content series that work:**
- 打工系列 — food characters in workplace scenarios
- 反差萌系列 — characters in wrong contexts
- 深夜食堂 — late-night canteen monologue style
- 剧情连续剧 — serialized drama with cliffhangers

**WeChat tips:**
- Release: 08:30 Monday for work-themed content
- Copy: "某场景，某角色反应，你是哪一种？🤚"
- Hashtags: #打工包天团 + #打工人 + niche tags
- Engagement: ask "你是哪个包子？" in comments

**Known issues:**
- I2V produces 768×512 horizontal only → crop to 9:16 with FFmpeg
- Audio nodes broken in full LTX; I2V output is silent video only → add BGM via FFmpeg merge

---

## Account Type B: 素笺漫拾 Literary/Healing Themed Account

*For themed accounts with literary/healing aesthetics (素笺漫拾 style).*  
**T2V is appropriate here** — no fixed character identity to preserve.

### Workflow

1. **选题** — pick a scene/concept with healing/literary mood
2. **T2V generation** — LTX 2.3 via comfyui-skill
3. **BGM** — MiniMax Music (is_instrumental: true)
4. **FFmpeg** — concat segments + merge with BGM
5. **Feishu** — deliver with MEDIA: path

### Known Traps

详见 `references/suxi-manshi-trapfalls.md`

---

## Related Skills

- `comfyui-agent-skill-mie` — the execution engine (comfyui-skill CLI, all workflow generations)
- `minimax-music-generation` — BGM generation
- `feishu-file-attachments` — result delivery
