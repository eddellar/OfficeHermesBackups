# Aesthetic 7-Dimension Rubric

Structured critique rubric. Used by the `Critic` mode and by the `gpt_image_review` tool.

## Scoring Model

- Each dimension gets a **1–5 integer score**.
- **Overall** = Σ (score × weight), normalized to a 1–5 scale.
- A **P0 issue** overrides the overall score and blocks delivery regardless of how high the weighted number is.

| # | Dimension | Weight |
|---|---|---|
| 1 | Visual hierarchy | 20% |
| 2 | Composition & balance | 15% |
| 3 | Color harmony | 15% |
| 4 | Typography & text rendering | 15% |
| 5 | Emotional fit | 15% |
| 6 | Originality | 10% |
| 7 | Functionality (platform fit) | 10% |

### Acceptance Bands

- `>= 4.2` deliverable as-is; polish is optional.
- `3.6 – 4.1` deliverable with one iteration on the weakest dimension.
- `3.0 – 3.5` must iterate; do not deliver.
- `< 3.0` or any P0 issue — regenerate from a different direction.

## P0 Issues (auto-fail regardless of score)

- Text in the image is **misspelled, garbled, wrong language, or factually wrong**.
- **Cultural offense or brand taboo** (see [../knowledge/culture-codes.md](../knowledge/culture-codes.md)).
- **Anatomy catastrophic** (extra fingers, broken limbs) on a human hero shot.
- **Logo misuse** (distorted, wrong color, wrong version).
- **Legal risk**: visible trademark violation, minor in a mature context, medical claim.
- **Unsafe content** that the brand cannot publish.

## Dimension Rubric

### 1. Visual Hierarchy (20%)

Does the eye know where to look, in what order?

| Score | Description | Typical fix |
|---|---|---|
| 5 | 0.5s to find the subject; 3s to read the support; 10s to reward detail. Three clean layers. | none |
| 4 | Clear subject; support layer slightly soft. | strengthen secondary contrast |
| 3 | Eye bounces between 2 candidates for the subject. | reduce competing contrast on one |
| 2 | No dominant element. Flat attention. | remove elements or add a focal anchor |
| 1 | Chaos; viewer gives up. | regenerate with a Problem Definer pass |

### 2. Composition & Balance (15%)

Does the composition system make sense for the intent? Is visual weight balanced?

| Score | Description | Typical fix |
|---|---|---|
| 5 | A clear composition system is visible and serves the intent. Balance feels intentional. | none |
| 4 | System present but minor weight issue in one corner. | small crop or element shift |
| 3 | System unclear; composition feels default. | commit to a system per [../knowledge/composition-systems.md](../knowledge/composition-systems.md) |
| 2 | Dead-center without reason, or awkward crop. | re-brief the system layer in the prompt |
| 1 | No discernible structure. | regenerate |

### 3. Color Harmony (15%)

Is the palette coherent? Does contrast serve hierarchy? Does it match the intended mood?

| Score | Description | Typical fix |
|---|---|---|
| 5 | 3–5 color palette with clear role (primary / support / accent / bg / text). Mood reads in < 1s. | none |
| 4 | Palette coherent, one color slightly off in saturation or brightness. | desaturate / shift temp of the outlier |
| 3 | Palette feels like 6+ colors with unclear roles. | reduce to 3 dominant families |
| 2 | Palette fights the intended mood. | return to [../knowledge/emotion-visual-map.md](../knowledge/emotion-visual-map.md) |
| 1 | Muddy; no palette discernible. | regenerate with explicit palette in prompt |

### 4. Typography & Text Rendering (15%)

Is the text legible, well-hierarchized, and correctly rendered?

| Score | Description | Typical fix |
|---|---|---|
| 5 | All copy rendered correctly. Clear headline/body hierarchy. Type choice matches mood. | none |
| 4 | Minor kerning or letter-shape issue; meaning intact. | re-render text only, or patch via `gpt_image_edit` with mask |
| 3 | Minor text error (single letter wrong) or hierarchy weak. | regenerate text layer, lock other variables |
| 2 | Multiple letters wrong or wrong language style. | extract final image → add text in post, or regenerate with explicit text layer |
| 1 | Gibberish on image. **P0.** | reject; consider adding text in post instead of baking into image |

Note: text-in-image is fragile. When the brief allows, render the image without text and compose the headline afterward in Figma/PS.

### 5. Emotional Fit (15%)

Does the image land on the target emotion in the first glance?

| Score | Description | Typical fix |
|---|---|---|
| 5 | Viewer names the intended emotion within 1s of seeing. | none |
| 4 | Emotion lands within 3s; close to target but slightly off in intensity. | adjust lighting or saturation |
| 3 | Emotion is ambiguous between 2 candidates. | push one axis harder per emotion map |
| 2 | Reads as a different emotion than intended. | re-run Visual Translator |
| 1 | Cold, dead, generic stock feel. | regenerate with explicit mood + reference cue |

### 6. Originality (10%)

Does the image feel original, or like a default AI look / stock look?

| Score | Description | Typical fix |
|---|---|---|
| 5 | Distinct point of view. Not reminiscent of a generic AI or stock style. | none |
| 4 | Mostly original; one familiar trope lingering. | swap that trope element |
| 3 | Feels like a "safe AI" output. | add specific artistic reference, unexpected camera, or unusual material |
| 2 | Feels like default stock. | regenerate |
| 1 | Embarrassingly derivative. | regenerate from a different direction |

### 7. Functionality — Platform Fit (10%)

Does the image work on its intended platform / device / medium?

| Score | Description | Typical fix |
|---|---|---|
| 5 | Aspect ratio, safe area, legibility at actual size, all correct. | none |
| 4 | Minor safe-area encroachment (caption area, UI overlays). | crop / shift subject |
| 3 | Subject falls outside actual viewing area on target device. | redesign crop |
| 2 | Wrong aspect ratio for platform. | regenerate with correct ratio |
| 1 | Image unusable on platform (print at 72dpi, tiny on mobile, etc.). | regenerate with platform brief |

## Output Schema (for `gpt_image_review`)

```json
{
  "overall_score": 4.1,
  "band": "deliverable_with_one_iteration",
  "dimension_scores": {
    "visual_hierarchy": { "score": 4, "note": "..." },
    "composition_balance": { "score": 4, "note": "..." },
    "color_harmony": { "score": 5, "note": "..." },
    "typography_text": { "score": 3, "note": "..." },
    "emotional_fit": { "score": 4, "note": "..." },
    "originality": { "score": 4, "note": "..." },
    "functionality": { "score": 4, "note": "..." }
  },
  "p0_issues": [],
  "top_strengths": [
    "Palette is on target for the calm premium brief.",
    "Negative space amplifies the subject."
  ],
  "critical_issues": [
    "Headline kerning on the word ... is off; reads unprofessional."
  ],
  "improvement_suggestions": [
    {
      "issue": "Headline text has a kerning defect on letter O and R.",
      "prompt_patch": "Add: --image <this> with mask over the headline; rewrite only the typography layer; specify 'clean tight kerning, no letter distortion'."
    }
  ]
}
```

## Calibration Hints (for the reviewer model)

- Be specific and actionable. A score with no diagnostic note is useless.
- Prefer concrete prompt patches over vague "make it better".
- Never say "good overall" without naming the single biggest weakness.
- If two dimensions tie for worst, suggest fixing hierarchy first (it is the base of everything else).
