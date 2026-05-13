# Workflow: Critique And Improve

Iteration path when the user already has an image and wants it improved.

## When To Use

- User shares an image (AI-generated or otherwise) and says "help me fix this / iterate on this / 看看怎么改".
- User has a previous output from `gpt_image_generate` and wants a second pass.
- A `gpt_image_review` run produced a deliverable-with-iteration verdict.

Do NOT use for: brand-new assets without a prior image (use `brand-project` or `quick-execution`).

## Steps

1. **Critic** — run `gpt_image_review` on the provided image, passing the brief if known. Get structured 7-dimension scores + P0 flags + prompt patches.
2. If P0 issues present → decide: can they be patched with `gpt_image_edit` + mask (e.g., text area), or do they force a regenerate?
   - **Text P0** → use `gpt_image_edit` with a mask limited to the text area, or remove text and compose externally.
   - **Cultural / legal P0** → regenerate; change the offending layer in the 8-layer template.
   - **Anatomy P0** on hero → regenerate.
3. **Visual Translator** — identify which layer of the 8-layer template needs change based on the review's weakest dimension.
   - Weakest dimension = `visual_hierarchy` → change Layer 3 (camera) or Layer 2 (scene composition).
   - Weakest = `color_harmony` → change Layer 5 (color mood).
   - Weakest = `typography_text` → use `gpt_image_edit` with mask, or remove text.
   - Weakest = `emotional_fit` → change Layer 4 (lighting) and/or Layer 5 (color mood).
   - Weakest = `originality` → change Layer 6 (style reference).
4. **Prompt Director** — produce a new prompt that is **the same as the previous one except for one layer**. Use [../prompt/8-layer-template.md](../prompt/8-layer-template.md) for layer guidance.
5. Pick the tool:
   - **Full regenerate** → `gpt_image_generate --n 1 --quality high`.
   - **Local patch** → `gpt_image_edit --image <prev.png> --mask <mask.png> --prompt <patch>` when you want to preserve most of the image.
   - **Style transfer from reference** → `gpt_image_edit --image <reference.png> --prompt <style-locked-prompt>`.
6. **Critic (again)** — run `gpt_image_review` on the new output. Band must improve; if it does not, you changed the wrong layer.
7. Loop steps 3–6 at most 2 times; if still stuck, escalate — the issue is likely in the brief, not the prompt.

## Modes & Cards Touched

| Step | Mode | Card |
|---|---|---|
| 1 | Critic | aesthetic-7dim |
| 3 | Visual Translator | emotion-visual-map, composition-systems |
| 4 | Prompt Director | 8-layer-template |
| 6 | Critic | aesthetic-7dim |

## Quality Gates

- **Gate C** is enforced at step 6. No silent re-roll without running `gpt_image_review` first.
- If score does not improve after one iteration, pause and ask the user whether to change direction (go back to `brand-project` Gate B) or accept.

## Example

User supplies `prev-kv.png` and says: "感觉贵气，但顶部 headline 文字乱了，整体还是 AI 感。"

- Critic: runs `gpt_image_review`, outputs
  - `typography_text: 2, P0: true` (headline garbled)
  - `originality: 3` (feels AI-default)
  - other dimensions ≥ 4
- Decision: Text P0 → `gpt_image_edit` with mask on headline area, new prompt specifies exact copy and clean typography.
- Originality fix → next pass, swap Layer 6 style reference to a specific editorial name.
- Run `gpt_image_review` again; overall should improve to ≥ 4.

## Anti-patterns

- Running `gpt_image_generate --n 8` "hoping something is better" — same prompt, same default, same bad output.
- Changing 3 layers at once — you cannot attribute the improvement to any one change.
- Accepting an image that still has a text P0 because "it is close enough" — text bugs are the first thing a human sees.
