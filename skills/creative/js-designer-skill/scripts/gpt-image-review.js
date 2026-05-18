#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { resolveRuntimeConfig } = require('../lib/runtimeConfig');
const { reviewImages } = require('../lib/api');

function parseReviewArgs(argv) {
  const args = argv.slice(2);
  const options = {
    images: [],
    imagesJson: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--image' && args[i + 1]) options.images.push(args[++i]);
    else if (arg === '--image-url' && args[i + 1]) options.imagesJson.push({ image_url: args[++i] });
    else if (arg === '--image-file-id' && args[i + 1]) options.imagesJson.push({ file_id: args[++i] });
    else if (arg === '--brief' && args[i + 1]) options.brief = args[++i];
    else if (arg === '--brief-file' && args[i + 1]) options.brief = fs.readFileSync(args[++i], 'utf8');
    else if (arg === '--rubric-file' && args[i + 1]) options.rubric = fs.readFileSync(args[++i], 'utf8');
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) options.outputDir = args[++i];
    else if (arg === '--session-name' && args[i + 1]) options.sessionName = args[++i];
    else if (arg === '--base-url' && args[i + 1]) options.baseUrl = args[++i];
    else if (arg === '--api-key' && args[i + 1]) options.apiKey = args[++i];
    else if (arg === '--temperature' && args[i + 1]) options.temperature = Number(args[++i]);
    else if (arg === '--max-tokens' && args[i + 1]) options.maxTokens = Number(args[++i]);
    else if (arg === '--config-file' && args[i + 1]) options.configFile = args[++i];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function printUsage() {
  console.log('\njs-designer-skill - gpt-image 视觉评审（7 维）');
  console.log('='.repeat(60));
  console.log('\n使用方法:');
  console.log('  node cli/index.js review --image <path> [--image <path> ...] --brief "…"\n');
  console.log('输入选项:');
  console.log('  --image <file>              本地评审图，可重复（最多 10 张）');
  console.log('  --image-url <url|dataURL>   远程 URL 或 base64 data URL，可重复');
  console.log('  --image-file-id <id>        OpenAI File API 已上传的 file_id，可重复');
  console.log('  --brief "…"                 brief 文本（建议附结构化 brief 提升评审准确度）');
  console.log('  --brief-file <path>         从文件读取 brief');
  console.log('  --rubric-file <path>        从文件读取自定义 rubric（默认内置 7 维 rubric）');
  console.log('  --config-file <path>        从 JSON 读取参数；显式参数优先级高于配置文件');
  console.log('\n其他:');
  console.log('  --model <name>              评审模型；默认取 GPT_IMAGE_REVIEW_MODEL，最终回退 gpt-4o');
  console.log('  --output-dir <dir>          结果保存根目录');
  console.log('  --session-name <name>       会话目录名');
  console.log('  --temperature <n>           默认 0.2');
  console.log('  --max-tokens <n>            默认 2000');
  console.log('  --base-url <url>            自定义 API 根');
  console.log('  --api-key <key>             覆盖 OPENAI_API_KEY');
  console.log('  功能开关:                   GPT_IMAGE_REVIEW_ENABLED=false 时将拒绝执行');
}

async function main() {
  const options = parseReviewArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }

  const runtime = resolveRuntimeConfig(options);
  const result = await reviewImages(runtime, options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main, parseReviewArgs };
