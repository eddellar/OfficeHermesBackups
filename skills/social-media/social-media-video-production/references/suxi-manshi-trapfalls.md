# ComfyUI 视频模型陷阱（2026-05-09 初版，2026-05-18 更新）

## 1. LTX 2.3 AudioVAE 解码崩溃

**症状：**
- `LTXVLatentUpsampler` 内部 `AudioVAE.per_channel_statistics` 属性缺失
- `LTXVAudioVAEDecode` 张量维度不匹配：`tensor a (1408) vs tensor b (128)` at non-singleton dimension 2

**绕过方案：** 从工作流中**移除所有音频相关节点**，只保留纯视频 latent 链。音频单独用 FFmpeg 或 MiniMax Music 生成后混音。

---

## 2. Wan 2.2 T2V 模型路径被拒绝

**结论：Wan 2.2 T2V 当前无法通过 API 调用，只能通过 UI 手动操作。**

---

## 3. Z-Image-Turbo via CLI 验证可用

**结论：** `comfyui-skill generate` 是 Z-Image-Turbo 的唯一正确调用方式（内部绕过 Nunchaku loader bug）。永远走 CLI。

**⚠️ 不要用的错误方式：**
- `--result-json` flag — 不存在
- MCP `mcp_comfy_cozy_*` 工具 — 路由到错误实例
- 直接手写 REST API

---

## 4. LTX 2.3 I2V 实测成功（2026-05-18）

**workflow:** `ltx_23_i2v_distilled`

**调用方式：**
```bash
comfyui-skill generate \
  --workflow ltx_23_i2v_distilled \
  --image "input_image=/path/to/reference.png" \
  -p "motion prompt describing camera movement and scene dynamics"
```

**⚠️ 已知限制：**
- `--width` / `--height` 对 I2V 无效（分辨率跟随输入图）
- `--seed` 参数不支持
- **音频轨存在但为空，视频无声 — 必须 FFmpeg 混音**

---

## 5. MiniMax Music API hex vs base64

```python
# ✅ 正确
audio_bytes = bytes.fromhex(audio_hex)
# ❌ 错误
audio_bytes = base64.b64decode(audio_hex)
```

**API payload：**
```json
{"model": "music-2.6", "prompt": "...", "is_instrumental": true, "output_format": "hex"}
```

---

## 6. edge-tts `--write-media` 参数

**`--output` 参数不存在**，正确用法：
```bash
edge-tts --write-media /path/to/output.wav --text "中文文本" --voice zh-CN-XiaoxiaoNeural
```

---

## 7. comfyui-skill JSON 输出解析（易失败）

stdout 可能嵌入其他日志，**必须处理解析失败：**
```python
try:
    data = json.loads(output_text)
except json.JSONDecodeError:
    json_match = re.search(r'\{[^{}]*(?:\"path\"|\"status\")[^{}]*\}', output_text, re.DOTALL)
    if json_match:
        data = json.loads(json_match.group(0))
```

---

## 8. FFmpeg concat demuxer 必须用绝对路径

```python
# ✅ 正确
vf_abs = os.path.abspath(vf).replace("\\", "/")
f.write(f"file '{vf_abs}'\n")

# ❌ 错误：相对路径在 FFmpeg 工作目录不匹配
f.write(f"file '{vf}'\n")
```

---

## 9. LTX I2V 输出视频完全无声（2026-05-18 新发现）

**症状：** `ltx_23_i2v_distilled` 输出的 MP4 有空音频轨，视频完全无声。

**判断方法：**
```bash
ffprobe -v quiet -show_streams output.mp4 | grep codec_type
# 输出 video + audio 两条 stream，但 audio 的 nb_frames=0
```

**处理流程（必须执行）：**
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

**常见错误：** 跳过 Step 4 直接交付 `video_raw.mp4`，用户播放发现完全无声。

---

## 10. script.md shot 标题正则陷阱（2026-05-18 新发现）

**症状：** `--with-audio` 识别不到旁白，输出 "无旁白文件"。

**根因：** `script.md` 用 `### shot_XXX`（三级标题），正则只匹配 `##`：
```python
# ❌ 错误
m = re.match(r'^##\s*(shot_\d+)', line)
# ✅ 正确
m = re.match(r'^#{2,3}\s*(shot_\d+)', line)
```

**建议：** 统一用 `## shot_XXX` 二级标题。

---

## 11. bridge 脚本音频复用策略（2026-05-18）

`--with-audio --skip-comfy` 时跳过 TTS/BGM 重新生成，复用已有文件：

**旁白复用：** 扫描 `audio/vo/shot_*.wav`
```python
vo_dir = os.path.join(args.audio_dir, "vo")
vo_files = {}
if os.path.isdir(vo_dir):
    for f in os.listdir(vo_dir):
        if f.endswith(".wav") and f.startswith("shot_"):
            vo_files[f.replace(".wav", "")] = os.path.join(vo_dir, f)
```

**BGM 复用优先级：** `main.flac` > `main_raw.mp3` > MiniMax API

---

## 视频生成推荐路径（2026-05-18 实测）

| 方案 | 状态 | 调用方式 |
|------|------|---------|
| **图像 Z-Image-Turbo** | ✅ 推荐 | `comfyui-skill generate -p "..."` |
| **LTX 2.3 T2V** | ⭐ 推荐 | `comfyui-skill generate --workflow ltx_23_t2v_distill` |
| **LTX 2.3 I2V** | ⭐ 推荐 | `comfyui-skill generate --workflow ltx_23_i2v_distilled --image input_image=... -p "..."` |
| Wan 2.2 T2V | ❌ 阻塞 | 只能 UI 手动 |
| LTX 2.3（全节点含音频） | ❌ 崩溃 | AudioVAE tensor 维度不匹配 |
