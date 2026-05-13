---
name: suxi-manshi-video
description: 素笺漫拾公众号视频全流程 — 选题 → LTX 2.3 文生视频 → MiniMax Music 配乐 → FFmpeg 合并混音 → 发布
version: 1.6.0
license: Apache-2.0
platforms: [linux, wsl]
tags: [video, ai-generation, ltx, minimax-music, chinese-healing]
hermes:
  trigger: ["生成素笺漫拾视频", "素笺漫拾", "suxi-manshi"]
  related_skills: ["minimax-music-generation", "comfyui-agent-skill-mie"]
  auto_load: false

prerequisites:
  commands: [ffmpeg, python3]
  env_vars: [MINIMAX_CN_API_KEY]
  models:
    - LTX 2.3 (Distilled FP8) — verified working via comfyui-skill CLI
    - MiniMax Music (is_instrumental: true when no lyrics needed)
---

# 素笺漫拾视频自动化工作流

## 快速开始

```bash
# 视频生成（LTX 2.3，comfyui-skill）
comfyui-skill generate --workflow ltx_23_t2v_distill \
  -p "你的提示词"

# 音乐生成（MiniMax Music）
# 见 minimax-music-generation skill

# FFmpeg 合并
ffmpeg -y -f concat -safe 0 -i /tmp/seg_list.txt -c copy /tmp/video_raw.mp4
ffmpeg -y -i /tmp/video_raw.mp4 -i /tmp/bgm.mp3 -c:v copy -map 0:v -map 1:a -shortest output.mp4
```

## 视频生成参数（素笺漫拾标准）

- 分辨率：720×1280（竖屏 9:16，公众号标准）
- 每段：5秒 / 120帧 / 24fps
- Steps：40，CFG：4.0
- Sampler：euler_ancestral，scheduler：sgm_uniform

## `comfyui-skill` CLI 关键限制（实测 2026-05-09）

| 参数 | 支持 | 说明 |
|------|------|------|
| `--seed N` | ❌ | 返回 `INVALID_PARAM`；seed 在输出 metadata 中返回 |
| `--width` / `--height` | ❌ | 不识别；`ltx_23_t2v_distill` 固定 768×512 |
| `--steps` | ❌ | 不识别；步数由工作流固定 |
| `-p "prompt"` | ✅ | 正常 |
| `--workflow ltx_23_t2v_distill` | ✅ | 正常 |
| `--image` | ✅ | 用于 i2v 工作流 |

竖屏裁剪：`ffmpeg -i input.mp4 -vf "crop=ih*9/16:ih" output.mp4`

## 已知陷阱

详见 `references/comfyui-video-model-trapfalls-2026-05-09.md`

## 交付标准

- 视频必须压缩后发飞书（>20MB 直接失败）
- 用 Linux 路径 `MEDIA:/mnt/e/...` 发送，不要用 Windows 绝对路径
- 飞书音频无声？重新编码：`ffmpeg -i input.mp4 -c:v copy -c:a aac output.mp4`
