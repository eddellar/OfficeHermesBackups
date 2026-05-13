# Workflow Reference

Source: `~/comfyui-agent-skill/references/workflows.md`

## Registered Workflows

Stable (reviewed configs in `assets/workflows/*.config.json`):

- `z_image_turbo` (text-to-image)
- `klein_edit` (image edit)
- `qwen3_tts` (text-to-speech)
- `ltx_23_t2v_distill` (text-to-video)
- `ltx_23_i2v_distilled` (image-to-video)
- `ace_step_15_music` (music/audio)
- `qwen_image_2512_4step` (text-to-image)

## Workflow Details

Source of truth: the runtime registry is derived from `assets/workflows/*.config.json` (and the corresponding `assets/workflows/*.json` workflow files). If this list drifts, trust the configs and `python -m comfyui generate --help` output.

## Z-Image-Turbo Quick Reference

Default workflow for all text-to-image tasks. Produces 832×1280 output.

```bash
# Generate (Mie V8.0, not portable ComfyUI)
comfyui-skill generate -p "your prompt here" --output category/name

# Copy result to Feishu-accessible path
cp /home/eddellar/.local/share/comfyui-skill/results/.../z_XXXXX_.png \
   /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/category/name.png

# Send via Feishu
# Use MEDIA:/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/category/name.png
```

Key signals from this session (2026-05-11):
- Always use `comfyui-skill generate` for image generation, NOT MCP tools (those connect to wrong instance)
- `--output` flag gives meaningful subfolder names in result path
- Z-Image-Turbo model: `diffusion_models/Z-Image-Turbo/z_image_turbo_bf16.safetensors` (in `diffusion_models/`, NOT `checkpoints/`)
