# ComfyUI Workflow Generator

## Description

Generate ready-to-use ComfyUI workflow JSON files through natural language conversation. Users describe what they want to create, and this skill produces valid ComfyUI API-format JSON that can be directly imported and executed.

## Activation

Trigger when the user asks to:
- Create/generate a ComfyUI workflow
- Make an image generation workflow
- Build a video generation pipeline
- Set up txt2img, img2img, img2vid, txt2vid workflows
- Generate a ComfyUI JSON file

Trigger keywords: comfyui, workflow, 工作流, 文生图, 图生图, 文生视频, 图生视频, txt2img, img2img, txt2vid, img2vid, upscale, 放大, inpaint, 重绘, controlnet, lora, sd3, flux, ltxv, mochi, cosmos, stable audio, 音频生成, hunyuan3d, 3d生成, stable cascade, 图生3d

## Instructions

### Step 1: Understand User Intent

Ask the user what they want to create. Gather:

1. **Task type**: txt2img / img2img / txt2vid / img2vid / upscale / inpaint / audio / 3d
2. **Model**: SD1.5 / SDXL / FLUX / SD3 / Wan2.2 / HunyuanVideo / LTXV / Mochi / Cosmos / StableAudio / Hunyuan3D / StableCascade
3. **Key parameters**: resolution, steps, CFG, sampler
4. **Optional modules**: ControlNet, LoRA, IPAdapter, upscale model
5. **Prompt content**: positive and negative prompts

If the user is vague, suggest the most common configuration for their task type.

### Step 2: Select and Compose Template

Based on user intent, load the appropriate base template from `templates/` directory and customize it:

1. Read the matching template JSON file
2. Modify parameters according to user requirements
3. Add optional modules (ControlNet, LoRA, etc.) by inserting additional nodes and links
4. Validate the workflow DAG structure

**Fallback — Official Template Repository:** If no matching template is found in the local `templates/` directory, search the ComfyUI official template repository: https://github.com/Comfy-Org/workflow_templates/tree/main/templates . The official repo contains 443 templates across 9 categories (Image / Video / Audio / 3D / LLM / Utility / Use Cases / Getting Started / Node Basics). First read `templates/index.json` to find a matching template name, then download the corresponding JSON file to use as the base template. The official templates use the same format as this project (LiteGraph UI format, version 0.4).

### Step 3: Generate and Deliver

1. Output the complete workflow JSON (Litegraph UI format)
2. Save it to a `.json` file if the user requests
3. **MANDATORY: Add `models` array to the JSON top level** — extract ALL model filenames from nodes (ckpt_name, unet_name, vae_name, clip_name, lora_name, etc.), look up their download URLs from the Model Download Guide below, and include them. This makes ComfyUI auto-prompt download for missing models on import.
4. Provide a brief explanation of the workflow structure
5. List any required custom nodes the user needs to install

### Workflow JSON Format Rules

**CRITICAL — follow these rules exactly:**

- Use **Litegraph UI format** (NOT API format) — with `nodes` array, `links` array, `version: 0.4`
- Top-level MUST have: `id` (UUID string), `revision` (0), `last_node_id`, `last_link_id`, `nodes`, `links`, `groups` ([]), `config` ({}), `extra` ({}), `version` (0.4)
- Each node has: `id` (int), `type`, `pos` ([x,y]), `size` ([w,h]), `flags` ({}), `order` (int), `mode` (0), `inputs`, `outputs`, `properties`, `widgets_values`
- Node inputs include BOTH connection inputs (`{"name": "model", "type": "MODEL", "link": 4}`) AND widget inputs (`{"name": "seed", "type": "INT", "widget": {"name": "seed"}, "link": null}`)
- All inputs/outputs should have `label` and `localized_name` fields matching `name`
- Links format: `[link_id, source_node_id, source_slot, target_node_id, target_slot, "TYPE"]`
- `widgets_values` array order must match the widget inputs order
- Every workflow MUST have at least one output node (SaveImage, PreviewImage, SaveVideo, etc.)
- All `required` inputs must be provided (check `references/nodes/index.md` and the category files under `references/nodes/`, plus `references/node-registry-additions.md`)
- Values must satisfy min/max constraints
- For model/file selection inputs (ckpt_name, lora_name, etc.), use the real model filenames from the Model Download Guide below
- **MANDATORY: Every workflow JSON MUST include a top-level `models` array.** Scan all nodes for model file references (ckpt_name, unet_name, vae_name, clip_name, clip_name1, clip_name2, clip_name3, control_net_name, lora_name, model_name) and add each referenced model to the `models` array with `name`, `url` (direct HuggingFace resolve link), and `directory`. This enables ComfyUI to auto-detect missing models and prompt the user to download them on import. Example:
```json
"models": [
  {"name": "flux1-dev.safetensors", "url": "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors", "directory": "diffusion_models"},
  {"name": "clip_l.safetensors", "url": "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors", "directory": "text_encoders"}
]
```

### Common Output Slot Mappings

```
CheckpointLoaderSimple: 0=MODEL, 1=CLIP, 2=VAE
UNETLoader:             0=MODEL
CLIPLoader:             0=CLIP
DualCLIPLoader:         0=CLIP
VAELoader:              0=VAE
LoraLoader:             0=MODEL, 1=CLIP
CLIPTextEncode:         0=CONDITIONING
EmptyLatentImage:       0=LATENT
KSampler:               0=LATENT
VAEDecode:              0=IMAGE
LoadImage:              0=IMAGE, 1=MASK
ControlNetLoader:       0=CONTROL_NET
UpscaleModelLoader:     0=UPSCALE_MODEL
ImageUpscaleWithModel:  0=IMAGE
CLIPVisionLoader:       0=CLIP_VISION
CLIPVisionEncode:       0=CLIP_VISION_OUTPUT
```

### LLM / Text Generation Nodes (comfyui_LLM_party)

ComfyUI integrates LLM via **comfyui_LLM_party** custom node package (需安装: https://github.com/heshengtao/comfyui_LLM_party).

**IMPORTANT:** When user requests a workflow with LLM (script generation, character parsing, storyboard breakdown, prompt enhancement), you MUST:
1. **Ask the user which LLM provider they want to use** (OpenAI / Claude / Gemini / Ollama / DeepSeek / other)
2. **Ask for their model preference** or recommend the latest best model for their use case
3. Use the corresponding loader node and configure accordingly

#### Supported Providers & Loader Nodes

| Provider | Loader Node | base_url | Recommended Model |
|----------|------------|----------|-------------------|
| OpenAI | `LLM_api_loader` | `https://api.openai.com/v1` | gpt-4.1 |
| Claude | `aisuite_loader` (provider="anthropic") | `https://api.anthropic.com/v1` | claude-sonnet-4-20250514 |
| Gemini | `LLM_api_loader` | `https://generativelanguage.googleapis.com/v1beta/openai` | gemini-2.5-flash |
| DeepSeek | `LLM_api_loader` | `https://api.deepseek.com/v1` | deepseek-chat |
| Ollama (local) | `LLM_api_loader` (is_ollama=true) | `http://127.0.0.1:11434/v1/` | qwen2.5:14b |
| OpenAI-compatible | `LLM_api_loader` | user-provided | user-provided |

#### CRITICAL: Exact class_type Names (use these EXACTLY in workflow JSON)

**DO NOT invent node names. Only use these exact class_type strings:**

| class_type (exact) | Purpose | Source |
|---------------------|---------|--------|
| `LLM_api_loader` | Load API LLM (OpenAI/Claude/Gemini/DeepSeek/Ollama) | llm.py |
| `easy_LLM_api_loader` | Simplified API LLM loader (preset models) | llm.py |
| `aisuite_loader` | Multi-provider loader (anthropic/aws/google/huggingface) | llm.py |
| `LLM` | Main LLM chat node (multi-turn, vision, tools) | llm.py |
| `LLM_local` | Local model chat node | llm.py |
| `LLM_local_loader` | Load local LLM model | llm.py |
| `mini_party` | Quick single-turn LLM call | custom_tool/miniparty.py |
| `CLIPTextEncode_party` | Convert STRING → CONDITIONING (bridge LLM→image) | llm.py |
| `KSampler_party` | KSampler variant for party workflows | llm.py |
| `VAEDecode_party` | VAEDecode variant for party workflows | llm.py |
| `json_extractor` | Clean/repair JSON from LLM output | custom_tool/json_extractor.py |
| `json_get_value` | Extract field from JSON by key | custom_tool/json_parser.py |
| `text2json` | Convert text lines to JSON | custom_tool/text2json.py |
| `show_text_party` | Display text (debug/preview) | llm.py |
| `string_logic` | Conditional string routing | llm.py |
| `string_combine` | Concatenate strings | llm.py |
| `string_combine_plus` | Concatenate many strings | llm.py |
| `load_persona` | Load preset persona/system prompt | llm.py |
| `custom_persona` | Custom persona with {variable} templates | llm.py |
| `replace_string` | Find and replace in strings | llm.py |
| `substring` | Extract substring | llm.py |

#### Core LLM Nodes — Detailed Specs

**LLM_api_loader** (class_type: `LLM_api_loader`)
- **Inputs:** model_name (STRING), base_url (STRING, optional), api_key (STRING, optional), is_ollama (BOOLEAN, optional)
- **Outputs:** model (CUSTOM) [slot 0]
- **Widget values order:** [model_name, base_url, api_key, is_ollama]

**LLM** (class_type: `LLM`)
- **Inputs (required):** system_prompt (STRING, widget), user_prompt (STRING, widget), model (CUSTOM, connection from loader), temperature (FLOAT, widget, default=0.7), is_memory (COMBO "enable"/"disable", widget), is_tools_in_sys_prompt (COMBO, widget), is_locked (COMBO, widget), main_brain (COMBO, widget), max_length (INT, widget, default=1920)
- **Inputs (optional):** system_prompt_input (STRING, connection), user_prompt_input (STRING, connection), tools (STRING), file_content (STRING), images (IMAGE)
- **Outputs:** assistant_response (STRING) [slot 0], history (STRING) [slot 1], tool (STRING) [slot 2], image (IMAGE) [slot 3]

**mini_party** (class_type: `mini_party`)
- **Inputs:** input_str (STRING, connection), prompt (STRING, widget), model_name (STRING, widget), base_url (STRING, widget), api_key (STRING, widget), is_enable (BOOLEAN, widget)
- **Outputs:** STRING [slot 0]

#### LLM Output → Image/Video Bridge Nodes

**CLIPTextEncode_party** (class_type: `CLIPTextEncode_party`)
- **Inputs:** clip (CLIP, connection), text (STRING, connection from LLM output)
- **Outputs:** CONDITIONING [slot 0]
- **Usage:** Bridge LLM text → image generation. Connect LLM.assistant_response → CLIPTextEncode_party.text

**json_extractor** (class_type: `json_extractor`)
- **Inputs:** input (STRING, connection)
- **Outputs:** STRING [slot 0] (cleaned/repaired JSON)

**json_get_value** (class_type: `json_get_value`)
- **Inputs:** text (STRING, connection), key (STRING, widget)
- **Outputs:** ANY [slot 0] (extracted value)

#### LLM Workflow Patterns

**Pattern: Multi-stage video production pipeline**
```
LLM_api_loader(model, base_url, api_key) → model
  ↓
LLM(model, system="You are a screenwriter", user="Write a script about: {input}") → script
  ↓
LLM(model, system="Extract all characters as JSON", user=script) → characters_json
  ↓
json_extractor(characters_json) → clean JSON → json_get_value(key="character_1.appearance") → prompt
  ↓
CLIPTextEncode_party(prompt) or CLIPTextEncodeFlux(prompt) → CONDITIONING → FLUX → character_ref_image
  ↓
LLM(model, system="Break into 10 shots with video prompts", user=script) → shots_json
  ↓
For each shot:
  json_get_value(shots_json, "shot_N.description") → scene_prompt
  FLUX(scene_prompt + IP-Adapter(character_ref)) → shot_ref_image
  WanImageToVideo(shot_ref_image + video_prompt) → 10s video clip
```

**Pattern: Simple prompt enhancement**
```
mini_party(input="a cat", prompt="Enhance this into a detailed image prompt") → enhanced_prompt
  ↓
CLIPTextEncode_party(enhanced_prompt) → CONDITIONING → KSampler → image
```

### Node Reference

**IMPORTANT: Do NOT read the entire node registry at once. Read only the category you need.**

1. First read the index: `references/nodes/index.md` — lists all 42 categories with file pointers
2. Then read only the specific category file you need, e.g.:
   - `references/nodes/01-loaders.md` — CheckpointLoaderSimple, UNETLoader, VAELoader, CLIPLoader, LoraLoader
   - `references/nodes/02-conditioning.md` — CLIPTextEncode, CLIPTextEncodeFlux, CLIPTextEncodeSD3
   - `references/nodes/07-video-wan.md` — WanImageToVideo, WanCameraImageToVideo, WanFirstLastFrameToVideo
   - `references/nodes/09-flux.md` — CLIPTextEncodeFlux, BasicGuider, SamplerCustomAdvanced
   - `references/nodes/15-custom-samplers.md` — BasicScheduler, KSamplerSelect, RandomNoise
   - `references/nodes/21-audio.md` — StableAudio, EmptyLatentAudio, VAEDecodeAudio
   - `references/nodes/22-ltxv.md` — EmptyLTXVLatentVideo, LTXVImgToVideo
   - `references/nodes/25-cosmos.md` — EmptyCosmosLatentVideo, CosmosImageToVideoLatent
   - `references/nodes/31-hunyuan-3d.md` — Hunyuan3Dv2Conditioning, VAEDecodeHunyuan3D, SaveGLB
3. Also available:
   - `references/workflow-format.md` — JSON format specification
   - `references/common-workflows.md` — common workflow patterns and best practices

### Available Templates

#### Text-to-Image
| Template | File | Description |
|----------|------|-------------|
| SD 1.5 Text to Image | `templates/sd15-txt2img.json` | Basic SD 1.5 text-to-image |
| SDXL Text to Image | `templates/sdxl-txt2img.json` | SDXL with dual CLIP encoding |
| SD3 Text to Image | `templates/sd3-txt2img.json` | SD3 with TripleCLIPLoader + CLIPTextEncodeSD3 |
| FLUX Text to Image | `templates/flux-txt2img.json` | FLUX.1 with guidance, advanced sampling |

#### Image-to-Image
| Template | File | Description |
|----------|------|-------------|
| SD 1.5 Image to Image | `templates/sd15-img2img.json` | SD 1.5 img2img with VAEEncode |
| SDXL Image to Image | `templates/sdxl-img2img.json` | SDXL img2img |
| FLUX Image to Image | `templates/flux-img2img.json` | FLUX img2img with advanced sampling |

#### LoRA
| Template | File | Description |
|----------|------|-------------|
| SD 1.5 + LoRA | `templates/sd15-lora.json` | SD 1.5 with LoRA loading |
| SDXL + LoRA | `templates/sdxl-lora.json` | SDXL with LoRA loading |
| FLUX + LoRA | `templates/flux-lora.json` | FLUX.1 with LoRA loading |

#### ControlNet
| Template | File | Description |
|----------|------|-------------|
| SD 1.5 + ControlNet | `templates/sd15-controlnet.json` | SD 1.5 with ControlNet |
| SDXL + ControlNet | `templates/sdxl-controlnet.json` | SDXL with ControlNetApplyAdvanced |

#### Inpainting
| Template | File | Description |
|----------|------|-------------|
| SD 1.5 Inpaint | `templates/sd15-inpaint.json` | SD 1.5 inpainting workflow |
| SDXL Inpaint | `templates/sdxl-inpaint.json` | SDXL inpainting with VAEEncodeForInpaint |

#### Video Generation
| Template | File | Description |
|----------|------|-------------|
| Wan 2.2 Text to Video | `templates/wan22-txt2vid.json` | Wan 2.2 text-to-video (832x480, 81 frames) |
| Wan 2.2 Image to Video | `templates/wan22-img2vid.json` | Wan 2.2 image-to-video with CLIP vision |
| Wan 2.2 First-Last Frame | `templates/wan22-first-last.json` | Wan 2.2 first+last frame interpolation |
| Wan 2.2 Fun Control | `templates/wan22-fun-control.json` | Wan 2.2 control video + reference image |
| Wan 2.2 Camera Control | `templates/wan22-camera.json` | Wan 2.2 camera motion control |
| HunyuanVideo T2V | `templates/hunyuan-video.json` | HunyuanVideo text-to-video |
| HunyuanVideo I2V | `templates/hunyuan-video-i2v.json` | HunyuanVideo image-to-video |
| LTXV Text to Video | `templates/ltxv-txt2vid.json` | LTXV text-to-video (768x512, 97 frames) |
| LTXV Image to Video | `templates/ltxv-img2vid.json` | LTXV image-to-video with LTXVImgToVideo |
| Mochi Text to Video | `templates/mochi-txt2vid.json` | Mochi text-to-video (848x480, 25 frames) |
| Cosmos Text to Video | `templates/cosmos-txt2vid.json` | Cosmos text-to-video (1280x704, 121 frames) |
| Cosmos Image to Video | `templates/cosmos-img2vid.json` | Cosmos image-to-video with start frame |

#### Upscale
| Template | File | Description |
|----------|------|-------------|
| Image Upscale | `templates/upscale-model.json` | Upscale with model (RealESRGAN etc.) |

#### Audio
| Template | File | Description |
|----------|------|-------------|
| Stable Audio | `templates/stable-audio.json` | Stable Audio generation (47s audio) |

#### 3D Generation
| Template | File | Description |
|----------|------|-------------|
| Hunyuan3D v2 | `templates/hunyuan3d-v2.json` | Image to 3D mesh with Hunyuan3D v2 |

#### Special Architectures
| Template | File | Description |
|----------|------|-------------|
| Stable Cascade | `templates/stable-cascade.json` | Two-stage (Stage C + Stage B) generation |

#### LLM Integration (requires comfyui_LLM_party)
| Template | File | Description |
|----------|------|-------------|
| LLM Chat (API) | `templates/comfyui_LLM_party/llm-chat-api.json` | API LLM chat (OpenAI/Gemini/DeepSeek) |
| LLM Chat (Ollama) | `templates/comfyui_LLM_party/llm-chat-ollama.json` | Local Ollama LLM chat |
| LLM Prompt Enhance | `templates/comfyui_LLM_party/llm-prompt-enhance.json` | LLM enhances prompt → FLUX generates image |
| LLM Script to Video | `templates/comfyui_LLM_party/llm-script-to-video.json` | LLM script → characters → storyboard pipeline |

**CRITICAL RULE: ComfyUI auto-adds a hidden `control_after_generate` widget after every seed INT that has `control_after_generate: True`. You MUST include `"randomize"` in widgets_values right after every seed value. This applies to KSampler, RandomNoise, and any node with a seed INT.**

### Quality Checklist

Before delivering a workflow, verify:
- [ ] Top-level has `id`, `revision`, `last_node_id`, `last_link_id`, `nodes`, `links`, `groups`, `config`, `extra`, `version`
- [ ] Every node has `id`, `type`, `pos`, `size`, `flags`, `order`, `mode`, `inputs`, `outputs`, `properties`
- [ ] Widget inputs are included in `inputs` array with `"widget": {"name": ...}, "link": null`
- [ ] `widgets_values` order matches widget inputs order
- [ ] All links are `[link_id, src_node_id, src_slot, tgt_node_id, tgt_slot, "TYPE"]`
- [ ] At least one output node exists (SaveImage/PreviewImage/SaveVideo)
- [ ] No circular dependencies
- [ ] Parameter values are within valid ranges

### Step 4: Output Model Download Guide

After generating the workflow JSON, ALWAYS output a **Model Download Guide** section listing every model file referenced in the workflow. For each model, provide:

1. **Model name** — the exact filename used in `widgets_values`
2. **What it is** — checkpoint / VAE / CLIP / LoRA / ControlNet / Upscale model
3. **Where to put it** — the ComfyUI subdirectory (`models/checkpoints/`, `models/vae/`, etc.)
4. **Download source** — HuggingFace or CivitAI URL

Use this reference table for common models:

#### SD 1.5
| Model | Directory | Download |
|-------|-----------|----------|
| v1-5-pruned-emaonly.safetensors | models/checkpoints/ | https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5 |
| sd-v1-5-inpainting.ckpt | models/checkpoints/ | https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting |

#### SDXL
| Model | Directory | Download |
|-------|-----------|----------|
| sd_xl_base_1.0.safetensors | models/checkpoints/ | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |

#### FLUX
| Model | Directory | Download |
|-------|-----------|----------|
| flux1-dev.safetensors | models/diffusion_models/ | https://huggingface.co/black-forest-labs/FLUX.1-dev |
| clip_l.safetensors | models/text_encoders/ | https://huggingface.co/comfyanonymous/flux_text_encoders |
| t5xxl_fp16.safetensors | models/text_encoders/ | https://huggingface.co/comfyanonymous/flux_text_encoders |
| ae.safetensors | models/vae/ | https://huggingface.co/black-forest-labs/FLUX.1-dev (in ae.safetensors) |

#### Wan 2.2
| Model | Directory | Download |
|-------|-----------|----------|
| wan2.2_t2v_14b.safetensors | models/diffusion_models/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| wan2.2_i2v_480p_14b.safetensors | models/diffusion_models/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| wan2.2_i2v_720p_14b.safetensors | models/diffusion_models/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| umt5_xxl_fp16.safetensors | models/text_encoders/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| open_clip_vit_h.safetensors | models/text_encoders/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| wan_2.1_vae.safetensors | models/vae/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| clip_vision_h.safetensors | models/clip_vision/ | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |

#### HunyuanVideo
| Model | Directory | Download |
|-------|-----------|----------|
| hunyuan_video_t2v_720p_bf16.safetensors | models/diffusion_models/ | https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged |
| hunyuan_video_vae_bf16.safetensors | models/vae/ | https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged |
| llava_llama3_fp16.safetensors | models/text_encoders/ | https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged |
| clip_l.safetensors | models/text_encoders/ | https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged |

#### ControlNet (SD 1.5)
| Model | Directory | Download |
|-------|-----------|----------|
| control_v11p_sd15_canny.safetensors | models/controlnet/ | https://huggingface.co/lllyasviel/ControlNet-v1-1 |
| control_v11p_sd15_openpose.safetensors | models/controlnet/ | https://huggingface.co/lllyasviel/ControlNet-v1-1 |
| control_v11f1p_sd15_depth.safetensors | models/controlnet/ | https://huggingface.co/lllyasviel/ControlNet-v1-1 |

#### Upscale Models
| Model | Directory | Download |
|-------|-----------|----------|
| RealESRGAN_x4plus.pth | models/upscale_models/ | https://huggingface.co/ai-forever/Real-ESRGAN |
| RealESRGAN_x4plus_anime_6B.pth | models/upscale_models/ | https://huggingface.co/ai-forever/Real-ESRGAN |
| 4x-UltraSharp.pth | models/upscale_models/ | https://github.com/Kim2091/UltraSharp |


---

## Specialised Workflows

### StableAudio Audio Generation (ComfyUI)

Audio generation via `stabilityai/stable-audio-open-1.0` in ComfyUI. Use `use_diffuser_pipe=true` (k-diffusion unavailable on embedded Python 3.13).

**Model prep:** Download full diffusers format + `fma_dataset_attribution2.csv` to `models/diffusers/stable-audio-open-1.0/`. The node scans this CSV to populate the dropdown — without it the dropdown stays empty.

**Critical node settings:**

| Node | Setting |
|------|---------|
| `StableAudio_ModelLoader` | `local_model_path`: `stable-audio-open-1.0`, `repo_id`: **leave empty `""`** (empty → local; non-empty → HuggingFace API → 403/gated) |
| `StableAudio_Sampler` | `cfg`: **1.0** (audio works best at cfg=1), `scheduler`: `k-lms` only |

**Code patch required** in `StableAudio_Open_Node.py`: after `StableAudioPipeline.from_pretrained(...)`, add `model.to("cuda")` — diffusers pipeline defaults to CPU but sampler passes CUDA generator.

**⚠️ Audio tensor handling:** `.audios[0]` from diffusers pipeline may be a CUDA Tensor. Use `isinstance(audio_tensor, torch.Tensor)` to branch before `.T.float().cpu()`.

**Python API submission example** (v0.20.1):
```python
import urllib.request, json
prompt = {
    "2": {"class_type": "StableAudio_ModelLoader", "inputs": {"local_model_path": "stable-audio-open-1.0", "repo_id": "", "use_diffuser_pipe": True}},
    "3": {"class_type": "ConditioningStableAudio", "inputs": {"positive": "描述", "negative": "", "seconds_start": 0, "seconds_total": 30}},
    "4": {"class_type": "StableAudio_Sampler", "inputs": {"model": ["2", 0], "info": ["2", 1], "prompt": "描述", "negative_prompt": "", "step": 100, "cfg": 1.0, "batch_size": 1, "sigma_min": 0.1, "sigma_max": 100.0, "seconds_start": 0, "seconds_total": 30, "init_noise_level": 1.0, "seed": 42, "scheduler": "k-lms"}},
    "5": {"class_type": "SaveAudio", "inputs": {"audio": ["4", 0], "filename_prefix": "stableaudio_test"}}
}
data = json.dumps({"prompt": prompt}).encode()
req = urllib.request.Request("http://127.0.0.1:8188/prompt", data=data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    pid = json.load(resp)["prompt_id"]
# Poll: GET http://127.0.0.1:8188/history/{pid}
```

---

### 3-Shot LTX Video → 素笺漫拾 Production Pipeline

3-shot nature video (14s, 720×1280 @24fps) → FFmpeg concat → MiniMax music → final deliverable.

**Fixed parameters:**
- Resolution: 720×1280 (竖屏 9:16, WeChat video standard)
- Per shot: 5s / 120 frames / 24fps
- Model: LTX 2.3, steps=40, CFG=4.0, sampler=euler_ancestral, scheduler=sgm_uniform
- VRAM ceiling: ≤26GB for 720×1280 @120 frames

**Node chain for v0.20.1** (no `ModelSamplingLTXV` exists):
```
CheckpointLoaderSimple → LTXAVTextEncoderLoader → CLIPTextEncode(+/-)
  → EmptyLTXVLatentVideo → LTXVConditioning → KSampler → VAEDecode → CreateVideo → SaveVideo
```

**⚠️ CLIP from CheckpointLoaderSimple is NOT usable for LTX.** Use `LTXAVTextEncoderLoader` + `gemma_3_12B_it_fp4_mixed.safetensors` for all CLIPTextEncode nodes.

**Submit via direct Python urllib — NOT MCP** (`execute_workflow` returns HTTP 500):
```python
import urllib.request, json, time
COMFY_URL = "http://127.0.0.1:8188"
data = json.dumps({"prompt": prompt}).encode()
req = urllib.request.Request(f"{COMFY_URL}/api/prompt", data=data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    pid = json.load(resp)["prompt_id"]
# Poll via GET {COMFY_URL}/history/{pid} — NOT /prompt/{pid} (404)
while True:
    with urllib.request.urlopen(f"{COMFY_URL}/history/{pid}") as resp:
        h = json.load(resp)
        if pid in h and h[pid].get("outputs"):
            break
    time.sleep(5)
```

**FFmpeg concat (UTF-8, no BOM — BOM with Chinese filenames causes concat demuxer failure):**
```python
with open('concat.txt', 'w', encoding='utf-8') as f:
    for fn in ['第1段.mp4', '第2段.mp4', '第3段.mp4']:
        f.write(f'file "{fn}"\n')
# Then: ffmpeg -y -f concat -safe 0 -i concat.txt -c copy output.mp4
```

**FFmpeg mix music:**
```bash
ffmpeg -y -i video.mp4 -i music.mp3 \
  -filter_complex "[1:a]atrim=0:14.1,afade=t=out:st=13:d=1.1,volume=0.7[audio]" \
  -map 0:v -map "[audio]" -c:v copy -c:a aac -b:a 192k output_with_music.mp4
```

**MiniMax music prompt formula:**
```
Chinese healing ambient, traditional {guzheng/xiao/bamboo_flute}, {scene}, {mood}, peaceful melancholy, cinematic instrumental soundtrack, no vocals
```
Set `is_instrumental: true`, `output_format: "hex"`, decode with `bytes.fromhex()`.

---

### ComfyUI ↔ Hermes Integration (Windows/WSL)

**Network:** Hermes (WSL) → `http://127.0.0.1:8188` → ComfyUI (Windows). `192.168.x.x:8188` is blocked by Windows Firewall.

**Startup:**
```bash
cd /mnt/e/ComfyUI_windows_portable
./python_embeded/python.exe -s ComfyUI/main.py --windows-standalone-build \
  --listen 0.0.0.0 --port 8188 --enable-cors-header \
  --disable-smart-memory --disable-auto-launch
```

**VRAM:** Apply `--disable-cuda-malloc` in `launcher/config.json` ("extra_args"). Without it, comfy-aimdo's cudaMallocAsync causes wildly incorrect VRAM reporting. Verify with `GET /system_stats` → `allocator: "native"`.

**ComfyUI Manager v4.x (pip, not git):**
```bash
# v4.x is pip-installed to embedded Python, NOT cloned to Custom_Nodes/
git clone --branch 4.2.1 --depth=1 https://github.com/ltdrdata/ComfyUI-Manager.git /tmp/Manager
/mnt/e/ComfyUI_windows_portable/python_embeded/python.exe -m pip install . --quiet
# Requires BOTH flags: --enable-manager --enable-manager-legacy-ui
```

**TensorRT (optional):** `tensorrt>=10.0.1` wheel install fails on embedded Python 3.13 (wheel_stub.buildapi broken). Fix:
```bash
python3 -m pip install tensorrt --extra-index-url https://pypi.nvidia.com --no-build-isolation
```

**Troubleshooting:**
- `CLIPTextEncode: clip input is invalid` → Wrong text encoder. For LTX: must use `LTXAVTextEncoderLoader`.
- `/prompt` returns HTTP 500 → Check for float values where int expected. Use `int()` explicitly.
- Execute MCP returns HTTP 500 → Always use direct Python REST API instead.

**Wan 2.2 clarification:** `comfyui_wan_video` nodes do NOT exist in v0.20.1. Actual local nodes: `WanAnimateToVideo` (I2V, needs start image), `Wan22ImageToVideoLatent`, `LTXVImgToVideo`. Pure T2V: use LTX 2.3.

---

### ComfyUI via comfyui-skill CLI

Run ComfyUI workflows via the `comfyui-skill` CLI (alternative to direct API):

```bash
# Prerequisites
pip install -U comfyui-skill-cli
cd /path/to/comfyui-skill   # CLI reads config.json from CWD

# List workflows
comfyui-skill --json list

# Pre-flight dependency check (always run before first use)
comfyui-skill --json deps check <server_id>/<workflow_id>

# Execute (blocking)
comfyui-skill --json run <id> --args '{"prompt": "..."}'

# Execute (non-blocking + poll)
comfyui-skill --json submit <id> --args '{"prompt": "..."}'  # → prompt_id
comfyui-skill --json status <prompt_id>

# Upload image (for img2img)
comfyui-skill --json upload /path/to/image.png

# Import workflow
comfyui-skill --json workflow import /path/to/workflow.json
```

**⚠️ CWD matters:** CLI reads `config.json` and `data/` from current directory. Running from wrong directory → `list` returns `[]`, `server status` not found.

**Workflow import** auto-detects API vs editor format, auto-converts, generates `schema.json`.


---

#### Output Format Example
After the workflow JSON, output like this:

```
## 模型下载指南

本工作流需要以下模型文件：

1. **wan2.2_t2v_14b.safetensors** (扩散模型)
   - 放置目录: `ComfyUI/models/diffusion_models/`
   - 下载地址: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

2. **umt5_xxl_fp16.safetensors** (文本编码器)
   - 放置目录: `ComfyUI/models/text_encoders/`
   - 下载地址: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

...

💡 提示: 可使用 `huggingface-cli download` 命令批量下载
```
