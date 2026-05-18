# Workflow: Brand Project (full pass)

End-to-end workflow for delivering a brand-level visual asset or small set of assets, where the brand direction is not yet locked.

## When To Use

- User says "make a KV / hero / poster / brand set for [brand]".
- User talks about brand personality, positioning, audience.
- User has NOT locked color / style / reference yet.
- Scope is one hero image or a small series (≤ 5) within one campaign.

Do NOT use for: one-off quick poster (use `quick-execution`), info-graphic (use `information-design`), edit-only request (use `critique-and-improve`).

## Steps

1. **Problem Definer** — ask the 5 questions, produce structured brief.
2. **Gate A** — read the brief back to the user, get confirmation.
3. **Cognitive Lens** — scan the brief for: cultural constraints ([../knowledge/culture-codes.md](../knowledge/culture-codes.md)), cognitive load, audience viewing context.
4. **Visual Translator** — convert brief to visual parameters using:
   - [../knowledge/emotion-visual-map.md](../knowledge/emotion-visual-map.md) for mood → palette/light/composition.
   - [../knowledge/brand-archetypes.md](../knowledge/brand-archetypes.md) for personality → style direction.
   - [../knowledge/composition-systems.md](../knowledge/composition-systems.md) for a suitable system.
5. **Gate B** — describe color / light / composition direction to the user. Get confirmation. Do not skip.
6. **Prompt Director** — assemble prompt using [../prompt/8-layer-template.md](../prompt/8-layer-template.md). Write the negative prompt explicitly.
7. Call `gpt_image_generate` with `--n 3 --quality high`. Use a descriptive `--session-name` like `brand-kv-v1`.
8. **Gate C** — `gpt_image_review` on each candidate. Filter by overall band and P0 issues.
9. **Critic → Prompt Director** — on the top candidate, patch only the weakest layer (see iteration priority in the 8-layer template). Re-run `gpt_image_generate` with `--n 1 --quality high` and a new session name suffix.
10. Loop step 8–9 at most 3 times; otherwise escalate back to Visual Translator with a direction change.

## Modes & Cards Touched

| Step | Mode | Card |
|---|---|---|
| 1 | Problem Definer | — |
| 3 | Cognitive Lens | culture-codes |
| 4 | Visual Translator | emotion-visual-map, brand-archetypes, composition-systems |
| 6 | Prompt Director | 8-layer-template |
| 8–9 | Critic | aesthetic-7dim |

## Quality Gates

- **Gate A** after step 2 — brief locked.
- **Gate B** after step 5 — visual direction locked.
- **Gate C** after step 8 — first-batch review; iterate or escalate.

## Example

Brief: "A premium coffee subscription brand, launching a Sunday-morning ritual campaign. Audience 28–40, urban, values slow living. Want a hero KV for the landing page."

- Problem Definer: confirms goal = drive signup; audience = calm Sunday users; must_include = brand wordmark area top-left; must_avoid = neon, urgency, busy kitchen; success = feel immediately calm.
- Visual Translator: mood = calm + warmth. Archetype = Caregiver + light Creator. Composition = negative space + Z-reading path with wordmark top-left, subject mid-right, CTA bottom-right. Palette = warm cream / soft amber / deep earth. Lighting = side window light, warm 4000K, soft diffused.
- Prompt Director: uses 8-layer template, explicit negative prompt (no neon, no stock, no plastic, no crowded).
- Generate `--n 3 --quality high`.
- Review with 7-dim rubric; pick best; patch Layer 4 if lighting is too flat; regenerate `--n 1`.

## Session Naming Convention

`brand-[brand-slug]-[asset-slug]-v[n]`

Example: `brand-morning-coffee-kv-v1`, `brand-morning-coffee-kv-v2`.

## Anti-patterns

- Skipping Gate A because "the brief seems obvious" — you will iterate 5+ times and blame the model.
- Asking for `--n 8` on the first pass — a wider net masks a weak prompt. Start with `--n 3`.
- Iterating by regenerating the whole prompt — break when one layer is wrong; patch that layer only.
