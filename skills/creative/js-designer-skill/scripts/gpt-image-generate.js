#!/usr/bin/env node
'use strict';

const { resolveRuntimeConfig } = require('../lib/runtimeConfig');
const { generateImage } = require('../lib/api');

function parseGenerateArgs(argv) {
  const args = argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prompt' && args[i + 1]) options.prompt = args[++i];
    else if (arg === '--api-key' && args[i + 1]) options.apiKey = args[++i];
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--n' && args[i + 1]) options.n = parseInt(args[++i], 10);
    else if (arg === '--size' && args[i + 1]) options.size = args[++i];
    else if (arg === '--quality' && args[i + 1]) options.quality = args[++i];
    else if (arg === '--format' && args[i + 1]) options.responseFormat = args[++i];
    else if (arg === '--moderation' && args[i + 1]) options.moderation = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) options.outputDir = args[++i];
    else if (arg === '--session-name' && args[i + 1]) options.sessionName = args[++i];
    else if (arg === '--config-file' && args[i + 1]) options.configFile = args[++i];
    else if (arg === '--base-url' && args[i + 1]) options.baseUrl = args[++i];
    else if (arg === '--user' && args[i + 1]) options.user = args[++i];
    else if (arg === '--no-rename-png') options.renameByMagicBytes = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log('\njs-designer-skill - gpt-image 生成命令');
  console.log('='.repeat(60));
  console.log('\n使用方法:');
  console.log('  node cli/index.js generate --prompt "描述" [options]\n');
  console.log('常用选项:');
  console.log('  --model <name>          默认 gpt-image-2');
  console.log('  --n <count>             生成张数 1-10');
  console.log('  --size <size>           如 1024x1024、1536x1024、auto');
  console.log('  --quality <level>       low|medium|high|auto');
  console.log('  --format <fmt>          b64_json|url');
  console.log('  --output-dir <dir>      输出目录');
  console.log('  --session-name <name>   会话目录名');
  console.log('  --base-url <url>        自定义 API 根');
  console.log('  --api-key <key>         覆盖 OPENAI_API_KEY');
}

async function main() {
  const options = parseGenerateArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }

  const runtime = resolveRuntimeConfig(options);
  const result = await generateImage(runtime, options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main, parseGenerateArgs };
