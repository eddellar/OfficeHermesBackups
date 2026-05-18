# Workflow: Series And System

Delivering a set of images that must feel like one system — campaign series, feed posts batch, brand template library.

## When To Use

- User asks for multiple images that must share a visual language.
- Scope is 3+ images within one campaign / brand / feed.
- Consistency matters more than individual brilliance.

Do NOT use for: single hero image (use `brand-project`); unrelated one-offs.

## Steps

1. **Problem Definer** — standard 5 questions plus:
   - `series_count`: how many images total?
   - `series_roles`: what role does each image play (hero / lifestyle / product / quote / cta)?
   - `locked_variables`: what must stay the same across the set? Usually a subset of { palette, lighting, framing, texture, character, typography }.
   - `permitted_variance`: what may differ? (e.g. subject, composition angle, scene).
2. **Gate A** — confirm the locked vs. permitted variables with the user. This is the core of consistency; do not guess.
3. **Visual Translator** — define the **system** once:
   - palette family with exact role per color.
   - lighting family (one direction, one temperature, one quality level).
   - framing logic (e.g. "always eye-level, always subject centered in lower third").
   - texture level (e.g. "matte, no gloss anywhere in the set").
   - typography direction (if text on image — family, weight range, scale).
   - brand cues (logo placement, safe area).
4. **Gate B** — describe the system to the user, then state how each series role will vary within it.
5. **Prompt Director** — write a **base prompt** that encodes the locked variables. Then derive per-image prompts by changing only Layer 1 (subject) and Layer 2 (scene). Layers 3–8 stay identical across the set.
6. Generate the set. Prefer **one session per image** with explicit session names:
   - `series-[campaign]-hero` → `gpt_image_generate --n 2 --quality high`
   - `series-[campaign]-lifestyle` → same
   - `series-[campaign]-product` → same
7. **Gate C — consistency check** — run `gpt_image_consistency` on all selected finals together, with `--locked` flags matching the decision from step 3. The tool returns outliers and a per-image fix suggestion.
8. For each outlier, patch with `gpt_image_edit` or re-run the single image with a tightened base prompt. Do **not** regenerate the whole series.
9. Optionally run `gpt_image_review` on each image individually for per-image quality; consistency does not replace per-image quality.

## Modes & Cards Touched

| Step | Mode | Card |
|---|---|---|
| 1 | Problem Definer (extended) | — |
| 3 | Visual Translator | emotion-visual-map, brand-archetypes, composition-systems |
| 5 | Prompt Director | 8-layer-template |
| 7 | Critic (consistency) | aesthetic-7dim (per-image), plus `gpt_image_consistency` |

## Quality Gates

- **Gate A** — locked vs. permitted variables confirmed.
- **Gate B** — system description confirmed, per-role variance plan confirmed.
- **Gate C** — consistency report passes; outliers fixed individually.

## Base-Prompt Derivation Pattern

```
BASE:
  [palette, lighting, composition, texture, style, aspect, negative] — locked.

PER-IMAGE (hero):
  Layer 1: <hero subject>
  Layer 2: <hero scene>
  ... rest inherit BASE.

PER-IMAGE (lifestyle):
  Layer 1: <lifestyle subject>
  Layer 2: <lifestyle scene>
  ... rest inherit BASE.
```

## Example

User: "Three-image campaign for one tea brand: hero KV, lifestyle-in-use, quote card. All three must feel like one system."

- Problem Definer: series_count = 3; series_roles = hero, lifestyle, quote; locked_variables = palette, lighting, texture, typography; permitted_variance = subject, framing, scene.
- Visual Translator system:
  - palette: warm cream / celadon / deep earth; one amber accent.
  - lighting: side window light, 4000K, soft diffused, from camera-left.
  - texture: matte paper feel, linen, no gloss.
  - typography: one serif for headline, one humanist sans for caption.
  - aspect: 3:4 for all (Xiaohongshu feed).
- Prompt Director: write BASE; derive hero (cup with steam), lifestyle (hands pouring), quote (folded linen with headline in serif).
- Generate each, 2 candidates per role, pick one per role.
- `gpt_image_consistency --image hero.png --image lifestyle.png --image quote.png --locked palette,lighting,texture,typography`.
- Fix any outlier individually.

## Anti-patterns

- Generating all 3 images in one prompt — the model will not hit the same palette/light across them reliably.
- Letting aspect ratio drift across the series — a 1:1 next to a 3:4 never feels like a system.
- Running `gpt_image_consistency` without having declared `locked_variables` first — you get vague differences instead of useful outliers.
- Re-rolling the entire series when only one image drifts — wastes time, and the fixed set may itself drift.
