---
name: carocut-auto-pipeline
description: 完整的"选题 → 最终视频"自动化流水线。集成 carocut 策划格式 + ComfyUI 生图/视频 + FFmpeg 合成 + MiniMax Music BGM + Edge TTS 旁白。
triggers:
  - "生成视频"
  - "carocut 流水线"
  - "素笺漫拾视频"
---

# carocut-auto-pipeline

> 完整的"选题 → 最终视频"自动化流水线。
> 集成 carocut 策划格式 + ComfyUI 生图/视频 + FFmpeg 合成 + MiniMax Music BGM + Edge TTS 旁白。

## 工作目录

```
/mnt/e/carocut-test/
├── carocut-bridge.py          # Bridge 主脚本（两种模式）
├── carocut-auto-planner.py    # 策划生成器（CLI 独立）
├── carocut-auto-pipeline.py   # 完整流水线（主入口）
├── manifests/
│   ├── storyboard.yaml        # 当前分镜
│   └── script.md              # 当前旁白脚本
├── shots/                     # 关键图（PNG, 832×1280）
├── videos/                    # LTX I2V 片段（MP4, 704×1280）
├── audio/
│   ├── vo/                    # TTS 旁白（WAV）
│   ├── bgm/                   # BGM（FLAC）
│   └── *.wav                  # 混音中间文件
└── output/
    ├── video_concat.mp4       # 无音轨拼接版
    └── final_complete.mp4     # 最终输出（H.264+AAC）
```

## 流水线步骤（自动执行）

```
Step 1: 策划文档  →  storyboard.yaml + script.md
Step 2: ComfyUI   →  shots/shot_XXX.png（Z-Image-Turbo）
Step 3: LTX I2V   →  videos/shot_XXX.mp4（ltx_23_i2v_distilled）
Step 4: TTS       →  audio/vo/shot_XXX.wav（edge-tts）
Step 5: BGM       →  audio/bgm/main.flac（MiniMax Music）
Step 6: FFmpeg    →  video_concat.mp4（视频拼接）
Step 7: FFmpeg    →  final_complete.mp4（音视频混合）
```

## 核心参数

| 参数 | 值 |
|------|-----|
| 关键图分辨率 | 832×1280（竖屏） |
| LTX I2V 输出 | 704×1280, ~121帧 @ 24fps |
| 最终分辨率 | 704×1280 或 720×1280 |
| FPS | 24 |
| BGM 音量 | 0.25（原声 25%） |
| TTS 音色 | zh-CN-XiaoxiaoNeural |
| MiniMax Music | is_instrumental: true, output_format: hex |
| 音频复用 | 已存在的 VO/BGM 文件自动跳过 |

## storyboard.yaml 格式

```yaml
shots:
  - shot_id: shot_001
    chapter: "第一章：晨光初现"
    duration_ms: 3000
    visual_description: |
      A serene morning mist settles over a traditional Chinese tea house courtyard...
    framing: ELS
    camera_movement: static
    pacing: slow
    visual_tension: 0.3
    transition_in:
      type: fade
      duration_ms: 300
    breathing: false
    voiceover_refs: ["VO_001"]
```

## script.md 格式

```markdown
### shot_001
[VO_001]
晨光微熹，素笺轻展
一盏清茶，漫拾时光的温柔

### shot_002
[VO_002]
炭火初燃，泉水渐沸
茶香袅袅，岁月安然
```

**注意：** 标题行支持二级 `##` 和三级 `###` 标题两种格式。

## Agent 执行流程（推荐）

当我收到"生成视频"请求时：

1. **确认主题** — 问用户要视频主题和风格
2. **生成策划** — 在当前会话直接生成 `storyboard.yaml` 和 `script.md`（用 MiniMax LLM，无 API Key 问题）
3. **执行 pipeline** — 调用 `carocut-auto-pipeline.py --skip-comfy --output output/final.mp4`
4. **发送结果** — 把最终视频通过飞书发送给用户

### 为什么策划生成在 Agent 会话中完成

`carocut-auto-pipeline.py` 的策划生成逻辑需要 MiniMax API Key。Hermes 凭证系统（`~/.hermes/auth.json`）中的 key 无法被 subprocess Python 脚本通过环境变量读取。但 MiniMax 模型（如当前会话的 M2.7-highspeed）可直接调用，所以策划文档在 Agent 会话中生成，然后 pipeline 加载已有文件执行后续步骤。

### opencode 的正确用法：轻量脑暴（单轮）

opencode 不是多 Agent 编排系统。`opencode run` 是单轮命令，无法完成 orchestrator → subagent 的多轮递归调度。

```bash
cd /mnt/e/carocut
timeout 90 opencode run \
  "你是视频制作策划专家。请为【主题】生成一套storyboard.yaml格式的分镜（含英文visual_description）和script.md格式的旁白。主题：...，风格：...，18秒6镜头。直接输出内容不提问。" \
  --model minimax-cn-coding-plan/MiniMax-M2.7-highspeed \
  --format json 2>&1 | tail -50
```

输出文件在 `/mnt/e/carocut/projects/<workspace>/manifests/`，需人工提取后填入 `carocut-test/manifests/`。

## CLI 用法

```bash
cd /mnt/e/carocut-test

# 完整流水线（策划→生图→视频→音频）
# Step 1 需要 MiniMax API Key（通过 Hermes 会话执行）
python3 carocut-auto-pipeline.py \
  --theme "素笺漫拾·晨·素笺清欢" \
  --style "古风茶道、水墨画、治愈系" \
  --duration 18 --shots 6 \
  --output output/final.mp4

# 跳过 ComfyUI 生图（使用已有 shots/）
python3 carocut-auto-pipeline.py \
  --output output/final.mp4 \
  --skip-comfy

# 只生成视频（跳过音频）
python3 carocut-auto-pipeline.py \
  --output output/final.mp4 \
  --skip-audio

# 跳过 ComfyUI + 音频（使用已有文件）
python3 carocut-auto-pipeline.py \
  --output output/final.mp4 \
  --skip-comfy
```

> **CRITICAL**: comfyui-skill 必须用 `bash -lc` 包装执行，否则报 INVALID_PARAM。
> 原因：venv Python 的 PATH 覆盖了系统 PATH，直接调用会找不到正确工具链。
> 正确写法：`subprocess.run(['bash', '-lc', inner_cmd], shell=False)`
> 注意：必须 `shell=False`（列表传参），`shell=True` 会导致引号嵌套解析错误（Python 额外套一层 sh -c）。

## comfyui-skill generate 参数说明

```
-p, --prompt TEXT       提示词（必需）
--output DIR            输出目录（必需）；注意：DIR 是目录不是文件，生成的文件名是 z_XXXXX_.png（图片）或 i2v_XXXXX-audio.mp4（视频），生成后需从该目录找最新文件
-w, --workflow NAME     工作流（默认 z_image_turbo）
--count N               生成数量
--width N               宽（默认 832）
--height N              高（默认 1280）
--server URL            指定 ComfyUI 服务器
--image KEY=PATH        img2img 输入图
--poll                  轮询直到完成
```

> 注意：`--model`、`--seed`、`--steps`、`--cfg` 不是 `generate` 子命令的参数，
> 由工作流定义决定。Z-Image-Turbo 默认 steps=8, CFG=1.0, sampler=euler_ancestral。

- ComfyUI Mie V8.0 运行中（`comfyui-skill check`）
- `ffmpeg` 可用
- `edge-tts` 可用
- MiniMax API Key（Hermes 凭证系统，Agent 会话可用）

## 已知限制

1. **策划生成 API Key** — `carocut-auto-pipeline.py` 的 Step 1 无法从 `~/.hermes/auth.json` 读取 key，必须在 Agent 会话中完成策划生成
2. **shot_005 无旁白** — storyboard.yaml 中 shot_005 不设置 `voiceover_refs` 时，对应时长为静默
3. **分辨率不一致** — 关键图 832×1280，LTX I2V 输出 704×1280。FFmpeg concat 时保持原始尺寸
