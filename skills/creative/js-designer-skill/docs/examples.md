# Examples

Five canonical task types, each linked to its end-to-end workflow.

## Example 1: Xiaohongshu Product Cover  →  Brand Project

**Task type**: `brand_project`
**Workflow**: [workflows/brand-project.md](workflows/brand-project.md)

### Input

Create a Xiaohongshu cover for a new tea drink launch. The tone should feel natural, calm, and premium. Keep space for a short Chinese title.

### Key Questions

- Is the goal awareness, click-through, or conversion?
- What exact text must appear?
- Should the image feel more lifestyle or more product-focused?

### Strategy Summary

- audience: mobile social users scanning fast.
- mood: `calm + warmth` ([knowledge/emotion-visual-map.md](knowledge/emotion-visual-map.md)).
- archetype: `Caregiver + light Creator` ([knowledge/brand-archetypes.md](knowledge/brand-archetypes.md)).
- composition: negative space + Z-pattern; title top.
- hierarchy: product first, title second.

### Suggested Parameters

- `--n 3 --quality high --size 1024x1536 --session-name brand-tea-xhs-v1`

## Example 2: Brand Key Visual Exploration  →  Brand Project

**Task type**: `brand_project`
**Workflow**: [workflows/brand-project.md](workflows/brand-project.md)

### Input

Explore 3 directions for a fall campaign key visual for a skincare brand. The brand is clinical but warm, not luxury-black and not overly cute.

### Review Focus

- Does each direction preserve the same brand logic?
- Is each option meaningfully different?
- Which direction best balances warmth and efficacy?

Use [rubric/aesthetic-7dim.md](rubric/aesthetic-7dim.md) to score each direction; use `gpt_image_review` to produce a comparable 7-dimension JSON per direction.

## Example 3: Infographic Request  →  Information Design

**Task type**: `information_design`
**Workflow**: [workflows/information-design.md](workflows/information-design.md)

### Input

Create an infographic about the 2026 AI image workflow for marketers. It should feel clean and informative, not decorative.

### Review Focus

- Is the reading order obvious?
- Are there too many competing elements?
- Is any text likely to render incorrectly and require manual correction?

Text correctness and chart readability are P0 for this workflow (see [rubric/aesthetic-7dim.md](rubric/aesthetic-7dim.md)).

## Example 4: Critique And Iterate  →  Critique And Improve

**Task type**: `critique_and_improve`
**Workflow**: [workflows/critique-and-improve.md](workflows/critique-and-improve.md)

### Input

The user says: "This image feels expensive, but the headline area is messy and the whole thing still looks too AI. Help me fix it."

### Strategy Summary

- keep: premium mood.
- fix: text space, realism, material logic.
- avoid: changing the whole direction unless diagnosis proves it is wrong.

Start with `gpt_image_review` on the provided image; then patch via `gpt_image_edit` for text area, or re-run with a single layer change in the 8-layer template.

## Example 5: Series Consistency  →  Series And System

**Task type**: `series_and_system`
**Workflow**: [workflows/series-and-system.md](workflows/series-and-system.md)

### Input

Generate a three-image series for one campaign: hero product shot, lifestyle use case, and quote card. All three must feel like one system.

### Locked Variables

- palette family
- light direction
- framing rhythm
- texture level
- copy placement logic

Run `gpt_image_consistency --locked palette,lighting,texture,typography` on the final set to confirm.
