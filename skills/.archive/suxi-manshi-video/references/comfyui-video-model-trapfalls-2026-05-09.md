# ComfyUI 视频模型陷阱（2026-05-09）

## 1. LTX 2.3 AudioVAE 解码崩溃

**症状：**
- `LTXVLatentUpsampler` 内部 `AudioVAE.per_channel_statistics` 属性缺失
- `LTXVAudioVAEDecode` 张量维度不匹配：`tensor a (1408) vs tensor b (128)` at non-singleton dimension 2
- 所有6段视频全部在 `LTXVLatentUpsampler` 节点报错

**根因：** ComfyUI-MieNodes 的 `LTXVAudioVAELoader` / `LTXVAudioVAEDecode` 与 LTX 2.3 模型的 AudioVAE 版本不兼容。

**绕过方案：**
从工作流中**移除所有音频相关节点**，只保留纯视频 latent 链：
```
LTXVideoDiffusionEngine
  → LTXVEulerScheduler
  → LTXVDecodingScheduler  
  → LTXVDistributedSampling
  → LTXVAutoEncoder (只输出 video latent, 无 audio)
  → LTXVVideoLatentToRGBA
  → VAEDecodeTiled
  → SaveVideo
```
音频单独用 FFmpeg 或 MiniMax Music 生成后混音。

---

## 2. Wan 2.2 T2V 模型路径被拒绝

**症状：**
- `WanVideoModelLoader` 的 `model` 下拉列表**不含** `Wan2.2\\T2V\\` 路径
- 可用列表：`Wan2.2\\Animate\\Wan2.2-Animate-14B-Q6_K.gguf`（唯一 Wan 2.2 选项）
- `Text to Video (Wan 2.2)` 蓝图是 ComfyUI 1.x UUID 格式，REST API 无法解析

**尝试过的失败路径（2026-05-09 确认全部失败）：**
```
Wan2.2\\T2V\\wan2.2_t2v_high_noise_14B_fp16.safetensors  → HTTP 400 不在允许列表
Wan2.2/T2V/wan2.2_t2v_low_noise_14B_fp16.safetensors   → HTTP 400 不在允许列表
Wan2.2\\Animate\\Wan2.2-Animate-14B-Q6_K.gguf           → HTTP 400 不在允许列表
Wan2TextToVideoApi (UUID blueprint, single node)         → "Prompt has no outputs"
```

**WanVideoModelLoader 允许的模型（2026-05-09 确认）：**
```
Flux\\Flux.2-Klein\\flux-2-klein-9b-Q6_K.gguf
Qwen_Image\\qwen-image-2512-Q6_K.gguf
Qwen_Image_Edit\\Qwen_Image_Edit_2511\\qwen-image-edit-2511-Q6_K.gguf
Wan2.1\\i2v\\GGUF\\wan2.1-i2v-14b-480p-Q6_K.gguf
Wan2.2\\Animate\\Wan2.2-Animate-14B-Q6_K.gguf    ← Wan 2.2 唯一选项（Animate，非 T2V）
Ace_Step_1.5\\acestep_v1.5_turbo.safetensors
IC-Light\\iclight_sd15_fbc_unet_ldm.safetensors
IC-Light\\iclight_sd15_fc_unet_ldm.safetensors
IC-Light\\iclight_sd15_fcon.safetensors
MelBandRoformer_fp16.safetensors
Wan2.1\\Wan2_1-InfiniTetalk-Single_fp16.safetensors
Z-Image-Turbo\\z_image_turbo_bf16.safetensors
```

**`Wan2TextToVideoApi` 节点细节：**
- 是 ComfyUI 1.x 云端 API 节点，期望通过 `wan2.7-t2v` 内嵌对象传入
- REST `/prompt` 提交时报 `"Prompt has no outputs"` — 因为内嵌 model 对象不满足输出节点要求
- 蓝图文件 UUID 格式无法被 REST API 解析
- 即使通过 UI 加载蓝图，`Wan2TextToVideoApi` 作为内嵌对象传入 `WanVideoModelLoader` 的 `model` 参数时，REST API 验证也报 400

**结论：Wan 2.2 T2V 当前无法通过 API 调用，只能通过 UI 手动操作。**

---

## 视频生成推荐路径（2026-05-09 实测）

| 方案 | 状态 | 调用方式 |
|------|------|---------|
| **LTX 2.3（纯视频）** | ⭐ 推荐 | `comfyui-skill generate --workflow ltx_23_t2v_distill` |
| Wan 2.2 T2V | ❌ 阻塞 | 只能 UI 手动，无法 API |
| LTX 2.3（全节点含音频） | ❌ 崩溃 | AudioVAE tensor 维度不匹配 |
