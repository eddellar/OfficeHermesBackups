#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { resolveRuntimeConfig } = require('../lib/runtimeConfig');
const { checkConsistency } = require('../lib/api');

function parseConsistencyArgs(argv) {
  const args = argv.slice(2);
  const options = {
    images: [],
    imagesJson: [],
    lockedVariables: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--image' && args[i + 1]) options.images.push(args[++i]);
    else if (arg === '--image-url' && args[i + 1]) options.imagesJson.push({ image_url: args[++i] });
    else if (arg === '--image-file-id' && args[i + 1]) options.imagesJson.push({ file_id: args[++i] });
    else if (arg === '--locked' && args[i + 1]) {
      for (const v of String(args[++i]).split(/[,;]+/)) {
        const k = v.trim();
        if (k) options.lockedVariables.push(k);
      }
    }
    else if (arg === '--permitted' && args[i + 1]) options.permittedVariance = args[++i];
    else if (arg === '--brief' && args[i + 1]) options.brief = args[++i];
    else if (arg === '--brief-file' && args[i + 1]) options.brief = fs.readFileSync(args[++i], 'utf8');
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
  console.log('\njs-designer-skill - gpt-image 系列一致性检查');
  console.log('='.repeat(60));
  console.log('\n使用方法:');
  console.log('  node cli/index.js consistency \\');
  console.log('    --image a.png --image b.png --image c.png \\');
  console.log('    --locked palette,lighting,texture,typography\n');
  console.log('输入选项:');
  console.log('  --image <file>              本地图片，可重复（2-8 张）');
  console.log('  --image-url <url|dataURL>   远程 URL 或 data URL，可重复');
  console.log('  --image-file-id <id>        已上传的 file_id，可重复');
  console.log('  --locked <a,b,c>            锁定变量，逗号分隔，可选:');
  console.log('                              palette, lighting, framing, texture, character,');
  console.log('                              typography, aspect_ratio, brand_cues');
  console.log('  --permitted "…"             允许变化的维度描述（可选）');
  console.log('  --brief "…" / --brief-file  原始 brief（可选，提升准确度）');
  console.log('  --config-file <path>        从 JSON 读取参数；显式参数优先级高于配置文件');
  console.log('\n其他:');
  console.log('  --model <name>              默认取 GPT_IMAGE_CONSISTENCY_MODEL，最终回退 gpt-4o');
  console.log('  --output-dir <dir>          结果保存根目录');
  console.log('  --session-name <name>       会话目录名');
  console.log('  --temperature <n>           默认 0.2');
  console.log('  --max-tokens <n>            默认 2500');
  console.log('  --base-url <url>            自定义 API 根');
  console.log('  --api-key <key>             覆盖 OPENAI_API_KEY');
  console.log('  功能开关:                   GPT_IMAGE_CONSISTENCY_ENABLED=false 时将拒绝执行');
}

async function main() {
  const options = parseConsistencyArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }

  const runtime = resolveRuntimeConfig(options);
  const result = await checkConsistency(runtime, options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main, parseConsistencyArgs };
