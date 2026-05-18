# Prompt Examples (Verified 2026-05-08)

## Fruit Photography (Reference Image → T2I)

**Workflow:** vision analysis → extract key elements → z_image_turbo T2I

**Reference image analysis (桑葚/ mulberries):** upward angle, blue sky background, fruit at varying ripeness stages, dewdrops, backlit translucent leaves, warm sunlight from upper-left, shallow DOF

**Generated apple cluster prompt (seed 2316275895):**
```
A cluster of ripe apples hanging from a tree branch, varying stages of 
ripeness from green to yellow to bright red and deep crimson. Water 
droplets glistening on the ripe apples in sunlight. Fresh green apple 
leaves with serrated edges, some backlit by sun creating translucent 
effect. Blue sky with white clouds in background. Strong sunlight from 
upper left creating warm golden hour atmosphere. Upward camera angle 
looking up at the tree. Vibrant color contrast, natural fresh summery 
feel, photorealistic fruit photography style, shallow depth of field, 
professional food photography, organic farming aesthetic, crisp details, 
dewdrops on fruit skin
```

**Sweet red apple variation (seed 1411531527):** Added "gorgeous deep bright red", "glossy skin", "incredibly sweet and appetizing", "warm summery atmosphere" for richer red coloration.

**Key style elements preserved:**
- upward camera angle
- blue sky + white clouds background
- dewdrops on fruit
- backlit translucent leaves
- warm golden hour light
- shallow depth of field
- photorealistic food photography

---

## Plush Toys (Verified 2026-05-09)

**Workflow:** `z_image_turbo` — all prompts confirmed working, seeds verified.

**Style formula:**
```
cute fluffy [subject] plush toy, soft [color] [material description],
[body shape], [pose], [expression/face details], [background/setting],
[lighting], high quality, detailed [texture] texture
```

**Verified prompts with seeds:**

| Subject | Seed | Prompt excerpt |
|---------|------|----------------|
| Teddy bear (white) | 2526749730 | `white teddy bear style, round and chubby, sitting pose, adorable kawaii expression, soft studio lighting, white background` |
| Bunny | 2340320804 | `soft pink color, long ears, chubby body, holding a carrot, sweet smile, pastel background` |
| Cat | 964788548 | `soft orange tabby color, round face, half-closed sleepy eyes, curled up sleeping pose, warm cozy feeling` |
| Penguin | 2667844841 | `navy and white color, round belly, small wings, wearing a red scarf, standing pose, light blue background` |
| Strawberry | 2412443228 | `soft red with green leaf hat, kawaii face with rosy cheeks, white seeds detail, sitting pose, pastel pink background` |
| Fox | 1349608272 | `orange and white colors, big pointed ears, fluffy tail, mischievous smile, autumn leaves background, warm golden lighting` |
| Polar bear | 1143213812 | `cream white color, tiny ears, black nose and eyes, icy background with sparkly snowflakes` |
| Panda | 1018675046 | `black and white, big round black eye patches, chubby cheeks, hugging bamboo, soft green bamboo background` |
| Owl | 873782007 | `purple and lavender, big round golden eyes, small tufted ears, dreamy starry night background, soft moonlight` |
| Axolotl | 817318362 | `pink and peach, feathery pink gills on head, rosy cheeks, swimming pose, aqua water background, bubbles` |
| Duckling | 4161279758 | `baby yellow, orange beak and feet, big cute black eyes, waddle pose, meadow green background with dandelions, warm sunny lighting` |

**Universal quality modifiers (append to any plush prompt):**
```
high quality, detailed [fur/feather/downy/plush] texture,
cute and adorable, professional plush toy photography
```

**Background style options:**
- `white background` — clean product shot
- `pastel [color] background` — soft harmony
- `[color] background with [element]` — contextual scene
- `dreamy [theme] background` — fantasy mood
- `soft [color] [setting] background` — environmental

**Common pitfall:** Avoid adding "fluffy" twice (e.g. "cute fluffy fluffy") — Z-Image-Turbo may interpret double modifier as degraded output. Use "soft" or "fluffy" once per prompt.

---

## Anthropomorphic Object Plush Toys (Verified 2026-05-11)

**Workflow:** `z_image_turbo` — objects given kawaii faces, tiny arms, tiny legs, turning everyday items into plush characters.

**Style formula:**
```
cute anthropomorphic [object] plush toy, [object description with key identifying features],
[face: eyes, expression, cheeks], tiny arms and legs, [color scheme],
[material/texture], [background], high quality plush toy photography, white background
```

**Verified prompts with seeds (10 objects, 2 batches):**

| # | Object | Seed | Key visual features |
|---|--------|------|---------------------|
| 01 | Teacup (青花瓷) | 1746043811 | blue and white porcelain, panda ears, blushing smile |
| 02 | Book (复古书本) | 3123409447 | vintage leather cover, glasses, smiling face on cover |
| 03 | Umbrella (雨伞) | 1280533268 | polka dot canopy, cozy rainy-day expression |
| 04 | Desk lamp (台灯) | 476305996 | brass base, warm glow, gentle face near shade |
| 05 | Pencil (铅笔) | 184376357 | yellow body, pink eraser, sitting on desk |
| 06 | Alarm clock (闹钟) | 1752480470 | round clock face, antenna ears, mint green + white |
| 07 | Camera (相机) | 2860225798 | vintage film camera, big eyes on lens, cream + brown |
| 08 | Radio (收音机) | 114423928 | wooden cabinet, speaker grille face, walnut brown |
| 09 | Rain boot (雨靴) | 2994730869 | bright yellow rubber, cheerful sitting pose, water splashes |
| 10 | Candlestick (烛台) | 358486245 | golden holder, flame as hair, warm cozy glow |

**Prompt construction notes:**
- Lead with the object's identifying shape/color so it's recognizable
- Add "anthropomorphic" and "tiny arms and legs" explicitly
- Face details: `big cute eyes`, `small smile`, `rosy cheeks`, `kawaii expression`
- For inedible objects (camera, radio): describe body-part-to-feature mapping explicitly (`big cute eyes on the lens`, `eyes on the speaker grille`)
- Color palette words in the prompt reinforce the object's identity (walnut brown = wood, brass = gold)
- Append `, soft plush toy material, high quality plush toy photography, white background` as universal quality tail

**Feishu delivery:** Copy to `/mnt/e/ComfyUI_Mie_2026_V8.0/ComfyUI/output/anthropized/` with sequential numbering (01–10) before sending.
