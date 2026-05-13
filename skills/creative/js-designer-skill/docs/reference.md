# Design Reference (Index + Core Aphorisms)

This file is the entry index of the knowledge base.
Long tables used to live here. They now live as standalone cards under `docs/knowledge/`, `docs/rubric/`, `docs/prompt/`, `docs/workflows/`.
Agents should load a specific card on demand rather than reading everything here.

## When To Load What

| You are doing | Load this |
|---|---|
| translating a mood into concrete visual parameters | [knowledge/emotion-visual-map.md](knowledge/emotion-visual-map.md) |
| checking colors/symbols against a target culture | [knowledge/culture-codes.md](knowledge/culture-codes.md) |
| converting a brand personality into a visual direction | [knowledge/brand-archetypes.md](knowledge/brand-archetypes.md) |
| picking a composition system or a reading path | [knowledge/composition-systems.md](knowledge/composition-systems.md) |
| scoring a generated image or giving structured critique | [rubric/aesthetic-7dim.md](rubric/aesthetic-7dim.md) |
| assembling a final prompt | [prompt/8-layer-template.md](prompt/8-layer-template.md) |
| running a real task end to end | [workflows/](workflows/) |
| picking a ready-made example | [examples.md](examples.md) |
| bind scripts to CLI / tools | [script-contract.md](script-contract.md) |

## Core Aphorisms (the five that never change)

1. Define the problem before writing the prompt.
2. Commit to one strong direction first, then branch into weak alternatives.
3. Text baked into an image is a high-risk item. Review it separately.
4. For information design, correctness and legibility come before decoration.
5. For a series, lock the constant variables first, then allow local variance.

## The Five Questions (Problem Definer)

Before any prompt, answer these:

- `goal`: what should this image cause the viewer to do or feel?
- `audience`: who is it for? what is their viewing context?
- `must_include`: any required text, logo, product, or element?
- `must_avoid`: any forbidden symbol, style, or tone?
- `success`: what outcome proves this image worked?

Reframe as How-Might-We:

> How might this image help [audience] in [context] perform [action] / feel [emotion]?

## The Seven Dimensions (Critic)

Score 1 to 5 on each; check full scoring bands in [rubric/aesthetic-7dim.md](rubric/aesthetic-7dim.md).

| Dimension | Weight |
|---|---|
| Visual hierarchy | 20% |
| Composition & balance | 15% |
| Color harmony | 15% |
| Typography & text rendering | 15% |
| Emotional fit | 15% |
| Originality | 10% |
| Functionality (platform fit) | 10% |

Any P0 issue (wrong text, cultural offense, collapsed hierarchy) blocks delivery regardless of the weighted score.

## The Eight Layers (Prompt Director)

A final prompt should include eight layers. See [prompt/8-layer-template.md](prompt/8-layer-template.md) for good/bad examples and iteration priority.

1. Subject
2. Scene & context
3. Camera (angle / lens / DOF)
4. Lighting (direction / quality / temperature)
5. Color mood
6. Style reference & texture
7. Text content (if any) and layout
8. Technical spec (aspect ratio / quality / background)

## The Three Quality Gates

Stop the workflow at:

- **Gate A** after problem definition — confirm the brief with the user.
- **Gate B** after visual direction — confirm palette/style/composition with the user.
- **Gate C** after first batch — run `gpt_image_review`; iterate on the prompt layer rather than regenerating blindly.

## Series Consistency (lock these first)

- palette family
- lighting family
- framing logic
- surface texture level
- typography direction
- brand cues

Use `gpt_image_consistency` to verify. If a single image drifts, fix it in place; do not re-roll the whole series.
