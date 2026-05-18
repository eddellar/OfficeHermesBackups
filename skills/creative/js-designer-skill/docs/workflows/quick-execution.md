# Workflow: Quick Execution

Fast path for when the user already has a clear direction and just wants output.

## When To Use

- User says "quick, 来一张 / 随便画一张 / 就按默认 / 你看着办".
- User has provided enough specificity that the 5 questions can be answered by inference.
- No brand-level strategic decisions needed.
- Time budget is short; quality bar is "usable", not "portfolio-grade".

Do NOT use for: first pass of a new brand project; info-graphic with data; multi-image series; text-heavy poster.

## Steps

1. **Problem Definer (light)** — silently check if the 5 questions have answers (goal / audience / context / must_include / must_avoid). If **3 or more are blank and the user has not said "你看着办"**, stop and ask. Otherwise continue.
2. **Visual Translator (lite)** — pick one emotion, one composition system, one palette. Do not over-explore.
   - Default for unclear mood: `calm + warmth`.
   - Default composition: `rule of thirds`.
   - Default aspect ratio: match the platform if known; otherwise `1:1`.
3. **Prompt Director** — one prompt using the 8-layer template. Use fewer details but keep all 8 layers nominally filled.
4. Call `gpt_image_generate --n 1 --quality medium` or `high` depending on intent.
5. Show the output. If the user is satisfied, stop. If not, drop into [critique-and-improve.md](critique-and-improve.md).

## Modes & Cards Touched

| Step | Mode | Card |
|---|---|---|
| 1 | Problem Definer (light) | — |
| 2 | Visual Translator (lite) | emotion-visual-map (quick row) |
| 3 | Prompt Director | 8-layer-template |

## Quality Gates

- Only **Gate A is enforced** when blind-spot count ≥ 3. Gate B and Gate C are skipped by default.
- If the user asks for a second pass, **Gate C activates** — run `gpt_image_review` before iterating again.

## Example

User: "帮我生成一张办公桌面上咖啡杯的小红书图，干净一点就行。"

- Problem Definer (light): goal inferred = aesthetic content; audience inferred = Xiaohongshu urban; platform = Xiaohongshu 3:4; must_include = nothing specific; must_avoid = nothing specific. 0 blind spots → continue.
- Visual Translator (lite): mood = calm; composition = rule of thirds with negative space; palette = warm cream + matte ceramic.
- Prompt Director: simple prompt with all 8 layers filled.
- `gpt_image_generate --n 1 --quality medium --session-name quick-coffee-desk`.

## Anti-patterns

- Using quick-execution for a brand project "because the user was in a hurry" — the result misses brand logic and they will come back for a full redo.
- Skipping even the light Problem Definer check — fastest way to produce something useless.
- Using `--n 4` for exploration here — if the direction is already clear, one image is enough.
