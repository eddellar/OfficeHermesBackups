---
name: food-character-video
description: >
  AI-generated food characters as social media personas — from character design and
  consistent visual identity through short video production for WeChat video accounts
  and similar platforms. Covers character definition, batch image generation,
  storyboarding, and video production. Does NOT cover the 素笺漫拾-style healing
  account (use suxi-manshi-video for that).
hermes:
  trigger: ["food character", "包子天团", "打工包", "baozi series", "拟人化食物视频"]
  auto_load: false
category: social-media
version: 1.0.0
---

# Food Character Video Pipeline

## What This Skill Covers

AI-generated anthropomorphic food characters as social media personalities on WeChat video
accounts and similar platforms. End-to-end pipeline:

1. Define fixed character roster with consistent visual identity
2. Generate character art (batch, consistent style)
3. Plan story series (EP-based content calendar)
4. Write storyboard scripts (shot-by-shot)
5. Generate video clips (LTX 2.3 via comfyui-skill)
6. Add music/sound effects
7. Deliver via Feishu

This skill is for accounts with **no fixed theme** — pure entertainment/character-driven
content. For 素笺漫拾-style themed accounts, use the `suxi-manshi-video` skill instead.

## Character Definition

### Core Principle: Fix the Roster First
Before any generation, define and permanently save the character roster. Each character needs:
- Visual: color, shape, distinguishing feature, common expressions
- Persona: job/role, catchphrase, personality traits
- Consistency: same seed, same style prompts, same physical features across all images

### Example: 打工包天团 (Working Baozi Squad)
Five fixed characters with permanent visual identity:

| Character | Visual | Persona |
|-----------|--------|---------|
| 白包子 | White, pleated top, dot eyes + smile, tiny feet | HR — "没关系，慢慢来" |
| 棕包子 | Dark chocolate brown, smooth matte finish, same features | 996 Programmer — "这个bug今天必须修完" |
| 水晶虾饺 | Translucent, visible pink filling | Anxious Intern — "好的！收到！我来学！" |
| 绿包子 | Light green, dark green speckles | Fitness Coach — "管住嘴迈开腿！" |
| 金黄烤包子 | Golden brown caramelized top | Startup CEO — "下个月一定上市！" |

### Character Visual Reference (Critical)

Before batch generating any character art, the user MUST provide a reference image showing the exact visual appearance. The model may invent wrong colors/features if not explicitly guided.

**Confirmed visual roster (2026-05-11):**

| Character | Color | Distinguishing Feature | Expression |
|-----------|-------|----------------------|------------|
| 白包子 | Pure white | Vertical pleated folds on top | Black dot eyes, U-shaped smile, blush |
| 棕包子 | Dark chocolate brown | Smooth matte body, same pleats | Same kawaii expression |
| 水晶虾饺 | Translucent clear | Visible pink shrimp filling inside, thin delicate pleats | Same expression, slightly nervous |
| 绿包子 | Light green | Dark green speckles/dots scattered | Same expression |
| 金黄烤包子 | Golden yellow | Brown caramelized roasted spot on top center | Same expression, confident |

**Common features across all**: round chubby body, tiny little feet at bottom, soft studio lighting, pastel background.

### Visual Consistency Pitfall

The model tends to invent incorrect colors (e.g., generating grey instead of the confirmed dark brown). When regenerating characters:

1. ALWAYS reference the user's confirmed reference image first via `mcp_minimax_understand_image`
2. Describe the EXACT colors and features back to the user for verification
3. Include all distinguishing features explicitly in prompts: "dark chocolate brown", "translucent clear body showing pink filling", "brown caramelized spot on top", "dark green speckles"
4. Do NOT rely on character name alone — names like "black baozi" will produce grey instead of brown

## Image Generation (comfyui-skill, Z-Image-Turbo)

### The Golden Rule
**ALWAYS use `comfyui-skill generate` for image generation. NEVER use MCP tools
(`mcp_comfy_cozy_*`).**

MCP tools connect to `E:\\ComfyUI_windows_portable` which lacks Z-Image-Turbo and
produces wrong-style outputs. The `comfyui-skill` CLI routes to `E:\\ComfyUI_Mie_2026_V8.0`
which has Z-Image-Turbo and produces consistent illustration-style output.

What happens if you use MCP tools: `set_input` raises `Gate denied`, `save_workflow` raises
`Gate denied`, the blueprint workflow has no editable fields, and any image produced comes
out photo-realistic instead of kawaii-style illustration.

### Command Pattern
```bash
cd /home/eddellar/.hermes/skills/creative/comfyui-agent-skill-mie
comfyui-skill generate -p "English prompt describing the character and scene"
```

### Batch Generation Pattern
Generate characters sequentially to avoid server overload:
```bash
comfyui-skill generate -p "Character A prompt"  # wait for completion
comfyui-skill generate -p "Character B prompt"  # wait for completion
# etc.
```

### Output Handling
Results land in: `/home/eddellar/.local/share/comfyui-skill/results/[date]/[job_id]/[filename].png`

Always copy to Windows-accessible output directory before Feishu:
```bash
cp [result_path] /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[descriptive_name].png
```

### Feishu Delivery
Use `MEDIA:/mnt/e/...` Linux path format. Windows absolute paths do NOT work.
Send with descriptive text: character name, seed, dimensions.

## Video Production (LTX 2.3)

### ⚠️ CRITICAL: Always Use I2V for Character-Consistent Video

**T2V (`ltx_23_t2v_distill`) generates characters from scratch — they will NOT match your fixed character designs.** The AI invents new appearances based on text descriptions, losing all the work put into consistent character art.

**I2V (`ltx_23_i2v_distilled`) preserves character identity.** When you pass a reference image, the model keeps the character's visual features while adding motion.

**Rule: For ANY video featuring your fixed characters, ALWAYS use `ltx_23_i2v_distilled`.** Only use T2V for establishing shots with no character faces.

### Parameters
- Resolution: 768×512 (horizontal — LTX I2V fixed output, no vertical option)
- Segments: 5 seconds / 120 frames / 24fps per clip
- Steps: 40, CFG: 4.0
- Sampler: euler_ancestral, scheduler: sgm_uniform
- Vertical video: crop with FFmpeg post-processing (see below)

### I2V Workflow — Step by Step

**Step 1: Prepare reference images**
Each character in the scene needs their confirmed portrait/image as input. Gather the appropriate image files (e.g., `baozi_job_hr.png`, `baozi_job_programmer.png`, etc.)

**Step 2: Generate with I2V**
```bash
cd /home/eddellar/.hermes/skills/creative/comfyui-agent-skill-mie

# Single character scene
comfyui-skill generate --workflow ltx_23_i2v_distilled \
  --image /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[character_ref].png \
  -p "Motion description for this character"

# Multiple characters in one scene — generate separately per character,
# then composite in editing
```

**Image path format:** Use bare absolute path (not `KEY=PATH` format). The workflow has a `LoadImage` node expecting `1_00081_.png` in the node — comfyui-skill routes the image to that node automatically.

**Step 3: Copy results**
```bash
cp /home/eddellar/.local/share/comfyui-skill/results/[date]/[job_id]/i2v_XXXXX-audio.mp4 \
   /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[descriptive_name].mp4
```

**Step 4: Crop to vertical (9:16) with FFmpeg**
LTX I2V outputs 768×512 horizontal. For vertical 9:16:
```bash
ffmpeg -i input.mp4 -vf "crop=ih*9/16:ih:x=(iw-iw*9/16)/2:y=0" \
  -c:v libx264 -crf 18 output_vertical.mp4
```
Or use 剪映 (Jianying) for easier visual cropping — import → aspect ratio 9:16 → drag to frame characters → export.

### Known Issues
- `--seed`, `--width`, `--height`, `--steps` flags are NOT supported by the CLI
- Seed appears in output metadata; cannot be directly reproduced via CLI
- I2V produces 768×512 horizontal only — no native vertical output from LTX model
- Audio nodes are broken in full LTX; I2V output `*-audio.mp4` has silent video only

## Storyboard Script Structure

For each episode, write:
- Basic info: duration, format, BGM recommendation
- Shot-by-shot breakdown with timestamps
- Dialogue/subtitle text
- Sound effect notes
- Release timing recommendation
- Copy suggestions and hashtag strategy

## Content Strategy

### Types That Work
1. **打工系列 (Worker Series)** — food characters in workplace scenarios; strong
   emotional resonance with office workers
2. **反差萌系列 (Reverse-Creed Series)** — characters placed in completely wrong
   contexts (CEO on catwalk, fitness coach eating burgers)
3. **深夜食堂 (Late Night Canteen)** —孤独美食家单口相声风格
4. **剧情连续剧 (Serialized Drama)** — cliffhanger endings,粉丝追更

### WeChat Video-Specific Tips
- Release time: 08:30 Monday for work-themed content
- Copy formula: "某场景，某角色反应，你是哪一种？🤚"
- Hashtags: #打工包天团 + #打工人 + relevant niche tags
- Engagement hook: ask "你是哪个包子？" in comments

## Related Skills

- `comfyui-agent-skill-mie` — image and video generation engine
- `suxi-manshi-video` — LTX video production (themed accounts)
- `minimax-music-generation` — background music for videos
- `feishu-file-attachments` — result delivery
