# 8-Layer Prompt Template

The rule: never write a prompt as a single paragraph of adjectives. Compose it in 8 discrete layers. This lets you iterate on one layer without breaking others.

## The 8 Layers

| # | Layer | Answers |
|---|---|---|
| 1 | Subject | Who / what is in focus. One subject, not a list. |
| 2 | Scene & context | Where it is. What it is doing. What surrounds it. |
| 3 | Camera | Angle, focal length, depth of field. |
| 4 | Lighting | Direction, quality, temperature, key-fill ratio. |
| 5 | Color mood | Palette, saturation, dominant temperature. |
| 6 | Style & texture | Medium, art-style reference, surface material. |
| 7 | Text (optional) | Text content, language, placement, typography family. |
| 8 | Technical spec | Aspect ratio, quality, background, platform constraints. |

## Composition Order

Start every prompt with layers 1–2, which define **what**. Layers 3–6 define **how it looks**. Layer 7 is optional but high-risk (see below). Layer 8 closes the prompt with hard technical constraints.

Template skeleton:

```
[Subject], [doing / being] in [Scene].
Shot on [camera], [angle], [lens/DOF].
Lit by [lighting direction + quality + temperature].
[Color mood].
Style: [style reference + surface texture].
[Optional: text block with exact copy and typography guidance].
[Aspect ratio + quality + background + any platform constraint].
Negative prompt: [explicit anti-list].
```

## Good Example

Brand brief: small-batch tea studio, Xiaohongshu new-product KV, target 25–35F urban women, emotion = calm + warmth, archetype = Caregiver + light Creator.

```
A pair of hands in soft focus cradling a warm celadon teacup with gentle steam rising,
on a quiet Sunday-morning kitchen counter with a single dried tea leaf and a folded linen cloth beside it.
Shot on 85mm, eye-level, shallow depth of field, f1.8.
Side window light from camera-left, soft diffused, warm 4000K, subtle shadow falloff.
Palette: warm cream background, celadon green cup, soft amber steam highlight; low saturation, warm temperature.
Style: editorial still life inspired by Kinfolk magazine photography, matte paper-feel surface, no glossy plastic.
No text in the image.
Aspect ratio 3:4 for Xiaohongshu, high quality, off-white seamless background, safe area 80px from edges.
Negative prompt: no stock-photo-feel, no oversaturated colors, no neon, no glossy plastic material,
no text on the image, no hands showing more than five fingers, no face visible.
```

## Bad Example (to avoid)

```
A beautiful, stunning, high-quality photo of a tea cup, warm, cozy, inviting, premium, modern,
tasteful, 8k, hyperdetailed, award-winning, trending on artstation, masterpiece.
```

What is wrong:

- No subject definition (just "a tea cup").
- No camera / lighting / composition / palette direction.
- Quality tokens ("8k, masterpiece") are lazy; the model produces average-looking default output.
- No negative prompt — it will add unwanted decorations.
- No platform constraint.

## Per-Layer Guidance

### Layer 1 — Subject

- Name one subject with adjectives that matter (material, expression, state).
- Do not stack 3 subjects unless you truly want clutter.
- Include interaction verbs ("cradling", "pouring", "reaching") — they bias composition.

### Layer 2 — Scene & Context

- Environment should support, not compete with, the subject.
- If the subject is small against a landscape, say so ("small figure in a vast landscape").
- Bad: "beautiful scene". Good: "a quiet Sunday-morning kitchen counter".

### Layer 3 — Camera

- Focal length implies compression and DOF. 24mm = wide, distorted, immersive. 50mm = neutral. 85–135mm = portrait compression, shallow DOF.
- Angle: eye-level (default), low-angle (authority/hero), high-angle (intimacy/vulnerability).
- DOF: shallow (f1.4–f2.8) isolates subject; deep (f8+) shows context.

### Layer 4 — Lighting

- Direction first: front-flat, side, back-rim, top, below.
- Quality: hard (direct sun, strobe) vs soft (diffused window, overcast).
- Temperature: warm (3000–4000K) vs neutral (5000K) vs cool (6500K+).
- Avoid: "good lighting", "cinematic lighting" without further spec.

### Layer 5 — Color Mood

- Choose a dominant temperature + 3–5 colors max.
- Describe saturation (high / moderate / low).
- Tie it to the emotion target — see [../knowledge/emotion-visual-map.md](../knowledge/emotion-visual-map.md).

### Layer 6 — Style & Texture

- Prefer **specific references** over generic "realistic" or "cinematic".
  - Editorial: Kinfolk, Apartamento, Cereal, Monocle, Vogue.
  - Cinematic: Deakins, Wong Kar-wai, A24 color grade, early Denis Villeneuve.
  - Illustration: Tomer Hanuka, Malika Favre, Olimpia Zagnoli.
- Texture directly: "matte paper feel", "soft film grain", "brushed aluminum".

### Layer 7 — Text (optional, high-risk)

- Only include text if the brief requires text **on the image**.
- Give exact copy in quotes. Specify language.
- Specify typography family (serif / sans / mono) and weight.
- Place explicitly ("top 1/4", "lower-right below subject").
- **Always review the text rendering separately**. Text errors are P0 in the rubric.
- If the platform allows, strongly prefer to generate a text-free image and compose text in a real design tool.

### Layer 8 — Technical Spec

- Aspect ratio: match the platform exactly.
- Background: "opaque white seamless" vs "transparent PNG cutout" vs "matches scene".
- Quality: `high` for hero, `medium` for iteration, `low` for quick exploration.
- Safe area: reserve edges for UI overlays if the platform draws a gradient or caption over the image.

## Negative Prompt Library (copy-paste starters)

General hygiene:

```
no stock-photo feel, no oversaturated colors, no generic AI aesthetic,
no muddy color mud, no illegible text, no extra fingers or limbs,
no watermarks, no low-res artifacts, no JPEG blockiness
```

Luxury / editorial:

```
no glossy plastic material, no neon, no clutter, no cheap props,
no busy background, no gradient skies, no lens flare, no HDR look
```

Calm / premium minimalism:

```
no high-contrast text, no busy pattern, no crowded composition,
no saturated red, no dense visual noise
```

Xiaohongshu / lifestyle:

```
no studio-isolated product, no white seamless background, no sterile look,
no obvious AI face, no over-filtered skin, no chinese text rendering
```

Information design:

```
no decorative noise, no unnecessary gradient, no drop shadow,
no non-data-carrying illustration
```

Human portrait:

```
no extra fingers, no distorted face, no unnatural skin texture,
no plastic skin look, no AI-polish, no stock model expression,
no more than 5 fingers per hand
```

## Iteration Priority (when the first output is not right)

Change one layer at a time. Order of priority:

1. **Layer 3 Camera** — wrong angle or lens almost always breaks hierarchy first.
2. **Layer 4 Lighting** — wrong lighting direction is the second biggest mood-killer.
3. **Layer 5 Color mood** — easy to patch, big perception change.
4. **Layer 2 Scene** — swap the context if the mood is still wrong after 3 and 4.
5. **Layer 6 Style reference** — change reference only if the overall aesthetic is off-brand.
6. **Layer 1 Subject** — last resort. If the subject itself is wrong, you probably misread the brief.
7. **Layer 7 Text** — patch with `gpt_image_edit` + mask instead of regenerating full image.
8. **Layer 8 Technical** — re-render with the correct aspect ratio.

Rule: one layer per iteration. Changing 3 things at once means you do not know which fix worked.

## Reuse Template (fill in)

```
LAYER 1 SUBJECT:
LAYER 2 SCENE:
LAYER 3 CAMERA:
LAYER 4 LIGHTING:
LAYER 5 COLOR MOOD:
LAYER 6 STYLE/TEXTURE:
LAYER 7 TEXT (optional):
LAYER 8 TECHNICAL:
NEGATIVE PROMPT:
```

Paste this in the working doc, fill each layer, then render into a final prompt paragraph for the API.
