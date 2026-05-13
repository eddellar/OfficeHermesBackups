'use strict';

const fs = require('fs');
const path = require('path');
const GptImage2Generator = require('../scripts/gptImageGenerator');
const GptImageEditor = require('../scripts/gptImageEditor');
const GptImageReviewer = require('../scripts/gptImageReviewer');
const GptImageConsistencyChecker = require('../scripts/gptImageConsistencyChecker');

function normalizeCommonParams(runtimeConfig = {}, params = {}) {
  return {
    ...params,
    apiKey: params.apiKey || runtimeConfig.apiKey,
    baseUrl: params.baseUrl || runtimeConfig.baseUrl,
    model: params.model || runtimeConfig.defaultModel,
    n: params.n != null ? params.n : runtimeConfig.defaultCount,
    size: params.size || runtimeConfig.defaultSize,
    quality: params.quality || runtimeConfig.defaultQuality,
    outputDir: path.resolve(params.outputDir || runtimeConfig.defaultOutputDir),
  };
}

function readConfigFile(configFile) {
  if (!fs.existsSync(configFile)) {
    throw new Error(`配置不存在: ${configFile}`);
  }
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function mergeDefined(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function normalizeExplicitParams(params = {}) {
  const normalized = { ...params };
  delete normalized.help;

  if (Array.isArray(normalized.images) && normalized.images.length === 0) {
    delete normalized.images;
  }
  if (Array.isArray(normalized.imagesJson) && normalized.imagesJson.length === 0) {
    delete normalized.imagesJson;
  }
  if (Array.isArray(normalized.lockedVariables) && normalized.lockedVariables.length === 0) {
    delete normalized.lockedVariables;
  }

  return normalized;
}

function normalizeReviewParams(runtimeConfig = {}, params = {}, options = {}) {
  const defaults = {
    apiKey: runtimeConfig.apiKey,
    baseUrl: runtimeConfig.baseUrl,
    model: options.defaultModel,
    enabled: options.enabled,
    outputDir: runtimeConfig.defaultOutputDir,
  };
  const configParams = params.configFile ? readConfigFile(params.configFile) : null;
  const explicitParams = normalizeExplicitParams(params);

  return {
    ...mergeDefined(defaults, configParams, explicitParams),
    outputDir: path.resolve(
      (explicitParams.outputDir || (configParams && configParams.outputDir) || runtimeConfig.defaultOutputDir),
    ),
  };
}

function normalizeGenerateParams(runtimeConfig, params) {
  return normalizeCommonParams(runtimeConfig, params);
}

function normalizeEditParams(runtimeConfig, params) {
  return normalizeCommonParams(runtimeConfig, params);
}

async function generateImage(runtimeConfig, params = {}) {
  const normalized = normalizeGenerateParams(runtimeConfig, params);

  let generator;
  if (normalized.configFile) {
    generator = GptImage2Generator.loadFromConfig(normalized.configFile);
    if (!generator.config.outputDir) {
      generator.config.outputDir = normalized.outputDir;
    }
  } else {
    generator = new GptImage2Generator(normalized);
  }

  return generator.execute();
}

async function editImage(runtimeConfig, params = {}) {
  const normalized = normalizeEditParams(runtimeConfig, params);

  let editor;
  if (normalized.configFile) {
    editor = GptImageEditor.loadFromConfig(normalized.configFile);
    if (!editor.config.outputDir) {
      editor.config.outputDir = normalized.outputDir;
    }
  } else {
    editor = new GptImageEditor(normalized);
  }

  return editor.execute();
}

async function reviewImages(runtimeConfig, params = {}) {
  const normalized = normalizeReviewParams(runtimeConfig, params, {
    defaultModel: runtimeConfig.defaultReviewModel,
    enabled: runtimeConfig.reviewEnabled,
  });

  if (normalized.enabled === false) {
    throw new Error(
      'review 功能已禁用。请设置 GPT_IMAGE_REVIEW_ENABLED=true，或在运行时配置中传入 reviewEnabled: true。',
    );
  }

  const reviewer = new GptImageReviewer(normalized);

  return reviewer.execute();
}

async function checkConsistency(runtimeConfig, params = {}) {
  const normalized = normalizeReviewParams(runtimeConfig, params, {
    defaultModel: runtimeConfig.defaultConsistencyModel,
    enabled: runtimeConfig.consistencyEnabled,
  });

  if (normalized.enabled === false) {
    throw new Error(
      'consistency 功能已禁用。请设置 GPT_IMAGE_CONSISTENCY_ENABLED=true，或在运行时配置中传入 consistencyEnabled: true。',
    );
  }

  const checker = new GptImageConsistencyChecker(normalized);

  return checker.execute();
}

module.exports = {
  normalizeGenerateParams,
  normalizeEditParams,
  normalizeReviewParams,
  generateImage,
  editImage,
  reviewImages,
  checkConsistency,
};
