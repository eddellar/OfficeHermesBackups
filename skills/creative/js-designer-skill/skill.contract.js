'use strict';

const pkg = require('./package.json');
const { resolveRuntimeConfig } = require('./lib/runtimeConfig');
const { generateImage, editImage, reviewImages, checkConsistency } = require('./lib/api');

const CLI_COMMANDS = [
  { name: 'generate', description: '调用 gpt-image-2 生成图片' },
  { name: 'edit', description: '以参考图（可选 mask）调用 gpt-image-2 编辑接口生成新图' },
  { name: 'review', description: '按 7 维 rubric 对一张或多张图做结构化评审（默认模型与开关可配置）' },
  { name: 'consistency', description: '在一组图上做一致性检查，报告锁定变量的偏差与修正建议（默认模型与开关可配置）' },
];

function makeLogger(logger) {
  return {
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : console.log.bind(console),
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : console.warn.bind(console),
    error: typeof logger?.error === 'function' ? logger.error.bind(logger) : console.error.bind(console),
  };
}

function createRuntime(config = {}, logger) {
  const resolvedConfig = resolveRuntimeConfig(config);
  return {
    config: resolvedConfig,
    logger: makeLogger(logger),
    textResult(text) {
      return { content: [{ type: 'text', text }] };
    },
    jsonResult(value) {
      return this.textResult(JSON.stringify(value, null, 2));
    },
  };
}

const TOOL_DEFINITIONS = [
  {
    name: 'gpt_image_generate',
    label: 'GPT Image Designer: Generate',
    description: '调用 gpt-image-2 生成图片，支持 prompt、尺寸、质量、输出目录与会话命名。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '图片生成提示词' },
        model: { type: 'string', description: '模型名，默认 gpt-image-2' },
        n: { type: 'number', description: '生成张数，1-10' },
        size: { type: 'string', description: '图片尺寸，如 1024x1024、1536x1024、auto' },
        quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'], description: '生成质量' },
        responseFormat: { type: 'string', enum: ['b64_json', 'url'], description: '返回格式' },
        moderation: { type: 'string', enum: ['auto', 'low'], description: '审核级别' },
        outputDir: { type: 'string', description: '输出目录' },
        sessionName: { type: 'string', description: '会话目录名' },
        baseUrl: { type: 'string', description: '自定义 API 根' },
        apiKey: { type: 'string', description: '覆盖环境变量的 API Key' },
        user: { type: 'string', description: '可选 user 字段' },
      },
      required: ['prompt'],
    },
    optional: true,
    async execute(runtime, params) {
      return generateImage(runtime.config, params);
    },
  },
  {
    name: 'gpt_image_edit',
    label: 'GPT Image Designer: Edit (with reference images)',
    description: '以参考图调用 gpt-image-2 /images/edits 接口生成新图；支持多张参考图与可选 mask 局部编辑。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '编辑提示词' },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '本地参考图文件路径数组（1-16 张，multipart 方式）',
        },
        imagesJson: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file_id: { type: 'string' },
              image_url: { type: 'string' },
            },
          },
          description: 'JSON 方式参考图数组：file_id 或 image_url(URL/data URL)',
        },
        mask: { type: 'string', description: '本地 mask 文件路径（局部编辑，配合 images 本地数组）' },
        maskJson: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            image_url: { type: 'string' },
          },
          description: 'JSON 方式 mask（配合 imagesJson）',
        },
        model: { type: 'string', description: '模型名，默认 gpt-image-2' },
        n: { type: 'number', description: '生成张数 1-10' },
        size: { type: 'string', description: 'auto|1024x1024|1536x1024|1024x1536' },
        quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'] },
        outputFormat: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        outputCompression: { type: 'number', description: '0-100（jpeg/webp）' },
        background: { type: 'string', enum: ['transparent', 'opaque', 'auto'] },
        inputFidelity: { type: 'string', enum: ['high', 'low'] },
        moderation: { type: 'string', enum: ['auto', 'low'] },
        outputDir: { type: 'string' },
        sessionName: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        user: { type: 'string' },
      },
      required: ['prompt'],
    },
    optional: true,
    async execute(runtime, params) {
      return editImage(runtime.config, params);
    },
  },
  {
    name: 'gpt_image_review',
    label: 'GPT Image Designer: 7-Dimension Review',
    description: '用多模态模型按 7 维 rubric 评审一张或多张图，输出结构化 JSON；默认模型与功能开关由 runtime/env 控制。',
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '本地图片路径数组（1-10 张）',
        },
        imagesJson: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file_id: { type: 'string' },
              image_url: { type: 'string' },
            },
          },
          description: 'JSON 方式：file_id 或 image_url(URL/data URL)',
        },
        brief: { type: 'string', description: '结构化 brief 文本（建议附；评审会结合 brief 判断）' },
        rubric: { type: 'string', description: '可选，覆盖默认 7 维 rubric 文本' },
        model: { type: 'string', description: '评审用多模态模型；默认取 runtimeConfig.defaultReviewModel / GPT_IMAGE_REVIEW_MODEL，最终回退 gpt-4o' },
        temperature: { type: 'number' },
        maxTokens: { type: 'number' },
        configFile: { type: 'string', description: '从 JSON 配置文件读取参数；显式传入的字段优先级更高' },
        outputDir: { type: 'string' },
        sessionName: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
      },
    },
    optional: true,
    async execute(runtime, params) {
      return reviewImages(runtime.config, params);
    },
  },
  {
    name: 'gpt_image_consistency',
    label: 'GPT Image Designer: Series Consistency',
    description: '对一组图做一致性检查；输入锁定变量并输出差异报告。默认模型与功能开关由 runtime/env 控制。',
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '本地图片路径数组（2-8 张）',
        },
        imagesJson: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file_id: { type: 'string' },
              image_url: { type: 'string' },
            },
          },
          description: 'JSON 方式：file_id 或 image_url',
        },
        lockedVariables: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['palette', 'lighting', 'framing', 'texture', 'character', 'typography', 'aspect_ratio', 'brand_cues'],
          },
          description: '必须保持一致的维度清单',
        },
        permittedVariance: { type: 'string', description: '允许变化的维度的文本描述' },
        brief: { type: 'string', description: '可选 brief，帮助更准确的判定' },
        model: { type: 'string', description: '多模态模型；默认取 runtimeConfig.defaultConsistencyModel / GPT_IMAGE_CONSISTENCY_MODEL，最终回退 gpt-4o' },
        temperature: { type: 'number' },
        maxTokens: { type: 'number' },
        configFile: { type: 'string', description: '从 JSON 配置文件读取参数；显式传入的字段优先级更高' },
        outputDir: { type: 'string' },
        sessionName: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
      },
    },
    optional: true,
    async execute(runtime, params) {
      return checkConsistency(runtime.config, params);
    },
  },
];

function createOpenClawAdapter(config = {}, logger) {
  const runtime = createRuntime(config, logger);
  return {
    runtime,
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      optional: tool.optional,
      async execute(toolCallId, params) {
        const result = await tool.execute(runtime, params, { toolCallId });
        return runtime.jsonResult(result);
      },
    })),
  };
}

module.exports = {
  id: pkg.name,
  name: 'JS GPT Image Designer Skill',
  version: pkg.version,
  description: pkg.description,
  runtime: {
    requiresServer: false,
    requiresBrowserExtension: false,
    platforms: ['*'],
  },
  cli: {
    entry: './cli/index.js',
    commands: CLI_COMMANDS,
  },
  openclaw: {
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      optional: tool.optional,
    })),
  },
  createRuntime,
  createOpenClawAdapter,
};
