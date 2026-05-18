#!/usr/bin/env node

/**
 * OpenAI gpt-image-2 图像生成工具脚本
 * 基于 Image API: POST /v1/images/generations
 *
 * 环境变量: OPENAI_API_KEY、OPENAI_API_BASE（与 doubao 中 DOUBAO_API_KEY 类似；BASE 为 API 根，可省略用默认 https://api.openai.com/v1）
 *
 * 使用方法:
 * node skills/js-designer-skill/index.js generate [选项]
 *
 * 主要选项:
 * --prompt <text>      图片生成提示词 (必需)
 * --api-key <key>      可覆盖 .env 中的 OPENAI_API_KEY
 * --model <model>      默认 gpt-image-2
 * --n <count>          生成张数 1-10 (默认 1)
 * --size <size>        如 1024x1024、1536x1024、auto
 * --quality <q>        low|medium|high|auto
 * --format <fmt>       b64_json|url (默认 b64_json)
 * --moderation <m>     auto|low
 * --output-dir <dir>   默认 ./work_dir/generated_images_gpt_image_2
 * --session-name <n>   会话子目录名
 * --config-file <file> 从 JSON 读入参数（可含除 apiKey 外的全部字段，apiKey 读 env）
 * --base-url <url>     自定义 API 根，默认与 OPENAI_API_BASE 或 https://api.openai.com/v1
 * --no-rename-png      不根据图片魔数重命名扩展名（统一用 jpg 占位，不推荐）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

require('dotenv').config();

global.rootDir = path.resolve(__dirname, '..');

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-image-2';
const SUPPORTED_FORMATS = ['b64_json', 'url'];
const SUPPORTED_QUALITIES = ['low', 'medium', 'high', 'auto'];
const SUPPORTED_MODERATION = ['auto', 'low'];
const OPTIONAL_REQUEST_PARAMS = new Set(['size', 'quality', 'response_format', 'moderation', 'user']);

class GptImage2Generator {
  constructor(options = {}) {
    this.config = {
      baseUrl: (options.baseUrl || process.env.OPENAI_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || null,
      model: options.model || DEFAULT_MODEL,
      prompt: options.prompt || null,
      n: options.n != null ? options.n : 1,
      size: options.size != null ? options.size : 'auto',
      quality: options.quality != null ? options.quality : 'auto',
      responseFormat: options.responseFormat || 'b64_json',
      moderation: options.moderation != null ? options.moderation : 'auto',
      outputDir: options.outputDir || './work_dir/generated_images_gpt_image_2',
      sessionName: options.sessionName || null,
      timeout: options.timeout || 300000,
      retryCount: options.retryCount != null ? options.retryCount : 3,
      retryDelay: options.retryDelay || 2000,
      user: options.user != null ? options.user : null,
      renameByMagicBytes: options.renameByMagicBytes !== false
    };

    this.sessionDir = null;
    this.generatedImages = [];
    this.taskStatus = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.rawResponse = null;
    this.disabledRequestParams = new Set();

    this.validateConfig();
  }

  validateConfig() {
    console.log('验证配置...');

    if (!this.config.prompt) {
      throw new Error('必须提供图片生成提示词 (--prompt)');
    }
    if (!this.config.apiKey) {
      throw new Error('必须提供 API 密钥: 在 .env 中设置 OPENAI_API_KEY 或使用 --api-key');
    }
    if (!Number.isFinite(this.config.n) || this.config.n < 1 || this.config.n > 10) {
      throw new Error('生成张数 n 需在 1-10 之间');
    }
    if (!SUPPORTED_FORMATS.includes(this.config.responseFormat)) {
      throw new Error(`不支持的 response_format: ${this.config.responseFormat}。可选: ${SUPPORTED_FORMATS.join(', ')}`);
    }
    if (!SUPPORTED_QUALITIES.includes(this.config.quality)) {
      throw new Error(`不支持的 quality: ${this.config.quality}。可选: ${SUPPORTED_QUALITIES.join(', ')}`);
    }
    if (!SUPPORTED_MODERATION.includes(this.config.moderation)) {
      throw new Error(`不支持的 moderation: ${this.config.moderation}。可选: ${SUPPORTED_MODERATION.join(', ')}`);
    }
    console.log('配置通过');
  }

  initializeSession() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const sessionName = this.config.sessionName || `gpt_image2_${timestamp}`;

    this.sessionDir = path.join(this.config.outputDir, sessionName);
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      console.log(`创建会话目录: ${this.sessionDir}`);
    }

    const sessionInfo = {
      sessionName,
      sessionDirectory: this.sessionDir,
      model: this.config.model,
      createdAt: new Date().toISOString(),
      status: 'initialized'
    };
    fs.writeFileSync(
      path.join(this.sessionDir, 'session_info.json'),
      JSON.stringify(sessionInfo, null, 2)
    );
    console.log(`会话: ${sessionName}`);
    return this.sessionDir;
  }

  buildRequestBody() {
    const body = {
      model: this.config.model,
      prompt: this.config.prompt,
      n: this.config.n
    };

    if (!this.disabledRequestParams.has('size')) body.size = this.config.size;
    if (!this.disabledRequestParams.has('quality')) body.quality = this.config.quality;
    if (!this.disabledRequestParams.has('response_format')) body.response_format = this.config.responseFormat;
    if (!this.disabledRequestParams.has('moderation')) body.moderation = this.config.moderation;
    if (this.config.user && !this.disabledRequestParams.has('user')) body.user = this.config.user;
    return body;
  }

  extractUnknownParameter(err) {
    if (!err || !err.message) return null;
    const match = err.message.match(/Unknown parameter:\s*'([^']+)'/i);
    return match ? match[1] : null;
  }

  _parseBaseUrlForRequest(u) {
    const withProto = u.startsWith('http') ? u : `https://${u}`;
    const parsed = new URL(withProto);
    const isHttps = parsed.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;
    let pathname = (parsed.pathname || '/').replace(/\/$/, '');
    if (!/\/images(\/generations)?$/.test(pathname) && !pathname.includes('/v1/')) {
      if (!pathname.endsWith('/v1')) {
        pathname = `${pathname && pathname !== '/' ? pathname : ''}/v1`;
      }
    }
    if (!/\/images\/generations$/.test(pathname)) {
      pathname = `${pathname}/images/generations`;
    }
    return { hostname: parsed.hostname, port: parseInt(parsed.port, 10) || defaultPort, isHttps, path: pathname + (parsed.search || '') };
  }

  sendApiRequest(requestBody) {
    return new Promise((resolve, reject) => {
      const { hostname, port, isHttps, path: reqPath } = this._parseBaseUrlForRequest(this.config.baseUrl);
      const postData = JSON.stringify(requestBody);
      const lib = isHttps ? https : http;

      const options = {
        hostname,
        port,
        path: reqPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Length': Buffer.byteLength(postData, 'utf8')
        },
        timeout: this.config.timeout
      };

      const req = lib.request(options, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw || '(无响应体)'}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`JSON 解析失败: ${e.message}`));
          }
        });
      });
      req.on('error', (err) => reject(new Error(`请求错误: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      req.write(postData);
      req.end();
    });
  }

  detectExt(buf) {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    return 'bin';
  }

  downloadImage(imageUrl, imagePath) {
    return new Promise((resolve, reject) => {
      const lib = imageUrl.startsWith('https:') ? https : http;
      const req = lib.get(imageUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(imagePath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`已下载: ${imagePath}`);
          resolve(imagePath);
        });
        file.on('error', (e) => reject(e));
      });
      req.on('error', (e) => reject(e));
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('下载超时'));
      });
    });
  }

  saveB64ToFile(b64, imagePathBase) {
    const cleaned = b64.replace(/^data:image\/[a-z+]+;base64,/, '');
    const imageBuffer = Buffer.from(cleaned, 'base64');
    let finalPath = imagePathBase;
    if (this.config.renameByMagicBytes) {
      const ext = this.detectExt(imageBuffer);
      if (ext !== 'bin') {
        const dir = path.dirname(imagePathBase);
        const base = path.basename(imagePathBase, path.extname(imagePathBase));
        finalPath = path.join(dir, `${base}.${ext}`);
      }
    }
    fs.writeFileSync(finalPath, imageBuffer);
    console.log(`已保存: ${finalPath}`);
    return finalPath;
  }

  generateFileName(i) {
    const t = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const idx = String(i + 1).padStart(3, '0');
    return `image_${idx}_${t}`;
  }

  saveGenerationResult() {
    const out = {
      sessionName: path.basename(this.sessionDir),
      config: { ...this.config, apiKey: '***' },
      raw: this.rawResponse,
      generatedImages: this.generatedImages,
      taskStatus: this.taskStatus,
      startTime: this.startTime,
      endTime: this.endTime
    };
    if (out.endTime && out.startTime) {
      out.durationMs = out.endTime - out.startTime;
    }
    out.savedAt = new Date().toISOString();
    const fp = path.join(this.sessionDir, 'generation_result.json');
    fs.writeFileSync(fp, JSON.stringify(out, null, 2));
    console.log(`结果: ${fp}`);
  }

  async generateWithRetry() {
    let last;
    for (let attempt = 1; attempt <= this.config.retryCount; attempt += 1) {
      try {
        if (this.config.retryCount > 1) {
          console.log(`尝试 ${attempt}/${this.config.retryCount}`);
        }
        return await this.executeOnce();
      } catch (e) {
        last = e;
        console.error(`失败: ${e.message}`);
        if (attempt < this.config.retryCount) {
          await new Promise((r) => setTimeout(r, this.config.retryDelay));
        }
      }
    }
    throw last;
  }

  async executeOnce() {
    let response;
    while (true) {
      const requestBody = this.buildRequestBody();
      try {
        response = await this.sendApiRequest(requestBody);
        break;
      } catch (e) {
        const unknownParam = this.extractUnknownParameter(e);
        if (
          unknownParam
          && OPTIONAL_REQUEST_PARAMS.has(unknownParam)
          && !this.disabledRequestParams.has(unknownParam)
        ) {
          this.disabledRequestParams.add(unknownParam);
          console.warn(`接口不支持参数，自动忽略: ${unknownParam}`);
          continue;
        }
        throw e;
      }
    }

    this.rawResponse = response;

    const data = response.data;
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('响应中无 data 或为空');
    }

    for (let i = 0; i < data.length; i += 1) {
      const item = data[i];
      const base = this.generateFileName(i);
      const tentative = path.join(this.sessionDir, `${base}${this.config.responseFormat === 'url' ? '.jpg' : '.img'}`);

      try {
        if (this.config.responseFormat === 'b64_json' && item.b64_json) {
          const p = this.saveB64ToFile(item.b64_json, tentative);
          this.generatedImages.push({ index: i, filePath: p, source: 'b64_json' });
        } else if (this.config.responseFormat === 'url' && item.url) {
          const u = new URL(item.url);
          const ext = path.extname(u.pathname) || '.png';
          const p = path.join(this.sessionDir, `${base}${ext}`);
          await this.downloadImage(item.url, p);
          this.generatedImages.push({ index: i, filePath: p, source: 'url' });
        } else {
          throw new Error('缺少 b64_json 或 url 字段，与 --format 不一致');
        }
      } catch (e) {
        this.generatedImages.push({ index: i, filePath: null, error: e.message, source: this.config.responseFormat });
      }
    }

    return response;
  }

  async execute() {
    this.startTime = Date.now();
    console.log('gpt-image-2 生成开始');
    console.log(`model=${this.config.model} n=${this.config.n} size=${this.config.size}`);

    try {
      this.initializeSession();
      this.taskStatus = 'generating';
      await this.generateWithRetry();
      this.taskStatus = 'completed';
      this.endTime = Date.now();
      this.saveGenerationResult();
      const ok = this.generatedImages.filter((x) => x.filePath).length;
      console.log(`完成。成功 ${ok} 张, 输出目录: ${this.sessionDir}`);
      if (this.rawResponse && this.rawResponse.usage) {
        console.log(`usage: ${JSON.stringify(this.rawResponse.usage)}`);
      }
      return { success: true, sessionDir: this.sessionDir, generatedImages: this.generatedImages };
    } catch (e) {
      this.taskStatus = 'failed';
      this.endTime = Date.now();
      if (this.sessionDir) {
        const fail = { failed: true, error: e.message, at: new Date().toISOString() };
        try {
          fs.writeFileSync(path.join(this.sessionDir, 'generation_failed.json'), JSON.stringify(fail, null, 2));
        } catch (_) {}
      }
      throw e;
    }
  }

  static loadFromConfig(configFile) {
    if (!fs.existsSync(configFile)) {
      throw new Error(`配置不存在: ${configFile}`);
    }
    const c = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!c.apiKey) {
      c.apiKey = process.env.OPENAI_API_KEY;
    }
    return new GptImage2Generator(c);
  }
}

module.exports = GptImage2Generator;
