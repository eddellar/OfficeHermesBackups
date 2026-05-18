# Workflow: Information Design

For infographics, data visualization, process diagrams, tutorial images — where **correctness and legibility outweigh decoration**.

## When To Use

- User asks for an infographic, workflow diagram, data chart, tutorial step image.
- The image must carry **specific information** that must be readable, not just felt.
- Text density is medium-to-high.

Do NOT use for: brand mood pieces (use `brand-project`); decorative-only posters (use `quick-execution`).

## Steps

1. **Problem Definer** — in addition to the 5 standard questions, explicitly capture:
   - `data`: exact numbers / steps / facts that must appear.
   - `primary_question`: what single question should the viewer be able to answer after looking?
   - `reading_order`: what order must the eye consume the information?
   - `truth_source`: where do the numbers come from? (include in the brief so it can be spot-checked.)
2. **Gate A** — confirm the data, primary question and reading order with the user. Treat this as a hard gate; any ambiguity here corrupts the whole image.
3. **Cognitive Lens** — check:
   - [../knowledge/composition-systems.md](../knowledge/composition-systems.md) for a suitable reading path (F-pattern for dense, Z-pattern for single headline, circular for process loops).
   - Cognitive load: ≤ 7 ± 2 elements per group; if more, subdivide.
   - Preattentive attributes: use color / size / position to mark the "punchline number" in a chart.
4. **Visual Translator** — choose:
   - Emotion: usually `authority / clinical` or `calm` ([../knowledge/emotion-visual-map.md](../knowledge/emotion-visual-map.md)).
   - Archetype: usually `Sage` or `Creator` ([../knowledge/brand-archetypes.md](../knowledge/brand-archetypes.md)).
   - Palette: restrained. **One accent color reserved for the punchline** (data point with the highest importance).
5. **Gate B** — sketch the layout verbally to the user (even ASCII grid is fine), including where each piece of data lives. Confirm before drawing.
6. **Prompt Director** — assemble prompt; Layer 7 (text) is critical here.
   - Declare **exact copy**, **language**, **typography family** in the prompt.
   - Prefer to render the image without baked text, and compose the final text in a real design tool. If you must render text, reserve generous margin and expect to patch via `gpt_image_edit` + mask for any text defects.
7. Call `gpt_image_generate --n 2 --quality high`.
8. **Gate C** — run `gpt_image_review` with the rubric. For info design, **`typography_text` and `functionality` have stricter thresholds**: any text error is a P0; any misread chart is a P0.
9. If text-only defects: `gpt_image_edit` with mask on the text area.
10. If structure defects: regenerate with revised Layer 2 (scene / layout instruction).

## Modes & Cards Touched

| Step | Mode | Card |
|---|---|---|
| 1 | Problem Definer (extended) | — |
| 3 | Cognitive Lens | composition-systems |
| 4 | Visual Translator | emotion-visual-map (authority row), brand-archetypes (Sage) |
| 6 | Prompt Director | 8-layer-template (esp. Layer 7 text) |
| 8 | Critic | aesthetic-7dim (typography weight doubles here) |

## Quality Gates

- **Gate A** after step 2 — data and reading order locked.
- **Gate B** after step 5 — layout sketch confirmed.
- **Gate C** after step 8 — text correctness and chart readability checked.

Any P0 in text or functionality blocks delivery regardless of weighted score.

## Example

User: "Make an infographic that shows the 5 steps of the 2026 AI image workflow. 1. Define problem. 2. Translate emotion. 3. Compose prompt. 4. Generate. 5. Review."

- Problem Definer: goal = marketer education; audience = non-designer marketer; data = the 5 steps, one sentence each; reading_order = top-to-bottom; primary_question = "what are the steps in order?"
- Cognitive Lens: F-pattern, 5 horizontal rows, one accent color for step numbers, restrained palette.
- Visual Translator: emotion = authority + calm; archetype = Sage; palette = off-white background / deep blue text / warm amber accent for step numbers only.
- Prompt Director: 8-layer prompt, Layer 7 declares the 5 step titles exactly; no decorative illustration; 1:1 or 4:5 depending on platform.
- Generate `--n 2 --quality high`. Review. If text defects, patch with `gpt_image_edit`.

## Anti-patterns

- Adding decorative illustrations "to make it nicer" — they steal attention from data.
- Using all caps for data labels — hurts legibility.
- Letting the model hallucinate numbers — always lock numbers in Layer 7; verify post-generation.
- Accepting an image where a chart axis is wrong — it will teach the user something false.
