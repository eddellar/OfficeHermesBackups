'use strict';

const path = require('path');

function parseBooleanFlag(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveRuntimeConfig(overrides = {}) {
  return {
    apiKey: overrides.apiKey || process.env.OPENAI_API_KEY || null,
    baseUrl: overrides.baseUrl || process.env.OPENAI_API_BASE || null,
    defaultModel: overrides.defaultModel || 'gpt-image-2',
    defaultReviewModel: overrides.defaultReviewModel || process.env.GPT_IMAGE_REVIEW_MODEL || 'gpt-4o',
    defaultConsistencyModel: overrides.defaultConsistencyModel || process.env.GPT_IMAGE_CONSISTENCY_MODEL || 'gpt-4o',
    reviewEnabled: parseBooleanFlag(overrides.reviewEnabled, parseBooleanFlag(process.env.GPT_IMAGE_REVIEW_ENABLED, true)),
    consistencyEnabled: parseBooleanFlag(
      overrides.consistencyEnabled,
      parseBooleanFlag(process.env.GPT_IMAGE_CONSISTENCY_ENABLED, true),
    ),
    defaultQuality: overrides.defaultQuality || 'auto',
    defaultSize: overrides.defaultSize || 'auto',
    defaultCount: Number(overrides.defaultCount || 1),
    defaultOutputDir: overrides.defaultOutputDir
      || process.env.GPT_IMAGE_OUTPUT_DIR
      || path.resolve(process.cwd(), 'work_dir', 'generated_images_gpt_image_2'),
  };
}

module.exports = {
  parseBooleanFlag,
  resolveRuntimeConfig,
};
