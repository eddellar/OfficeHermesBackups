#!/usr/bin/env node
'use strict';

const { resolveRuntimeConfig } = require('../lib/runtimeConfig');
const { editImage } = require('../lib/api');

function parseEditArgs(argv) {
  const args = argv.slice(2);
  const options = {
    images: [],
    imagesJson: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prompt' && args[i + 1]) options.prompt = args[++i];
    else if (arg === '--api-key' && args[i + 1]) options.apiKey = args[++i];
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--n' && args[i + 1]) options.n = parseInt(args[++i], 10);
    else if (arg === '--size' && args[i + 1]) options.size = args[++i];
    else if (arg === '--quality' && args[i + 1]) options.quality = args[++i];
    else if (arg === '--output-format' && args[i + 1]) options.outputFormat = args[++i];
    else if (arg === '--output-compression' && args[i + 1]) options.outputCompression = parseInt(args[++i], 10);
    else if (arg === '--background' && args[i + 1]) options.background = args[++i];
    else if (arg === '--input-fidelity' && args[i + 1]) options.inputFidelity = args[++i];
    else if (arg === '--moderation' && args[i + 1]) options.moderation = args[++i];
    else if (arg === '--image' && args[i + 1]) options.images.push(args[++i]);
    else if (arg === '--image-url' && args[i + 1]) options.imagesJson.push({ image_url: args[++i] });
    else if (arg === '--image-file-id' && args[i + 1]) options.imagesJson.push({ file_id: args[++i] });
    else if (arg === '--mask' && args[i + 1]) options.mask = args[++i];
    else if (arg === '--mask-url' && args[i + 1]) options.maskJson = { image_url: args[++i] };
    else if (arg === '--mask-file-id' && args[i + 1]) options.maskJson = { file_id: args[++i] };
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
  console.log('\njs-designer-skill - gpt-image 编辑命令（以参考图生成）');
  console.log('='.repeat(60));
  console.log('\n使用方法:');
  console.log('  node cli/index.js edit --prompt "描述" --image path/to/ref.png [options]\n');
  console.log('参考图来源（二选一；本地可多张，最多 16）:');
  console.log('  --image <file>              本地参考图，可重复');
  console.log('  --image-url <url|dataURL>   远程 URL 或 base64 data URL，可重复');
  console.log('  --image-file-id <id>        OpenAI File API 已上传的 file_id，可重复');
  console.log('\n局部编辑蒙版（可选）:');
  console.log('  --mask <file>               本地蒙版（需配合 --image）');
  console.log('  --mask-url <url|dataURL>    远程蒙版（配合 --image-url/--image-file-id）');
  console.log('  --mask-file-id <id>         已上传的蒙版 file_id');
  console.log('\n常用选项:');
  console.log('  --model <name>              默认 gpt-image-2');
  console.log('  --n <count>                 生成张数 1-10');
  console.log('  --size <size>               auto|1024x1024|1536x1024|1024x1536');
  console.log('  --quality <level>           low|medium|high|auto');
  console.log('  --output-format <fmt>       png|jpeg|webp');
  console.log('  --output-compression <n>    0-100（jpeg/webp）');
  console.log('  --background <bg>           transparent|opaque|auto');
  console.log('  --input-fidelity <f>        high|low');
  console.log('  --moderation <m>            auto|low');
  console.log('  --output-dir <dir>          输出目录');
  console.log('  --session-name <name>       会话目录名');
  console.log('  --base-url <url>            自定义 API 根');
  console.log('  --api-key <key>             覆盖 OPENAI_API_KEY');
}

async function main() {
  const options = parseEditArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }

  const runtime = resolveRuntimeConfig(options);
  const result = await editImage(runtime, options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main, parseEditArgs };
