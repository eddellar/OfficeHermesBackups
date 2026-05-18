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

### carocut Hybrid Workflow (Optional Planning Layer)

carocut (bilibili/carocut) can serve as an **upstream planning/storyboarding layer** that feeds into the ComfyUI + FFmpeg stack. This is useful when you want structured planning (multi-agent scriptwriting, scene breakdown) before generation.

**Architecture:**

```
carocut (Step 0-2: 策划)
  → manifests/storyboard.yaml (分镜描述)
  → carocut-bridge.py (自定义 bridge)
  → ComfyUI API (每个 shot 生成关键图)
  → FFmpeg (帧序列 → 视频 + 混音)
```

**详细 opencode/carocut 技术笔记：** `references/carocut-opencode-notes.md`

**carocut bridge script:** `/mnt/e/carocut-test/carocut-bridge.py`

**⚠️ opencode CLI 使用限制（重要）：**

carocut orchestrator 是多轮 Multi-Agent 系统，orchestrator 调度 subagent 需要多轮对话。`opencode run` 是**单轮模式**，发一条消息拿一个回复，无法完成递归式 agent 调度。

```
opencode run 限制：
- ✅ 单轮一次完成：可以触发 carocut-orchestrator，加载 skill，读文件，写文件
- ❌ 多轮调度失败：orchestrator dispatch subagent 后无法等待/处理 subagent 响应
- ❌ 超时中断：长任务（如策划阶段）60s 即超时
```

**opencode 已安装：** `/home/eddellar/.opencode/bin/opencode` v1.4.7

**可用方案：**

| 方案 | 描述 | 适用场景 |
|------|------|---------|
| **方案A（推荐）** | 我直接生成 storyboard.yaml + script.md，跳过 carocut Agent | 快速端到端制作 |
| **方案B-轻** | `opencode run` 单次创意脑暴，获取策划灵感，人工提取 | 选题困难时 |
| **方案B-重** | `opencode serve` + 直接调 carocut Next.js API (`/app/api/agent/*`) | 需要完整多 Agent 编排时 |

**opencode run 轻量用法（创意脑暴）：**
```bash
cd /mnt/e/carocut && opencode run "为素笺漫拾策划一个18秒禅意茶道视频，720x1280竖屏，给出分镜思路和创意方向" 2>&1 | head -50
```

**opencode.json 模型配置（如需修改）：**
```bash
# 原模板用 opencode/qwen3.6-plus-free（不可用），已替换为：
# model: minimax-cn-coding-plan/MiniMax-M2.7-highspeed
# 小心：carocut 某些 agent 配置了专用模型（如 carocut-reviewer 用 opencode/mimo-v2-omni-free），需同步替换
```

**carocut bridge script:** `/mnt/e/carocut-test/carocut-bridge.py`

支持两种模式：
- **图片模式**（默认）：每 shot 生成一张图，FFmpeg 帧序列展为视频
- **LTX I2V 模式**（`--ltx-i2v`）：每 shot 调用 LTX 2.3 图生视频，FFmpeg concat 拼接片段

```bash
# 图片模式
python carocut-bridge.py --storyboard manifests/storyboard.yaml --output output.mp4

# LTX I2V 视频模式
python carocut-bridge.py --storyboard manifests/storyboard.yaml --output output.mp4 --ltx-i2v --workers 1

# 使用已有图片+视频，跳过生成
python carocut-bridge.py --storyboard manifests/storyboard.yaml --output output.mp4 --skip-comfy --ltx-i2v

# LTX I2V + 音频
python carocut-bridge.py --storyboard manifests/storyboard.yaml --output output.mp4 --ltx-i2v --with-audio
```

**核心参数：**
| 参数 | 作用 |
|------|------|
| `--ltx-i2v` | 启用 LTX 2.3 I2V 视频模式 |
| `--workers N` | 并发生成数（建议 1，单 GPU） |
| `--videos-dir` | 视频片段输出目录（默认 videos） |
| `--shots-dir` | 关键图目录（默认 shots） |
| `--skip-comfy` | 跳过 ComfyUI，使用已有文件 |
| `--with-audio` | 生成 TTS 旁白 + MiniMax BGM |

**FFmpeg concat demuxer 路径陷阱：** concat file 必须写**绝对路径**，否则 FFmpeg 在 `output/` 目录执行时找不到 `videos/` 下的相对路径文件：
```python
# ✅ 正确
vf_abs = os.path.abspath(vf)
f.write(f"file '{vf_abs.replace(chr(92), '/')}'\n")

# ❌ 错误 — 相对路径在 output/ 下找不到 output/videos/shot_001.mp4
f.write(f"file '{vf}'\n")
```

**图片模式 → I2V 模式演进历史：**
1. 图片模式（已验证）：每 shot 一张图 → 帧序列 → 视频（静态画面）
2. **I2V 模式（当前）：** 每 shot 关键图 → LTX 2.3 I2V → 真实视频片段 → FFmpeg concat → 有运动的完整视频

**LTX I2V 每 shot 输出规格（实测）：**
- 分辨率：跟随输入图片（竖图输入 → 竖视频输出，704×1280）
- 帧数：121帧 @ 24fps ≈ 5秒/shot
- 文件大小：0.7~6.1MB/shot（复杂度不同）
- 音频轨存在但为空，必须 FFmpeg 混音

**carocut-bridge.py 关键函数：**
| 函数 | 作用 |
|------|------|
| `enhance_prompt()` | 中文描述 → 英文写实 prompt（图片用） |
| `enhance_prompt_for_video()` | 加入 camera_movement/motion 描述词（I2V 用） |
| `comfyui_skill_generate_video()` | 调用 `ltx_23_i2v_distilled` workflow |
| `generate_all_videos()` | 并发生成所有 shot 视频 |
| `ffmpeg_concat_videos()` | FFmpeg concat demuxer 拼接 MP4 片段 |
| `ffmpeg_trim_to_duration()` | 裁剪拼接视频到 storyboard 目标时长 |
| `generate_bgm_minimax()` | MiniMax Music API（hex 编码） |
| `generate_tts_voiceover()` | Edge TTS（`--write-media` 参数） |
| `ffmpeg_add_audio()` | VO 拼接 + BGM 混音 |

**Prompt 增强策略（I2V）：** `enhance_prompt_for_video()` 根据 `camera_movement` 添加运动前缀：
```python
motion_map = {
    "push-in": "slow push-in camera movement, gradually moving closer, ",
    "pull-out": "slow pull-out camera movement, gradually revealing more, ",
    "pan-left": "slow pan to the left, camera tracking, ",
    "pan-right": "slow pan to the right, camera tracking, ",
    "tilt-up": "slow tilt up, ", "tilt-down": "slow tilt down, ",
    "dolly": "smooth dolly shot, ", "static": "static camera, still frame, ",
    "breathing": "gentle breathing rhythm, subtle oscillation, ",
}
```

**I2V video_prompt 策略：** storyboard.yaml 的 `visual_description`（中文散文）经 `enhance_prompt_for_video()` 翻译增强后作为 `-p` 参数输入。同时参考 `camera_movement` 和 `pacing` 字段注入运动描述。

**⚠️ LTX I2V 输出音频轨为空（必须 FFmpeg 混音）：**
`ltx_23_i2v_distilled` 输出的 MP4 包含一条**空音频轨**，视频本身**完全无声**。无论是否计划添加 BGM，必须用 FFmpeg 注入音轨，否则视频无声：
```bash
# 拼接后注入混音（VO + BGM）
ffmpeg -y -i video_concat_raw.mp4 -i audio_mixed.wav \
  -c:v copy -c:a aac -shortest output_with_audio.mp4
```
这条是**必做步骤**，不要跳过。

**⚠️ LTX I2V 输出音频轨为空（必须 FFmpeg 混音）：**
`ltx_23_i2v_distilled` 输出的 MP4 包含一条**空音频轨**，视频本身**完全无声**。无论是否计划添加 BGM，必须用 FFmpeg 注入音轨，否则视频无声。

**判断方法：** `ffprobe -v quiet -show_streams output.mp4 | grep codec_type` — 输出 video+audio 两条 stream，但 audio 的 nb_frames=0。

**完整流程（必须执行）：**
```bash
# 1. 拼接视频片段（-an 无音轨）
ffmpeg -y -f concat -safe 0 -i /tmp/video_concat.txt \
  -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an video_raw.mp4

# 2. 合并旁白
ffmpeg -y -f concat -safe 0 -i /tmp/vo_concat.txt -c:a pcm_s16le vo_merged.wav

# 3. 混音 VO + BGM
ffmpeg -y -i vo_merged.wav -i bgm.flac \
  -filter_complex "[1:a]volume=0.25[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]" \
  -map "[aout]" -ar 44100 audio_mixed.wav

# 4. 注入音轨（-shortest 截断）
ffmpeg -y -i video_raw.mp4 -i audio_mixed.wav \
  -c:v copy -c:a aac -shortest final_output.mp4
```

**常见错误：** 直接交付 video_raw.mp4，用户播放发现完全无声。

**6-shot 完整流程实测数据（2026-05-18）：**
| Shot | 关键图 seed | I2V 视频大小 | 视频时长 |
|------|------------|-------------|---------|
| shot_001 | 139705843 | 1.7MB | ~5s |
| shot_002 | 1769427665 | 2.3MB | ~5s |
| shot_003 | 493523107 | 1.2MB | ~5s |
| shot_004 | 3425722376 | 3.4MB | ~5s |
| shot_005 | 1071000263 | 0.7MB | ~5s |
| shot_006 | 1213111585 | 6.1MB | ~5s |

最终输出：`output/carocut_ltx_final.mp4` — 7.1MB, 704×1280, 18s, 432帧, H.264


**edge-tts 正确用法：**
```bash
# ✅ 正确
edge-tts --write-media /path/to/output.wav --text "中文文本" --voice zh-CN-XiaoxiaoNeural

# ❌ 错误（--output 不存在）
edge-tts --text "中文" --output /path/to/output.wav
```

**carocut 核心数据格式 (storyboard.yaml):**

```bash
# ✅ 正确：glob pattern 让 ffmpeg 按文件名顺序自动读取帧
ffmpeg -y -framerate 24 \
  -i "sequences/frame_%05d.png" \
  -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24" \
  -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an \
  output.mp4

# ❌ 错误：concat demuxer 缺少 duration 指令会导致帧以错误速率播放
ffmpeg -y -f concat -safe 0 -i frames.txt ...  # 仅当每行写了 duration 时才正确
```

**carocut 核心数据格式 (storyboard.yaml):**

```yaml
shots:
  - shot_id: shot_001
    chapter: "开场"
    duration_ms: 3000
    visual_description: "ECU of morning sunlight on wooden desk..."
    framing: "ECU"         # 景别: ECU/CU/MCU/MS/MLS/LS/ELS
    camera_movement: "slow-push"  # 运镜: static/slow-push/slow-pull/zoom-corner
    pacing: "slow"         # 节奏: slow/medium/fast/pause
    visual_tension: 0.2    # 0.0-1.0
    transition_in:
      type: "fade"
      duration_ms: 800
    breathing: false       # true=呼吸段(无旁白留白)
    voiceover_refs: [VO_001]
    resource_refs: [char_001]
```

**carocut 核心数据格式 (storyboard.yaml):**
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
- I2V resolution follows input image dimensions (vertical input → vertical output)
- Audio nodes broken in full LTX; I2V output has empty audio track → add BGM via FFmpeg merge

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
