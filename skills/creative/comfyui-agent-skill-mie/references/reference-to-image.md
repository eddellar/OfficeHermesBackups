# reference_to_image — How It Actually Works

**Misconception:** Upload the reference image to ComfyUI and it analyzes/generates from it.
**Reality:** ComfyUI cannot analyze images. It is generation-only. The procedure is:

1. Copy reference image to `/tmp/ref_image.jpg` (staging area)
2. Use `vision_analyze` on `/tmp/ref_image.jpg` to get a rich English description
3. Rewrite the description as a prompt (no reference to "image," focus on style/objects/scene/lighting/mood)
4. Feed the prompt into a T2I workflow (typically `z_image_turbo`)

**Image path troubleshooting:**

| Problem | Fix |
|---------|-----|
| `vision_analyze` can't see the file | Copy to `/tmp/ref_image.jpg` |
| `mcp_comfy_cozy_analyze_image` says "path outside allowed dirs" | ComfyUI doesn't analyze — use Agent vision instead |
| Feishu cache path not accessible | Always copy to `/tmp/` first |
| Invalid/corrupt image | Verify with `file` command: `ffd8ff` header for JPEG |

**Prompt rewriting rules (step 3):**
- Strip "in this image," "the picture shows," etc.
- Replace with: `[subject], [setting], [art style], [lighting], [color palette], [mood], [composition]`
- Keep it in English for best ComfyUI results
- Add quality modifiers: `8k, professional, detailed, cinematic lighting`
