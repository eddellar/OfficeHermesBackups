---
name: comfyui-stableaudio-open
description: 在 ComfyUI 中使用 stable-audio-open-1.0 模型生成音频的完整工作流，包括模型准备、依赖安装、节点补丁和 API 提交方法
triggers:
  - ComfyUI audio generation
  - stable audio open
  - stable-audio-open-1.0
---

# ComfyUI StableAudio Open 工作流

## 模型准备

### 1. 下载完整 diffusers 格式模型
```bash
python3 -c "
from huggingface_hub import HfApi
api = HfApi(token='hf_YOUR_TOKEN')
api.snapshot_download(
    repo_id='stabilityai/stable-audio-open-1.0',
    local_dir='/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/models/diffusers/stable-audio-open-1.0',
    allow_patterns=['*.json','*.safetensors','*.txt','*.bin','*.pt','*.csv']
)
"
```
> 需要先在 https://huggingface.co/stabilityai/stable-audio-open-1.0 申请 access。

### 2. 在 diffusers 目录放置 attribution CSV（关键！）
节点通过扫描 `fma_dataset_attribution2.csv` 来识别 diffusers 目录是否完整：
```bash
hf_hub_download(repo_id='stabilityai/stable-audio-open-1.0',
    filename='fma_dataset_attribution2.csv',
    local_dir='models/diffusers/stable-audio-open-1.0',
    token='hf_YOUR_TOKEN')
```
**没有这个 CSV 文件，`local_model_path` dropdown 里不会出现模型选项。**

## ComfyUI 依赖安装
```bash
/mnt/e/ComfyUI_Mie_2026_V8.0/python_embeded/python.exe -m pip install einops-exts alias-free-torch stable-audio-tools --no-deps
```
安装后**必须重启 ComfyUI**。

## 节点代码补丁（必须）

**文件**: `custom_nodes/ComfyUI_StableAudio_Open/StableAudio_Open_Node.py`

**原因**: `use_diffuser_pipe=True` 时 pipeline 默认留在 CPU，但 sampler 传的是 CUDA generator → 设备不匹配。

在 `loader_main` 方法中，`StableAudioPipeline.from_pretrained(...)` 之后加一行：
```python
model.to("cuda")
```

**Patch B（Sampler audio 类型处理）**：`DiffusersPipeline.from_pretrained()` 返回的 `.audios` 是 CUDA Tensor，不能直接 `from_numpy()` 也不能 `.T`（numpy vs tensor 操作不同）。在 `stableaudio_sampler` 方法中，替换 audio 输出处理：

```python
# 原始代码（报错）:
audio_output = model(...).audios
waveform = audio[0].T.float().cpu().numpy()  # 错：audio[0] 可能是 CUDA Tensor

# 正确代码:
audio_output = model(
    prompt, negative_prompt=negative_prompt,
    num_inference_steps=step, audio_end_in_s=end_in_s,
    num_waveforms_per_prompt=batch_size, generator=generator,
).audios
audio_tensor = audio_output[0]
if isinstance(audio_tensor, torch.Tensor):
    waveform = audio_tensor.T.float().cpu()
else:
    waveform = torch.from_numpy(audio_tensor).T.float().cpu()
```

然后第 177 行 `audio = {"waveform": waveform.unsqueeze(0), ...}` 保持不变（waveform 必须是 Tensor）。

## 工作流配置

| 节点 | 关键设置 |
|------|---------|
| **StableAudio_ModelLoader** | `local_model_path`: `stable-audio-open-1.0`（dropdown 选）<br>`repo_id`: **留空 `""`**（核心！否则走 HuggingFace API 导致 403）<br>`use_diffuser_pipe`: `true` |
| **ConditioningStableAudio** | `positive`: 文字描述<br>`seconds_total`: 生成长度（秒） |
| **StableAudio_Sampler** | `step`: 100<br>`cfg`: 1.0（Audio 通常 cfg=1 效果最好）<br>`seconds_total`: 30<br>`scheduler`: `k-lms`（避免 k_diffusion.external 依赖）<br>`seed`: 自定 |
| **SaveAudio / PreviewAudio** | `audio`: 来自 Sampler |

## 关键踩坑记录

1. **`repo_id` 留空才走本地**：节点代码 `if repo_id == ""` 才用本地路径，否则调用 `get_pretrained_model(repo_id)` 直接从 HuggingFace 下载（gated repo → 403）。
2. **`k-diffusion` 无法安装**：ComfyUI 嵌入式 Python 3.13 与 mesonpy 不兼容，只能用 `use_diffuser_pipe=true`。
3. **Diffusers pipeline 默认 CPU**：必须加 `model.to("cuda")`。
4. **CSV 文件是关键**：节点扫描 diffusers 目录靠 `fma_dataset_attribution2.csv`，没有它 dropdown 里没有选项。
5. **audio[0] 可能是 CUDA Tensor**：Diffusers pipeline 返回的 `.audios[0]` 是 `torch.Tensor`（非 numpy），必须用 `isinstance` 判断再分别处理，直接 `from_numpy()` 或 `.T` 都会报错。

## API 提交流程
```bash
# 提交（注意 class_type 必须有）
curl -X POST http://172.31.0.1:8188/prompt -H "Content-Type: application/json" \
  -d '{"prompt": {
    "2": {"class_type": "StableAudio_ModelLoader", "inputs": {"local_model_path": "stable-audio-open-1.0", "repo_id": "", "use_diffuser_pipe": true}},
    "3": {"class_type": "ConditioningStableAudio", "inputs": {"positive": "描述", "negative": "", "seconds_start": 0, "seconds_total": 30}},
    "4": {"class_type": "StableAudio_Sampler", "inputs": {"model": ["2", 0], "info": ["2", 1], "prompt": "描述", "negative_prompt": "", "step": 100, "cfg": 1.0, "batch_size": 1, "sigma_min": 0.1, "sigma_max": 100.0, "seconds_start": 0, "seconds_total": 30, "init_noise_level": 1.0, "seed": 42, "scheduler": "k-lms"}},
    "5": {"class_type": "SaveAudio", "inputs": {"audio": ["4", 0], "filename_prefix": "stableaudio_test"}}
  }}'

# 查询结果
sleep 120 && curl 'http://172.31.0.1:8188/history/{prompt_id}'
```

## ComfyUI 可用音频节点（已确认）
```
EmptyLatentAudio       LTXVAudioVAELoader    LTXVAudioVAEEncode
VAEEncodeAudio         VAEDecodeAudio        VAEDecodeAudioTiled
SaveAudio              SaveAudioMP3          SaveAudioOpus
LoadAudio              PreviewAudio          ConditioningStableAudio
RecordAudio            TrimAudioDuration     SplitAudioChannels
JoinAudioChannels      AudioConcat           AudioMerge
AudioAdjustVolume      EmptyAudio            AudioEqualizer3Band
LTXVEmptyLatentAudio   LTXVReferenceAudio    WanSoundImageToVideo
WanSoundImageToVideoExtend  TextEncodeAceStepAudio  EmptyAceStepLatentAudio
TextEncodeAceStepAudio1.5
```

## HuggingFace 大型音频模型调研结论

### 没有更大的 Stable Audio 开源模型
`stabilityai/stable-audio-open-1.0`（4.6GB checkpoint）是已开源的**最大** Stable Audio 模型。没有 stable-audio-2 或更大版本可供下载。

### 可用的大型音乐生成模型

| 模型 | 大小 | 格式 | ComfyUI 现状 | 推荐度 |
|------|------|------|-------------|--------|
| `facebook/musicgen-large` | 19 GB | Transformers（原生） | 无现成节点，需自定义集成 | ⭐⭐⭐⭐ 质量最佳 |
| `facebook/musicgen-medium` | 11 GB | Transformers | 无现成节点，需自定义集成 | ⭐⭐⭐ |
| `cvssp/audioldm2-music` | 8.3 GB | Diffusers（`AudioLDM2Pipeline`） | 无现成节点，依赖 `audioldm2` 包 | ⭐⭐⭐ 格式最接近 |
| `stabilityai/stable-audio-open-small` | ~1 GB | Safetensors | 比现有模型更小 | ⭐ |

### 升级路径建议

**路径 A：MusicGen ComfyUI 集成**（约 1-2 小时开发）
- 下载 `facebook/musicgen-large`（19GB）到 `models/checkpoints/`
- 参考 `transformers` 库 `MusicgenPipeline` 编写自定义节点
- 质量会显著优于 stable-audio-open-1.0

**路径 B：AudioLDM2 集成**
- 下载 `cvssp/audioldm2-music`（8.3GB）到 `models/diffusers/audioldm2-music/`
- 尝试安装 `audioldm2` 包到 ComfyUI 的 Python 3.13：`pip install audioldm2 --no-deps`
- 使用 `AudioLDM2Pipeline` 加载，需测试 Python 3.13 兼容性

**路径 C：Suno/Udio API**（推荐，零开发）
- 使用 Suno AI 音乐生成 API，质量和多样性远超任何本地模型
- 适合"素笺漫拾"治愈系背景音乐的场景

## 已知限制
- `stable-audio-open-1.0` 是 gated repo，需要 HuggingFace 授权
- 只能使用 `use_diffuser_pipe=true` 模式（k-diffusion 装不了）
- 采样器仅 `k-lms` 可用（其他需要 k_diffusion.external）
- `stable-audio-open-1.0` 生成音乐**本身就不是专长**，模型设计用于音效，音乐生成质量上限低
