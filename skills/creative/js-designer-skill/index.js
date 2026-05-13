#!/usr/bin/env node
'use strict';

const path = require('path');

const COMMANDS = {
  generate: {
    module: './scripts/gpt-image-generate',
    description: '调用 gpt-image 生成脚本输出图片',
  },
  edit: {
    module: './scripts/gpt-image-edit',
    description: '调用 gpt-image 编辑接口，以一张或多张参考图生成新图（可选 mask 局部编辑）',
  },
  review: {
    module: './scripts/gpt-image-review',
    description: '按 7 维 rubric 对一张或多张图做结构化评审',
  },
  consistency: {
    module: './scripts/gpt-image-consistency',
    description: '对一组图做一致性检查，报告锁定变量的偏差与修正建议',
  },
};

function printUsage() {
  console.log('\njs-designer-skill - 设计师图像技能');
  console.log('='.repeat(50));
  console.log('\n使用方法:');
  console.log('  node index.js <command> [args...] [options]\n');
  console.log('命令:');
  for (const [command, info] of Object.entries(COMMANDS)) {
    console.log(`  ${command.padEnd(12)} ${info.description}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const commandInfo = COMMANDS[command];
  if (!commandInfo) {
    throw new Error(`未知命令: ${command}`);
  }

  const originalArgv = [...process.argv];
  process.argv = [process.argv[0], path.join(__dirname, 'index.js'), ...args.slice(1)];

  try {
    const scriptModule = require(commandInfo.module);
    await scriptModule.main();
  } finally {
    process.argv = originalArgv;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main };
