---
name: suxi-manshi-video
description: Use when generating a "素笺漫拾" WeChat video account episode — 3-shot nature/healing video (14s, 720×1280竖屏), LTX 2.3 T2V + MiniMax music. Not for general video generation.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [video, ltx, t2v, chinese-healing, suxi-manshi, wechat-video]
    related_skills: [comfyui, minimax-music-generation]
---

# 素笺漫拾视频生成

生成「素笺漫拾」微信公众号视频号的治愈类短视频。3段5秒竖屏片段（720×1280 @24fps）→ FFmpeg拼接 → MiniMax统一配乐 → 混音输出完整版。

## 视频参数（固定）

| 参数 | 值 |
|------|-----|
| 分辨率 | 720×1280（竖屏 9:16，公众号标准）|
| 每段时长 | 5秒 / 120帧 / 24fps |
| 总时长 | ~14.1秒（3段拼接）|
| 模型 | LTX 2.3（固定本地 T2V 方案）|
| steps | 40 |
| CFG | 4.0 |
| sampler | euler_ancestral |
| scheduler | sgm_uniform |
| 显存安全线 | ≤26GB（720×1280 @120帧 ≈ 26GB）|

## 完整工作流

### Step 1 — 生成3段视频

每段独立提交到 ComfyUI（避免队列堆积）：

**ComfyUI 地址**: `http://127.0.0.1:8188`（WSL 直接访问 Windows localhost）
**注意**：`192.168.1.2:8188` 已被 Windows 防火墙拦截，勿用。
**必须用 direct Python urllib API**，MCP `execute_workflow` 返回 HTTP 500 错误。

Python 提交逻辑（v0.20.1 正确节点链）：
```python
import urllib.request, json, time

COMFY_URL = "http://127.0.0.1:8188"  # ← WSL访问Windows ComfyUI的正确地址

def submit_and_wait(wf, timeout=300):
    data = json.dumps({"prompt": wf}).encode()
    req = urllib.request.Request(f"{COMFY_URL}/api/prompt", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        pid = json.load(resp)["prompt_id"]
    # Wait
    start = time.time()
    while time.time() - start < timeout:
        with urllib.request.urlopen(f"{COMFY_URL}/history/{pid}") as resp:
            h = json.load(resp)
            if pid in h and h[pid].get("outputs"):
                return h[pid]
        time.sleep(5)
    raise TimeoutError(f"Prompt {pid} timed out")
```

**注意**: v0.20.1 没有 `TextToVideo_AnimateDiff_LTX` 节点。正确节点链：
`CheckpointLoaderSimple` → `LTXAVTextEncoderLoader` → `CLIPTextEncode` → `EmptyLTXVLatentVideo` → `LTXVConditioning` → `KSampler` → `VAEDecode` → `CreateVideo` → `SaveVideo`
详见 `comfyui-hermes-integration` skill。

### Step 2 — 拼接视频

```bash
cd "E:\ComfyUI_windows_portable\ComfyUI\output\素笺漫拾\{主题名}\"

# 方法1（推荐）：filter_complex + re-encode（解决中文文件名concat问题）
ffmpeg -y \
  -i "第1段_XXX_00001_.mp4" \
  -i "第2段_XXX_00001_.mp4" \
  -i "第3段_XXX_00001_.mp4" \
  -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]" \
  -map "[outv]" -c:v libx264 -crf 18 -preset fast \
  "{主题名}_完整版.mp4"

# 方法2：concat demuxer（UTF-8编码，避免BOM）
python3 -c "
with open('concat.txt', 'w', encoding='utf-8') as f:
    for fn in ['第1段_XXX_00001_.mp4','第2段_XXX_00001_.mp4','第3段_XXX_00001_.mp4']:
        f.write('file \"' + fn + '\"\n')
" && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy "{主题名}_完整版.mp4"
```

> ⚠️ `printf '\xef\xbb\xbf' > concat.txt` 创建的BOM在FFmpeg concat demuxer中与中文文件名冲突，用Python纯UTF-8写法更可靠。

### Step 3 — 生成统一配乐

用 MiniMax Music-2.6 API（`is_instrumental: true`, `output_format: "hex"`，解码用 `bytes.fromhex()`）：

```
prompt = "Chinese healing ambient, traditional guzheng zither, bamboo flute xiao, [主题意境描述], nostalgic and contemplative, peaceful melancholy, cinematic instrumental soundtrack, no vocals"
```

音乐原始文件保存到 `/tmp/{主题名}_配乐.mp3`。

### Step 4 — 混音

```bash
cd "E:\ComfyUI_windows_portable\ComfyUI\output\素笺漫拾\{主题名}\"

ffmpeg -y \
  -i "{主题名}_完整版.mp4" \
  -i /tmp/{主题名}_配乐.mp3 \
  -filter_complex "[1:a]atrim=0:14.1,afade=t=out:st=13:d=1.1,volume=0.7[audio]" \
  -map 0:v -map "[audio]" \
  -c:v copy -c:a aac -b:a 192k \
  "{主题名}_配乐版.mp4"

# 保留原始配乐
cp /tmp/{主题名}_配乐.mp3 "{主题名}_配乐_原始版.mp3"
```

### Step 5 — 输出文件清单

```
{主题名}_配乐版.mp4      ← 最终交付（推荐）
{主题名}_完整版.mp4      ← 无音乐拼接版
{主题名}_配乐_原始版.mp3 ← 完整配乐（通常 >60s）
第{1,2,3}段_XXX_00001_.mp4  ← 各段原片
```

## 主题库（可循环使用）

**核心类型 — 山水自然：**
- 晨·素笺清欢（已完成：山林晨雾→溪涧清泉→湖畔暮霞）
- 雨巷苔痕（已完成：春雨如丝→苔痕上阶→纸伞红灯）
- 春光明媚秦岭山（已完成：秦岭春晓→林隙春光→山涧春水）

**待开发：**
- 空山新雨（雨后山林）
- 月照花林（月夜花丛）
- 枫桥夜泊（秋夜水乡）

**辅助类型 — 人文意境：**
- 竹窗日影（书房光影）
- 茶烟一缕（茶道静物）

**辅助类型 — 四季分明：**
- 春风拂槛
- 夏夜流萤
- 秋水蒹葭
- 冬雪红炉

**节假日优先级 > 节气/主题库。**

## 节假日映射（优先级最高）

| 日期 | 主题 | 配乐风格 |
|------|------|---------|
| 春节 | 红灯春联 | 喜庆锣鼓+笛子，温暖团聚 |
| 元宵 | 花灯如昼 | 喜庆+古典，提灯夜游 |
| 清明 | 清明雨上 | 忧郁+希望，淅沥小雨 |
| 端午 | 粽香艾草 | 民俗+清雅，古筝+箫 |
| 中秋 | 月满西楼 | 思乡+团圆，琵琶+古琴 |
| 重阳 | 登高望远 | 旷达+怀古，琴箫合鸣 |

## 配乐 Prompt 模板

```
Chinese healing ambient, traditional {guzheng/xiao/bamboo_flute}, {场景意象}, {情绪基调}, peaceful melancholy, cinematic instrumental soundtrack, no vocals
```

| 场景 | 推荐乐器 | 情绪 |
|------|---------|------|
| 山林/晨雾 | guzheng + xiao | 宁静致远 |
| 雨巷/水乡 | guzheng 为主 | 湿润惆怅 |
| 湖畔/夕阳 | piano + flute | 温暖感伤 |
| 雪景/冬日 | xiao 为主 | 清寒空寂 |
| 花丛/春日 | bamboo_flute | 轻盈明快 |

## 常见问题

**MCP execute_workflow 返回 HTTP 500？**
→ 正常，始终用 Python direct urllib 提交。

**配乐 API 超时？**
→ `output_format: "hex"` 且音频>1分钟时，用 `terminal(background=true, notify_on_complete=true)` 后台运行。

**视频文件偏小（如<1MB）？**
→ 色调均匀/偏暗的场景（H.264压缩率高）属正常，不代表质量问题。可用 ffprobe 确认时长/帧率。

**显存溢出？**
→ 确认 720×1280 @120帧，LTX 2.3 应 ≤26GB。1080×1440会爆（44-47GB）。

## 验证清单

- [ ] 3段视频均为 14.1s @ 24fps，可用 ffprobe 确认
- [ ] 拼接版无跳帧（ffmpeg -c copy）
- [ ] 配乐版音画同步（播放检查）
- [ ] 配乐 fade-out 在 ~13s 处开始（最后 1.1s 渐弱）
- [ ] 输出目录结构正确
