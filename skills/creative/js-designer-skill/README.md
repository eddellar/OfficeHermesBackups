# js-designer-skill

一个面向图像生成的「设计师认知壳」Skill 包。定位不是“gpt-image-2 的执行层”，而是把设计师真实依赖的判断框架——问题定义、认知心理、视觉翻译、构图审美、评审标准——编码成可调度的模式，把 `gpt-image-2` 作为最底层执行器挂在下面。

Agent 使用本 Skill 时，应按 `SKILL.md` 的 **Task Router → 5 种 Mode Cards → 3 道 Quality Gates** 流程工作，而不是见到请求直接生图。

当前仓库根目录即是 Skill 包本体。

## 目录结构

```text
js-designer-skill/
├── SKILL.md                认知入口：Task Router / Mode Cards / Quality Gates
├── README.md               本文件
├── package.json
├── skill.contract.js       工具定义、CLI 元信息、运行时入口
├── index.js                主命令分发入口
├── cli/
│   └── index.js            CLI 包装层
├── lib/
│   ├── api.js              业务 API：generateImage / editImage / reviewImages / checkConsistency
│   └── runtimeConfig.js    环境变量与默认值
├── scripts/
│   ├── gpt-image-generate.js            CLI 入口：文生图
│   ├── gpt-image-edit.js                CLI 入口：参考图编辑
│   ├── gpt-image-review.js              CLI 入口：7 维评审
│   ├── gpt-image-consistency.js         CLI 入口：系列一致性
│   ├── gptImageGenerator.js             底层：/v1/images/generations
│   ├── gptImageEditor.js                底层：/v1/images/edits
│   ├── gptImageReviewer.js              底层：多模态 /v1/chat/completions
│   └── gptImageConsistencyChecker.js    底层：多模态 /v1/chat/completions
└── docs/
    ├── reference.md        索引 + 核心口诀
    ├── examples.md         5 类任务示例 → 对应 workflow
    ├── script-contract.md  脚本参数与执行约定
    ├── knowledge/
    │   ├── emotion-visual-map.md        情感 → 视觉参数
    │   ├── culture-codes.md             文化编码（颜色/符号/数字/代际）
    │   ├── brand-archetypes.md          12 种品牌原型 → 视觉方向
    │   └── composition-systems.md       7 种构图系统 + 读图路径
    ├── rubric/
    │   └── aesthetic-7dim.md            7 维评审打分表
    ├── prompt/
    │   └── 8-layer-template.md          Prompt 8 层组装模板
    └── workflows/
        ├── brand-project.md
        ├── quick-execution.md
        ├── critique-and-improve.md
        ├── information-design.md
        └── series-and-system.md
```

## 提供的能力

Skill 暴露 4 个工具：

| 工具 | 类型 | 说明 |
|------|------|------|
| `gpt_image_generate` | 执行 | 调用 gpt-image-2 文生图 |
| `gpt_image_edit` | 执行 | 以参考图（可选 mask）调 `/v1/images/edits` 生成/编辑 |
| `gpt_image_review` | 评审 | 按 7 维 rubric 对一组图输出结构化评审 JSON |
| `gpt_image_consistency` | 评审 | 在一组图上检查锁定变量的偏差，输出离群与修正建议 |

对应 CLI 子命令：`generate | edit | review | consistency`。

## 使用方式

### 1. 通过 CLI

```bash
# 文生图
node cli/index.js generate --prompt "一张高级感品牌海报" --n 1 --size 1536x1024 --quality high --session-name brand-kv-v1

# 参考图编辑
node cli/index.js edit \
  --prompt "保留整体构图，改为冷调、顶部 1/4 留给标题" \
  --image path/to/ref.png \
  --n 1 --quality high --session-name brand-kv-v2

# 7 维评审
node cli/index.js review \
  --image work_dir/.../image_001.png \
  --brief "小红书新品封面，调性温柔新中式，目标 25-35 岁都市女性"

# 系列一致性
node cli/index.js consistency \
  --image a.png --image b.png --image c.png \
  --locked palette,lighting,texture,typography
```

### 2. 通过 npm script

```bash
npm run generate -- --prompt "一张温暖克制的产品 KV" --n 1 --quality high
```

### 3. 通过编程 API

```javascript
const contract = require('./skill.contract');

const adapter = contract.createOpenClawAdapter({
  defaultQuality: 'high',
  defaultReviewModel: 'gpt-4.1',
  reviewEnabled: true,
  consistencyEnabled: false,
});

const generate = adapter.tools.find((t) => t.name === 'gpt_image_generate');
const result = await generate.execute('demo-call', {
  prompt: '一张温暖克制的产品 KV',
  n: 1,
  size: '1536x1024',
  sessionName: 'brand-kv-demo',
});
```

## 环境变量

必需：

- `OPENAI_API_KEY`

可选：

- `OPENAI_API_BASE`（默认 `https://api.openai.com/v1`）
- `GPT_IMAGE_OUTPUT_DIR`（默认 `./work_dir/generated_images_gpt_image_2`）
- `GPT_IMAGE_REVIEW_MODEL`（`review` 默认模型；未设置时最终回退 `gpt-4o`）
- `GPT_IMAGE_CONSISTENCY_MODEL`（`consistency` 默认模型；未设置时最终回退 `gpt-4o`）
- `GPT_IMAGE_REVIEW_ENABLED`（`true/false/1/0/on/off`，默认 `true`）
- `GPT_IMAGE_CONSISTENCY_ENABLED`（`true/false/1/0/on/off`，默认 `true`）

`review` / `consistency` 的优先级为：显式参数（如 `--model`） > `--config-file` JSON > runtime / 环境变量 > 代码兜底值。

当 `GPT_IMAGE_REVIEW_ENABLED=false` 或 `GPT_IMAGE_CONSISTENCY_ENABLED=false` 时，对应命令会被直接拒绝执行。

示例：`review-config.json`

```json
{
  "model": "gpt-4.1",
  "images": ["work_dir/generated_images_gpt_image_2/demo/image_001.png"],
  "brief": "新品封面，调性克制、真实、适合电商首图",
  "temperature": 0.1,
  "maxTokens": 1800
}
```

```bash
node cli/index.js review --config-file review-config.json --model gpt-4o-mini
```

上例中最终会使用 `gpt-4o-mini`，因为显式参数优先级高于配置文件。

## 设计工作流

详情见 [SKILL.md](SKILL.md)。核心流程：

1. **Task Router**：按 5 类任务（`brand_project` / `quick_execution` / `information_design` / `critique_and_improve` / `series_and_system`）分流到对应 workflow。
2. **Mode Cards**：按需激活 5 种思考模式——`Problem Definer` / `Cognitive Lens` / `Visual Translator` / `Prompt Director` / `Critic`。
3. **Quality Gates**：
   - Gate A：问题定义后确认 brief。
   - Gate B：视觉方向定好后确认风格。
   - Gate C：首批出图后按 7 维评审决定迭代或改方向。

五条不变原则：

1. 先定义问题，再写 prompt。
2. 先给一个强方向，再扩展多个弱方向。
3. 文字上图是高风险项，必须单独检查。
4. 信息图优先保证正确和可读，再考虑装饰。
5. 系列图先锁定统一变量，再放开局部变化。

## 进一步阅读

- [SKILL.md](SKILL.md) · Skill 认知入口
- [docs/reference.md](docs/reference.md) · 索引与核心口诀
- [docs/examples.md](docs/examples.md) · 5 类任务示例
- [docs/workflows/](docs/workflows/) · 5 份可逐步执行的工作流
- [docs/knowledge/](docs/knowledge/) · 4 张知识卡
- [docs/rubric/aesthetic-7dim.md](docs/rubric/aesthetic-7dim.md) · 7 维评审打分表
- [docs/prompt/8-layer-template.md](docs/prompt/8-layer-template.md) · 8 层 Prompt 模板
- [docs/script-contract.md](docs/script-contract.md) · 脚本参数与命令契约
