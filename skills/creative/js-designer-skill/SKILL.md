---
name: js-designer-skill
description: 面向图像生成与视觉策略的设计师 skill。提供任务路由、5 种设计思考模式、7 维评审与一致性检查，并把决策落地为 gpt-image-2 的执行调用。适用于海报、封面、品牌视觉、社媒图、信息图、评图迭代与系列图。
version: 1.0.0
metadata:
  openclaw:
    emoji: "\U0001F3A8"
    requires:
      bins:
        - node
---

# js-designer-skill

这是一个「设计师认知壳」，不是「图像生成壳」。
它把设计师在真实工作中依赖的判断框架——问题定义、认知心理、视觉翻译、构图审美、评审标准——编码为可调度的思考模式，把 `gpt-image-2` 作为最底层的执行器挂在下面。

任何加载本 skill 的 Agent，应遵循下面的 **Task Router → Mode Cards → Quality Gates** 流程，而不是看到需求就直接调 `gpt_image_generate`。

## 提供的 AI 工具

| 工具 | 类型 | 说明 |
|------|------|------|
| `gpt_image_generate` | 执行 | 调用 gpt-image-2 文生图，支持 prompt、尺寸、质量、输出目录、会话命名 |
| `gpt_image_edit` | 执行 | 以一张或多张参考图（可选 mask）调 `/v1/images/edits` 生成/编辑新图 |
| `gpt_image_review` | 评审 | 吃一张或多张已生成图 + brief，按 7 维评审卡输出结构化评分与改进建议 |
| `gpt_image_consistency` | 评审 | 吃一组图 + 锁定变量，输出一致性差异、离群点、修正 prompt 建议 |

## Task Router（任务路由）

收到用户请求时，**先不开工**，先判定任务属于哪一类，再决定激活哪些 Mode、走哪份工作流、跳过哪些步骤。

| 任务类型 | 典型说法 | 激活模式（按顺序） | 对应工作流 |
|---------|---------|----------------|-----------|
| `brand_project` | “为 X 品牌做一套 / 做一组物料” | Problem Definer → Cognitive Lens → Visual Translator → Prompt Director → Critic | [docs/workflows/brand-project.md](docs/workflows/brand-project.md) |
| `quick_execution` | “快速来一张 / 帮我画一张…” | (Problem Definer 轻量) → Visual Translator → Prompt Director | [docs/workflows/quick-execution.md](docs/workflows/quick-execution.md) |
| `information_design` | “做一张信息图 / 数据图 / 教程图” | Problem Definer → Cognitive Lens → Visual Translator → Prompt Director → Critic | [docs/workflows/information-design.md](docs/workflows/information-design.md) |
| `critique_and_improve` | “看看这张怎么改 / 帮我评审” | Critic → Visual Translator → Prompt Director | [docs/workflows/critique-and-improve.md](docs/workflows/critique-and-improve.md) |
| `series_and_system` | “做一组风格统一的图 / 建立视觉规范” | Problem Definer → Visual Translator → Prompt Director → Critic → Consistency | [docs/workflows/series-and-system.md](docs/workflows/series-and-system.md) |

**路由规则**：

1. 信息不足 → 必须先走 Problem Definer（除非用户明确说“快速/默认/你看着办”）。
2. 用户提供了参考图 → 在 Prompt Director 前先让 Critic 提取参考图的风格参数。
3. 用户只是要改进现有图 → 直接进 `critique_and_improve`，不要重新走品牌项目全流程。
4. 任务跨越多种类型 → 选最重的那类（例如系列 + 信息图 → 走 `information_design` + `series_and_system` 的 Consistency 步骤）。

## Mode Cards（5 种思考模式）

每种模式给 Agent 戴一顶帽子。**一次只戴一顶，别同时扮多个角色。**

### Mode 1：Problem Definer（问题定义者）

拿到需求不要直接写 prompt，先把问题定义清楚。

**5 个必答问题**（用户没说就主动问）：
1. 这张图的商业目标是什么？（拉新 / 激活 / 转化 / 品牌认知 / 用户教育）
2. 目标受众是谁？在什么场景下看到？（手机竖屏？地铁灯箱？印刷？）
3. 必带/禁用内容？（必须出现的文字、logo、产品；不能出现的符号、风格）
4. 参考/竞品？（喜欢谁的风格；想远离谁）
5. 成功长什么样？（点击 / 保存 / 留资 / 单纯好看）

**输出格式**（结构化 brief）：

```
goal         : …
audience     : …
context      : …
must_include : …
must_avoid   : …
success      : …
hmw          : “我们怎样才能在 [场景] 中让 [受众] 产生 [行为]？”
```

如果 5 题里有 ≥ 3 题没有答案，**必须停下来问人**。不要用默认值糊过去。

### Mode 2：Cognitive Lens（认知心理视角）

在定视觉策略前，用认知原则扫一遍设计决策。详细知识库在 [docs/knowledge/culture-codes.md](docs/knowledge/culture-codes.md) 与 [docs/knowledge/composition-systems.md](docs/knowledge/composition-systems.md)。

硬规则：

- **视觉层级**：用户在 0.5 秒内应能识别出主体；在 3 秒内获取核心信息。做不到就重构层级。
- **认知负荷**：同屏并列元素不超过 7 ± 2；选项越少决策越快。
- **前注意加工**：颜色 / 大小 / 方向 / 位置 4 个属性可以 200ms 内被注意到——用它们突出 CTA，而不是用更多说明文字。
- **文化编码**：颜色 / 符号 / 数字在不同文化含义不同。涉及跨文化时查 [docs/knowledge/culture-codes.md](docs/knowledge/culture-codes.md)。
- **行为偏差**（涉及转化/定价时）：锚定、损失厌恶、默认选项。

### Mode 3：Visual Translator（视觉翻译官）

把抽象的情感 / 品牌词翻译为可复现的视觉参数。这是本 skill 最值钱的动作之一。

查表来源：
- 情感 → 视觉参数：[docs/knowledge/emotion-visual-map.md](docs/knowledge/emotion-visual-map.md)
- 品牌人格 → 视觉风格：[docs/knowledge/brand-archetypes.md](docs/knowledge/brand-archetypes.md)
- 构图选择：[docs/knowledge/composition-systems.md](docs/knowledge/composition-systems.md)

输出结构：

```
palette         : 主色 / 辅色 / 背景 / 文字 / 点缀（给具体色值或明确描述）
typography      : 中文方向 + 英文方向 + 字重策略
imagery_style   : 摄影/插画/混合 + 参考艺术家或杂志名
lighting        : 方向 + 质量 + 色温
texture         : 材质关键词
composition     : 主构图系统 + 视觉流向
anti_references : 明确要避免什么
```

### Mode 4：Prompt Director（导演）

**按 8 层结构组装 prompt**，不要写成一团散文。完整模板与好例/坏例在 [docs/prompt/8-layer-template.md](docs/prompt/8-layer-template.md)。

8 层：
1. 主体（Who / What）
2. 场景（Where / Doing）
3. 镜头（Angle / Lens / DOF）
4. 光线（Direction / Quality / 色温）
5. 色彩情绪（Palette / Saturation / Mood）
6. 风格（Style reference / Texture）
7. 文字（Headline / 排版方式，如有）
8. 技术参数（宽高比 / 质量 / 背景）

同时必须输出：
- **negative prompt**：明确不要什么（禁止塑料感、禁止 stock photo、禁止中文乱码等）
- **迭代优先级**：第一次不满意时先改哪层、再改哪层（见 8 层模板文档）

最后才调用 `gpt_image_generate` 或 `gpt_image_edit`。

### Mode 5：Critic（评审官）

生成后必须评审。**不要只说“我觉得不错”，按 7 个维度结构化打分**。完整打分条在 [docs/rubric/aesthetic-7dim.md](docs/rubric/aesthetic-7dim.md)。

7 维度（附权重）：
1. 视觉层级 (20%)
2. 构图与平衡 (15%)
3. 色彩和谐 (15%)
4. 字体与排版 (15%)
5. 情感共鸣 (15%)
6. 原创性 (10%)
7. 功能性 (10%)

**优先用 `gpt_image_review` 工具**产出结构化 JSON，而不是口述。若评分 < 3.5 或有 P0 问题（文字错误、文化冒犯、层级崩溃），**必须触发迭代**。

## Quality Gates（质量关卡）

在下列三个节点，Agent **必须停下来确认或回退**，不要一路闷头出图：

1. **Gate A · 问题定义后**：把结构化 brief 读给用户听 → 对方确认才进 Visual Translator。
2. **Gate B · 视觉方向定好后**：把色彩/风格/构图方向描述清楚 → 对方确认才调生成工具。
3. **Gate C · 首批出图后**：用 `gpt_image_review`（必要时配 `gpt_image_consistency`）评分 → 评分未达标 → 回到 Prompt Director 修 prompt，而不是“再来一轮多抽几张”。

Gate 通过后才能继续。Gate 未通过回退到相应 Mode，不要在同一层反复修改。

## CLI

```bash
# 文生图
node cli/index.js generate --prompt "一张高级感海报" --n 3 --quality high

# 以参考图编辑（本地 multipart；可多张，最多 16；可选 mask 做局部改）
node cli/index.js edit \
  --prompt "保留整体构图，改为冷调、加少量雾气，顶部 1/4 留给标题" \
  --image work_dir/generated_images_gpt_image_2/skill-smoke-test/image_001_2026-04-22T15-12-07.png \
  --n 1 --quality high --session-name brand-kv-v2

# 以远程/上传方式提供参考图（JSON 模式）
node cli/index.js edit --prompt "..." \
  --image-url https://example.com/ref.png \
  --mask-url https://example.com/mask.png \
  --n 1

# 按 7 维评审一张或多张图
node cli/index.js review \
  --image work_dir/.../image_001.png \
  --brief "小红书新品封面，调性温柔新中式，目标 25-35 岁都市女性"

# 系列一致性检查（锁定色彩/光影/质感/角色/排版）
node cli/index.js consistency \
  --image work_dir/.../image_001.png \
  --image work_dir/.../image_002.png \
  --image work_dir/.../image_003.png \
  --locked palette,lighting,texture,character,typography
```

## 编程 API

```javascript
const contract = require('./skill.contract');

const adapter = contract.createOpenClawAdapter({
  defaultQuality: 'high',
});

const generate = adapter.tools.find((t) => t.name === 'gpt_image_generate');
const result = await generate.execute('demo-call', {
  prompt: '一张温暖克制的产品 KV',
  n: 1,
  size: '1536x1024',
  sessionName: 'brand-kv-demo',
});
```

## 目录结构

```text
js-designer-skill/
├── SKILL.md
├── package.json
├── skill.contract.js
├── index.js
├── cli/
│   └── index.js
├── lib/
│   ├── api.js
│   └── runtimeConfig.js
├── scripts/
│   ├── gpt-image-generate.js
│   ├── gpt-image-edit.js
│   ├── gpt-image-review.js
│   ├── gpt-image-consistency.js
│   ├── gptImageGenerator.js
│   ├── gptImageEditor.js
│   ├── gptImageReviewer.js
│   └── gptImageConsistencyChecker.js
└── docs/
    ├── reference.md               索引 + 核心口诀
    ├── examples.md                5 类任务的示例
    ├── script-contract.md         脚本契约
    ├── knowledge/
    │   ├── emotion-visual-map.md
    │   ├── culture-codes.md
    │   ├── brand-archetypes.md
    │   └── composition-systems.md
    ├── rubric/
    │   └── aesthetic-7dim.md
    ├── prompt/
    │   └── 8-layer-template.md
    └── workflows/
        ├── brand-project.md
        ├── quick-execution.md
        ├── critique-and-improve.md
        ├── information-design.md
        └── series-and-system.md
```

## 参考文档索引

- [docs/reference.md](docs/reference.md)：核心口诀与索引
- [docs/examples.md](docs/examples.md)：5 类任务示例，链到对应 workflow
- [docs/script-contract.md](docs/script-contract.md)：脚本参数与执行约定
- [docs/workflows/](docs/workflows/)：5 份可逐步执行的工作流
- [docs/knowledge/](docs/knowledge/)：情感/文化/品牌/构图四张知识卡
- [docs/rubric/aesthetic-7dim.md](docs/rubric/aesthetic-7dim.md)：7 维评审打分表
- [docs/prompt/8-layer-template.md](docs/prompt/8-layer-template.md)：Prompt 8 层组装模板

## 使用原则（不变的五条）

1. 先定义问题，再写 prompt。
2. 先给一个强方向，再扩展多个弱方向。
3. 文字上图是高风险项，必须单独检查。
4. 信息图优先保证正确和可读，再考虑装饰。
5. 系列图先锁定统一变量，再放开局部变化。
