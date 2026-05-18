---
name: comfyui-agent-skill-mie
description: >
  Agent skill for running registered ComfyUI workflows through a stable CLI.
  Supports image, video, music, and speech generation on a local or trusted self-hosted
  ComfyUI server (default http://127.0.0.1:8188). Registered workflows only.
hermes:
  trigger: ["comfyui-agent-skill", "comfyui skill mie", "comfyui-skill"]
  auto_load: false
category: creative
---

# comfyui-agent-skill-mie

## Purpose

Run registered ComfyUI workflows through a stable Agent-facing CLI, with prompt enhancement, fail-fast errors, and structured JSON results.

Use this skill when the user asks to:
- Generate an image from text.
- Generate a new image inspired by a reference image.
- Edit an input image while preserving some structure or subject details.
- Generate text-to-video or image-to-video MP4 output.
- Generate music / instrumental / song-style MP3 output.
- Synthesize spoken voice audio with Qwen3-TTS.
- Check whether a ComfyUI server is available.

Do not use this skill when the user only wants prompt writing, brainstorming, or discussion without actual generation. Do not use it when the ComfyUI server is unavailable.

## Hard Rules

- Source mode: run CLI commands from the skill root (the directory containing `SKILL.md` and `scripts/`).
- Tool-install mode: `comfyui-agent-skill-mie` / `comfyui-skill` can be run from any directory.
- Source mode: use `uv run --no-sync python -m comfyui` (or `uv run --no-sync comfyui-skill`) for runtime calls.
- Tool-install mode: use `comfyui-skill` (or `comfyui-agent-skill-mie`) directly; do not wrap with `uv run`.
- Use registered workflows only. Do not run arbitrary unreviewed ComfyUI workflow JSON.
- If server health fails, stop generation and return/handle `SERVER_UNAVAILABLE`; do not search disk for ComfyUI installs or guess ports.
- Do not create or edit `config.local.json` unless the user explicitly wants a persistent server URL. For one-off runs, use `--server` or `COMFYUI_URL`.
- For `reference_to_image`, inspect the reference image with Agent vision and create a prompt. Do not upload that reference image to ComfyUI.
- For `image_to_image` and `image_to_video`, upload the provided local image with `--image`.
- Analyzer-generated workflow configs require human review before activation.

## Workflow Selection Policy

- Built-in defaults are fallback choices, not hard requirements.
- If another registered workflow is a stronger semantic match for the request, prefer the stronger match.
- Use workflow capability metadata and workflow selection guidance to choose among registered workflows.
- Any automatic workflow selection in the CLI is only a low-risk fallback when no explicit workflow has been chosen.
- If multiple workflows appear suitable and the user's preference is ambiguous, ask a brief clarifying question.

## Setup

Recommended install (tool-install mode):

```bash
uv tool install comfyui-agent-skill-mie
```

- Install package: `comfyui-agent-skill-mie`
- Main command: `comfyui-agent-skill-mie`
- Short alias: `comfyui-skill`

Prerequisites:

- ComfyUI server with `GET /system_stats` available.
- Python 3.10+.
- Source mode only: `uv`.
- Required ComfyUI models/custom nodes for the selected workflow.

**Current ComfyUI path (Windows, 2026-05-08):** `E:\ComfyUI_Mie_2026_V8.0`（ComfyUI-nunchaku v1.2.1, ComfyUI v0.20.1）

**启动 ComfyUI（WSL）：**
```bash
cd /mnt/e/ComfyUI_Mie_2026_V8.0 && python_embeded/python.exe -s ComfyUI/main.py --windows-standalone-build --fast fp16_accumulation --disable-smart-memory --disable-auto-launch --enable-manager --enable-manager-legacy-ui --listen 0.0.0.0 --port 8188
```

**Networking note (WSL + Windows ComfyUI):**

- WSL 直接访问 Windows ComfyUI：`http://127.0.0.1:8188`
- 勿用 `192.168.1.2:8188`（会被 Windows 防火墙拦截）
- 若 agent 运行在 WSL 而 ComfyUI 在宿主机，`127.0.0.1` 即指向 ComfyUI 本身，无需额外配置

Initial setup from the skill root:

```bash
uv sync
uv run --no-sync python -m comfyui --help
```

Tool-install mode:

```bash
comfyui-agent-skill-mie --help
comfyui-skill --help
```

## Quick Workflow Choice

| User intent | Workflow / mode | Required command shape |
|-------------|-----------------|------------------------|
| Text to image (general fallback) | `z_image_turbo` | `generate -p "prompt"` |
| Poster / embedded text (preferred) | `qwen_image_2512_4step` | `generate --workflow qwen_image_2512_4step -p "prompt"` |
| Similar image from reference | Agent vision + T2I | Read reference image, create English prompt, then T2I |
| Edit image | `klein_edit` | `generate --workflow klein_edit --image input_image=photo.png -p "edit prompt"` |
| Text to video | `ltx_23_t2v_distill` | `comfyui-skill generate --workflow ltx_23_t2v_distill -p "..."` (fixed 768×512, no --width/--height/--steps) |
| Image to video | `ltx_23_i2v_distilled` | `comfyui-skill generate --workflow ltx_23_i2v_distilled --image input_image=photo.png -p "motion prompt"` (resolution follows input image; output has empty audio track — always mix in BGM via FFmpeg) |
| Text to music | `ace_step_15_music` | `comfyui-skill generate --workflow ace_step_15_music -p "music tags"` |
| Text to speech | `qwen3_tts` | `comfyui-skill generate --workflow qwen3_tts --speech-text "..." --instruct "..."` |

## Core Commands

Environment doctor (check server + preflight registered workflows):

Tool-install mode:

```bash
comfyui-skill doctor
```

Health check:

```bash
comfyui-skill check
```

Generate an image:

```bash
comfyui-skill generate -p "a cute cat sitting on a windowsill at golden hour"
```

Save a persistent server URL:

```bash
comfyui-skill save-server http://127.0.0.1:8188
```

## Health Check Results (2026-05-08)

### LTX 模型路径与 400 错误根因

**已知 Bug（2026-05-08）：** `ltx_23_t2v_distill` 和 `ltx_23_i2v_distilled` 执行时总是报 400 Bad Request，错误信息为 `ckpt_name: 'LTX-2.3\\...' not in [...]`。

**根因：** workflow JSON 文件中模型路径为 `LTX-2.3\`（带连字符），但 ComfyUI 实际模型目录为 `LTX2.3\`（无连字符）。doctor/preflight 检查只验证节点类型，不验证模型路径是否匹配，所以显示 PASS。

**修复方法：** 替换所有 workflow JSON 副本中的路径（需在每次 comfyui-skill 更新后重复）：

```bash
find /home/eddellar -name "ltx-23-t2v.json" -exec sed -i 's/LTX-2\.3\\/LTX2.3\\/g' {} \; -print 2>/dev/null
find /home/eddellar -name "ltx-23-i2v.json" -exec sed -i 's/LTX-2\.3\\/LTX2.3\\/g' {} \; -print 2>/dev/null
echo "Done. Restart ComfyUI."
```

主要副本位置（glob 匹配顺序）：
- `~/.cache/uv/archive-v0/*/comfyui/assets/workflows/`
- `~/comfyui-agent-skill/assets/workflows/`
- `~/comfyui-agent-skill/scripts/comfyui/assets/workflows/`
- `~/.local/share/uv/tools/comfyui-agent-skill-mie/lib/python*/site-packages/comfyui/assets/workflows/`

**ComfyUI 启动后需重新扫描模型才能识别新路径：** `kill` 现有进程 → 重启 ComfyUI → 等待 ~15s。

**LTX 模型实际位置（E:\ComfyUI_Mie_2026_V8.0）：**
```
ComfyUI/models/checkpoints/LTX2.3/ltx-2.3-22b-dev-fp8.safetensors  (28GB)
ComfyUI/models/loras/LTX2.3/ltx-2.3-22b-distilled-lora-384.safetensors
ComfyUI/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors
```

**各工作流实际状态（2026-05-14 已验证）：**

- `z_image_turbo` ✅ CLI 正常；`NunchakuZImageDiTLoader` + `CLIPTextEncodeLumina2` 节点链在直接 REST API 调用时崩溃（`KeyError: 'weight'`，量化配置解析 bug），但 `comfyui-skill` CLI 内部处理方式可绕过，Z-Image-Turbo 图像生成统一走 CLI。
- **直接 REST API 调用备选方案（当 CLI 不可用时）：** SD1.5 + `CheckpointLoaderSimple` + `MajicmixRealistic_v7` + `CLIPTextEncode` + `VAEDecode`，路径 `SD1.5\\majicmixRealistic_v7.safetensors`。
- `qwen_image_2512_4step` ✅ 正常
- `klein_edit` ✅ 正常
- `ltx_23_t2v_distill` ✅ 正常（修复 JSON 后可用）
- `ltx_23_i2v_distilled` ✅ 正常（修复 JSON 后可用）
- `qwen3_tts` ✅ 正常
- `ace_step_15_music` ✅ 正常

**Result Delivery (Mandatory)**

**Every generation result must be sent via Feishu.** Do NOT just save to local path and tell the user to find it themselves.

**Required delivery format (confirmed working 2026-05-08):**
```
✅ [任务描述]！

workflow: [workflow name]
尺寸: [W×H]
seed: [seed]

MEDIA:[Linux路径]
```
Note: `MEDIA:/mnt/e/...` Linux path format works for Feishu (not the Windows absolute path). Copy to `/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/` first, then reference as `MEDIA:/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[filename].png`.

**Feishu formatting rules (important):**
- DO NOT use Markdown tables — Feishu renders them misaligned
- Use plain text lists instead, confirmed to render cleanly

**Path handling (critical):**
- comfyui-skill outputs to Linux paths: `/home/eddellar/.local/share/comfyui-skill/results/...`
- Always copy to a Windows-mounted path before sending to Feishu:
  ```bash
  cp [linux_result_path] /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/[descriptive_name].png
  ```
- Use `MEDIA:/mnt/e/...` format for Feishu image delivery (confirmed working 2026-05-08). Windows absolute paths do NOT work with the MEDIA: prefix.

**ComfyUI server management:**
- If `comfyui-skill generate` returns `SERVER_UNAVAILABLE`, the server is not running.
- To start ComfyUI: use `terminal(background=true)` with the startup command from the Setup section.
- Wait ~15s after startup, then verify with `curl http://127.0.0.1:8188/system_stats` before attempting generation.
- Use `comfyui-skill check` for a quick health probe before starting a generation session.

**Example complete flow:**
```bash
# 1. Generate
comfyui-skill generate -p "beautiful Chinese model, bikini, city street" 2>&1

# 2. Copy to Windows-accessible path (result path from JSON output)
cp /home/eddellar/.local/share/comfyui-skill/results/.../z_00001_.png \
   /mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/model_test.png

# 3. Send via Feishu with MEDIA: reference to the Windows path
```

**Wan 2.2 T2V API — Critical Findings (2026-05-09)**

**Problem A: `WanVideoModelLoader` rejects T2V models**
- The `model` dropdown ONLY accepts: `Wan2.2\Animate\Wan2.2-Animate-14B-Q6_K.gguf` and ~10 non-Wan models
- `Wan2.2\T2V\wan2.2_t2v_high_noise_14B_fp16.safetensors` and `wan2.2_t2v_low_noise_14B_fp16.safetensors` are NOT in the accepted list
- This happens even when the workflow JSON uses the exact same path format as working image models
- **Workaround**: Use `Wan2TextToVideoApi` node (see Problem B) or use `ltx_23_t2v_distill` via `comfyui-skill`

**Problem B: `Wan2TextToVideoApi` returns "Prompt has no outputs"**
- This API node should be the correct path for Wan T2V via REST API
- The node accepts `model: {wan2.7-t2v: {...}}` format
- But submitting via `/prompt` returns `prompt_no_outputs` regardless of workflow construction
- Likely a ComfyUI 1.x UUID-format blueprint compatibility issue in the node itself
- **Status**: Unresolved via direct API. Use `ltx_23_t2v_distill` via `comfyui-skill` for all T2V needs.

**Problem C: `ltx_23_t2v_distill` fails with `--seed` argument**
- `comfyui-skill generate --seed N` returns `INVALID_PARAM` — `--seed` is not a supported flag
- Seeds ARE returned in the JSON metadata of the output: `metadata.seed`
- To reproduce a specific seed: note it from metadata, but cannot directly rerun with same seed via CLI

**Background Process Handling**
- When running long generations (music, video) via `terminal(background=true, notify_on_complete=true)`:
  - The `notify_on_complete` notification fires but `process` still shows `running`
  - Poll with `process(action='wait', session_id=..., timeout=55)` repeatedly until `exited`
  - `timeout` clamps at 55s per call — call multiple times for longer processes
  - When `exited` with `exit_code: 0`, check the script's `print()` output for final result

**Pitfalls**

- **🚀 正确工作流：始终用 `comfyui-skill generate` 生成图像。** 用户明确要求使用 `comfyui-skill mie` — 这不是可选项而是唯一正确路径。直接用 MCP 工具或手写 REST API 调用（即使看着能工作）会遇到节点链崩溃（Z-Image-Turbo）或路径错误（portable vs Mie 实例混淆）。
- **❌ `-o` 不是有效短选项。** argparse 只定义了 `--output`（长选项），`-o` 会导致 `INVALID_PARAM: unrecognized arguments: -o`。必须用 `--output DIR`。来源：2026-05-18 调试 session。
- **❌ `--output` 是目录，不是文件路径。** comfyui-skill 把 `--output` 参数值当作输出目录，生成的文件以 `z_XXXXX_.png`（图片）或 `i2v_XXXXX-audio.mp4`（视频）为文件名放在该目录下。不要传 `.png` 后缀的文件名给它，应该传目录路径，然后从输出目录找最新文件。来源：2026-05-18 调试 session。
- **❌ 直接 subprocess 调用 comfyui-skill 会报 INVALID_PARAM（venv PATH 冲突）。** 从 Python subprocess 直接调用时，venv 的 `python3` ELF 二进制优先于 shell script wrapper，导致 comfyui-skill 无法正确执行。必须用 `bash -lc` 包装：`subprocess.run(['bash', '-lc', inner_cmd], shell=False)`。注意：`shell=True` 时 Python 会额外套一层 `sh -c`，导致引号嵌套解析错误，所以 `shell=False` 同样关键。来源：2026-05-18 调试 session。
- **❌ 不要用 `--result-json` — 此参数不存在。** `comfyui-skill generate` 的输出是纯文本 JSON 直接打印到 stdout，不是通过 flag 指定的。解析 `subprocess.run(...).stdout` 的 JSON 即可。flags: `-p/--prompt`, `--output`, `-w/--workflow`, `--count`, `--width`, `--height`, `--server`, `--image`, `--progress`, `--preflight`, `--skip-preflight`, `--submit`, `--poll`, `--poll-all`, `--speech-text`, `--instruct`。
- **CRITICAL: MCP 工具连接错误的 ComfyUI 实例。** `mcp_comfy_cozy_*` 工具连接 `E:\\\\ComfyUI_windows_portable`，该实例缺少 Z-Image-Turbo（只有 Ace_Step/SD1.5/LTX 模型）。`comfyui-skill` CLI 路由到 `E:\\\\ComfyUI_Mie_2026_V8.0`，拥有 Z-Image-Turbo。MCP 工具仅用于辅助查询（服务器健康、队列状态、历史记录）。
  - `set_input` → `Gate denied 'set_input': Tool 'set_input' is REVERSIBLE but no undo capability is available`
  - `save_workflow` → `Gate denied 'save_workflow': Tool 'save_workflow' is REVERSIBLE but no undo capability is available`
  - `get_editable_fields` → `This workflow was saved without execution data`
  - The blueprint workflow loads but has zero editable fields and zero connections — it cannot be configured or executed via MCP.
  The only correct path for ANY image task is `comfyui-skill generate -p "prompt"`. MCP tools are for auxiliary queries only (server health, queue status, history).
- **Output paths differ between instances.** Mie V8.0 results from `comfyui-skill` land in `/home/eddellar/.local/share/comfyui-skill/results/...` — copy to `/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/` before sending to Feishu. Portable ComfyUI outputs to `/mnt/e/ComfyUI_windows_portable/ComfyUI/output/` but the MCP `get_output_path` tool is unreliable for this path.
- **Feishu cannot render Markdown tables.** Use plain text lists for status reports and structured data. Confirmed by user feedback — tables appear misaligned/garbled in Feishu messages.
- **ComfyUI cannot analyze images.** It is a generation-only tool (T2I, T2V, I2V, TTS, music). There is no registered image-analysis workflow. The `reference_to_image` procedure uses **Agent vision** to inspect the reference image — it does NOT upload to ComfyUI for analysis.
- When the user asks to "analyze image with ComfyUI," ComfyUI is the wrong tool. Use Agent vision tool directly, then feed the resulting description into a T2I workflow.
- Image paths from Feishu/other caches may be inaccessible to ComfyUI (path outside allowed dirs) or to Agent vision. Use `/tmp/` as a staging area and verify the file is a valid JPEG/PNG before passing it to any tool.
- **MEDIA paths for Feishu: use Linux paths.** The `MEDIA:/mnt/e/...` format (Linux path to Windows mounted drive) works for Feishu. The skill's older documentation incorrectly claimed Feishu was excluded from MEDIA routing — this was wrong as of 2026-05-08. Windows absolute paths like `E:\...` do NOT work as MEDIA values for Feishu.
- **Always copy results to `/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/`** before sending to Feishu. The Linux result path from `comfyui-skill` JSON output is temporary; the Windows-mounted copy is what gets sent.
- **LTX video workflows: doctor may show PASS but execution fails 400.** The root cause is a path mismatch in the workflow JSON (`LTX-2.3\` vs `LTX2.3\`). Run the `sed` fix from the Section above (LTX Model Path) to fix the JSON files, then restart ComfyUI. See `references/ltx-debugging.md` for the full diagnosis procedure.
- **MiniMax-M2.7-highspeed model image analysis:** Use `mcp_minimax_understand_image` (not `vision_analyze` or Agent-native vision). Image paths from Feishu uploads land in `/home/eddellar/.hermes/image_cache/` — pass the Linux-format path (e.g. `/home/eddellar/.hermes/image_cache/img_2c7930ea9333.jpg`). The tool returns structured Chinese description of the image content.

## References

- `references/workflows.md` — workflow selection, capabilities, size rules, examples.
- `references/cli.md` — CLI contract, async jobs, output paths, JSON schemas, error codes.
- `references/prompt_enhancement/` — prompt enhancement instructions.
- `references/reference-to-image.md` — how `reference_to_image` actually works (vision → prompt → T2I, not ComfyUI upload).
- `references/subprocess-invocation.md` — Python subprocess 调用 comfyui-skill 的正确模式（bash -lc + shell=False + --output 是目录）。
- `references/comfyui-mcp-pitfalls.md` — ComfyUI MCP 执行陷阱：路径拒绝（user/default/workflows/ 下 JSON 被 Access denied）、输出路径错误（get_output_path 返回错误路径）、历史记录格式（GET /history 返回列表而非字典）。包含 Python REST API 完整调用模板。**注意：此文件已废弃，所有图像生成任务统一用 `comfyui-skill generate`，MCP 工具仅用于检查队列/历史等辅助查询。**
