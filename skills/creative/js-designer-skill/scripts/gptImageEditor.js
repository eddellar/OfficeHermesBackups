#!/usr/bin/env node

/**
 * OpenAI gpt-image edits 调用脚本
 * 基于 Image API: POST /v1/images/edits
 *
 * 两种提供参考图的方式：
 *   1) multipart/form-data: images -> 本地文件路径数组，mask -> 本地文件路径
 *   2) JSON body: imagesJson -> [{file_id, image_url}]，maskJson -> {file_id, image_url}
 *
 * 主要选项（脚本对外字段）:
 *   prompt           编辑提示词（必填）
 *   images           本地参考图路径数组（1-16 张）
 *   imagesJson       JSON 方式的 images 数组
 *   mask             本地蒙版路径（可选，局部编辑用）
 *   maskJson         JSON 方式的 mask 对象
 *   model            默认 gpt-image-2
 *   n                1-10
 *   size             auto|1024x1024|1536x1024|1024x1536
 *   quality          low|medium|high|auto
 *   outputFormat     png|jpeg|webp
 *   outputCompression  0-100（jpeg/webp）
 *   background       transparent|opaque|auto
 *   inputFidelity    high|low
 *   moderation       auto|low
 *   user             审计字段
 *   outputDir        输出根目录
 *   sessionName      会话目录名
 *   baseUrl / apiKey 同 generator
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

require('dotenv').config();

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-image-2';
const SUPPORTED_QUALITIES = ['low', 'medium', 'high', 'auto'];
const SUPPORTED_MODERATION = ['auto', 'low'];
const SUPPORTED_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'];
const SUPPORTED_BACKGROUND = ['transparent', 'opaque', 'auto'];
const SUPPORTED_INPUT_FIDELITY = ['high', 'low'];
const OPTIONAL_REQUEST_FIELDS = new Set([
  'size', 'quality', 'moderation', 'background', 'input_fidelity',
  'output_format', 'output_compression', 'user',
]);

function detectExt(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (
    buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return 'bin';
}

function mimeFromExt(ext) {
  const e = ext.toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

class GptImageEditor {
  constructor(options = {}) {
    this.config = {
      baseUrl: (options.baseUrl || process.env.OPENAI_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || null,
      model: options.model || DEFAULT_MODEL,
      prompt: options.prompt || null,

      images: Array.isArray(options.images) ? options.images.slice() : [],
      imagesJson: Array.isArray(options.imagesJson) ? options.imagesJson.slice() : [],
      mask: options.mask || null,
      maskJson: options.maskJson || null,

      n: options.n != null ? Number(options.n) : 1,
      size: options.size != null ? options.size : 'auto',
      quality: options.quality != null ? options.quality : 'auto',
      outputFormat: options.outputFormat || null,
      outputCompression: options.outputCompression != null ? Number(options.outputCompression) : null,
      background: options.background || null,
      inputFidelity: options.inputFidelity || null,
      moderation: options.moderation != null ? options.moderation : 'auto',
      user: options.user != null ? options.user : null,

      outputDir: options.outputDir || './work_dir/generated_images_gpt_image_2',
      sessionName: options.sessionName || null,
      timeout: options.timeout || 300000,
      retryCount: options.retryCount != null ? options.retryCount : 3,
      retryDelay: options.retryDelay || 2000,
      renameByMagicBytes: options.renameByMagicBytes !== false,
    };

    this.sessionDir = null;
    this.generatedImages = [];
    this.taskStatus = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.rawResponse = null;
    this.disabledRequestFields = new Set();

    this.validateConfig();
  }

  validateConfig() {
    console.log('验证配置...');
    if (!this.config.prompt) {
      throw new Error('必须提供编辑提示词 (--prompt)');
    }
    if (!this.config.apiKey) {
      throw new Error('必须提供 API 密钥: 在 .env 中设置 OPENAI_API_KEY 或使用 --api-key');
    }

    const hasLocal = this.config.images.length > 0;
    const hasJson = this.config.imagesJson.length > 0;
    if (!hasLocal && !hasJson) {
      throw new Error('必须至少提供一张参考图：--image <本地路径> 或 --image-url <URL|data URL>');
    }
    if (hasLocal && hasJson) {
      throw new Error('不能同时使用本地文件 (--image) 与远程 URL (--image-url)，请二选一');
    }
    if (this.config.images.length > 16 || this.config.imagesJson.length > 16) {
      throw new Error('参考图最多 16 张');
    }
    for (const p of this.config.images) {
      if (!fs.existsSync(p)) throw new Error(`参考图不存在: ${p}`);
    }
    if (this.config.mask && !fs.existsSync(this.config.mask)) {
      throw new Error(`mask 文件不存在: ${this.config.mask}`);
    }
    if (this.config.mask && hasJson) {
      throw new Error('--mask (本地) 只能配合本地 --image 使用；JSON 模式请使用 --mask-url');
    }

    if (!Number.isFinite(this.config.n) || this.config.n < 1 || this.config.n > 10) {
      throw new Error('生成张数 n 需在 1-10 之间');
    }
    if (!SUPPORTED_QUALITIES.includes(this.config.quality)) {
      throw new Error(`不支持的 quality: ${this.config.quality}。可选: ${SUPPORTED_QUALITIES.join(', ')}`);
    }
    if (!SUPPORTED_MODERATION.includes(this.config.moderation)) {
      throw new Error(`不支持的 moderation: ${this.config.moderation}。可选: ${SUPPORTED_MODERATION.join(', ')}`);
    }
    if (this.config.outputFormat && !SUPPORTED_OUTPUT_FORMATS.includes(this.config.outputFormat)) {
      throw new Error(`不支持的 output_format: ${this.config.outputFormat}。可选: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`);
    }
    if (this.config.background && !SUPPORTED_BACKGROUND.includes(this.config.background)) {
      throw new Error(`不支持的 background: ${this.config.background}。可选: ${SUPPORTED_BACKGROUND.join(', ')}`);
    }
    if (this.config.inputFidelity && !SUPPORTED_INPUT_FIDELITY.includes(this.config.inputFidelity)) {
      throw new Error(`不支持的 input_fidelity: ${this.config.inputFidelity}。可选: ${SUPPORTED_INPUT_FIDELITY.join(', ')}`);
    }
    console.log('配置通过');
  }

  initializeSession() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const sessionName = this.config.sessionName || `gpt_image2_edit_${ts}`;
    this.sessionDir = path.join(this.config.outputDir, sessionName);
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      console.log(`创建会话目录: ${this.sessionDir}`);
    }
    fs.writeFileSync(
      path.join(this.sessionDir, 'session_info.json'),
      JSON.stringify({
        sessionName,
        sessionDirectory: this.sessionDir,
        mode: 'edit',
        model: this.config.model,
        createdAt: new Date().toISOString(),
        status: 'initialized',
      }, null, 2),
    );
    console.log(`会话: ${sessionName}`);
    return this.sessionDir;
  }

  _parseBaseUrlForEdits(u) {
    const withProto = u.startsWith('http') ? u : `https://${u}`;
    const parsed = new URL(withProto);
    const isHttps = parsed.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;
    let pathname = (parsed.pathname || '/').replace(/\/$/, '');
    if (!pathname.includes('/v1/') && !pathname.endsWith('/v1') && !/\/images(\/(edits|generations))?$/.test(pathname)) {
      pathname = `${pathname && pathname !== '/' ? pathname : ''}/v1`;
    }
    // 统一改写为 /images/edits
    pathname = pathname.replace(/\/images\/generations$/, '');
    pathname = pathname.replace(/\/images$/, '');
    if (!/\/images\/edits$/.test(pathname)) pathname = `${pathname}/images/edits`;
    return {
      hostname: parsed.hostname,
      port: parseInt(parsed.port, 10) || defaultPort,
      isHttps,
      path: pathname + (parsed.search || ''),
    };
  }

  extractUnknownParameter(err) {
    if (!err || !err.message) return null;
    const m = err.message.match(/Unknown parameter:\s*'([^']+)'/i);
    return m ? m[1] : null;
  }

  _buildScalarFields() {
    const f = {
      model: this.config.model,
      prompt: this.config.prompt,
      n: String(this.config.n),
    };
    if (this.config.size != null && !this.disabledRequestFields.has('size')) f.size = this.config.size;
    if (this.config.quality != null && !this.disabledRequestFields.has('quality')) f.quality = this.config.quality;
    if (this.config.moderation != null && !this.disabledRequestFields.has('moderation')) f.moderation = this.config.moderation;
    if (this.config.background && !this.disabledRequestFields.has('background')) f.background = this.config.background;
    if (this.config.inputFidelity && !this.disabledRequestFields.has('input_fidelity')) f.input_fidelity = this.config.inputFidelity;
    if (this.config.outputFormat && !this.disabledRequestFields.has('output_format')) f.output_format = this.config.outputFormat;
    if (this.config.outputCompression != null && !this.disabledRequestFields.has('output_compression')) f.output_compression = String(this.config.outputCompression);
    if (this.config.user && !this.disabledRequestFields.has('user')) f.user = this.config.user;
    return f;
  }

  _buildMultipartBody() {
    const boundary = `----jsdesigner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const parts = [];
    const crlf = '\r\n';
    const push = (chunk) => parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    const addField = (name, value) => {
      push(`--${boundary}${crlf}`);
      push(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}`);
      push(`${value}${crlf}`);
    };
    const addFile = (name, filePath) => {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mime = mimeFromExt(ext);
      const filename = path.basename(filePath);
      push(`--${boundary}${crlf}`);
      push(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${crlf}`);
      push(`Content-Type: ${mime}${crlf}${crlf}`);
      push(data);
      push(crlf);
    };

    const scalars = this._buildScalarFields();
    for (const [k, v] of Object.entries(scalars)) addField(k, v);
    for (const p of this.config.images) addFile('image[]', p);
    if (this.config.mask) addFile('mask', this.config.mask);

    push(`--${boundary}--${crlf}`);
    const body = Buffer.concat(parts);
    return { body, boundary };
  }

  _buildJsonBody() {
    const body = this._buildScalarFields();
    body.n = Number(body.n);
    if (body.output_compression != null) body.output_compression = Number(body.output_compression);
    body.images = this.config.imagesJson;
    if (this.config.maskJson) body.mask = this.config.maskJson;
    return body;
  }

  sendApiRequest() {
    const useMultipart = this.config.images.length > 0;
    const { hostname, port, isHttps, path: reqPath } = this._parseBaseUrlForEdits(this.config.baseUrl);
    const lib = isHttps ? https : http;

    let postData;
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (useMultipart) {
      const { body, boundary } = this._buildMultipartBody();
      postData = body;
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      headers['Content-Length'] = postData.length;
    } else {
      postData = Buffer.from(JSON.stringify(this._buildJsonBody()), 'utf8');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = postData.length;
    }

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname, port, path: reqPath, method: 'POST', headers, timeout: this.config.timeout,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw || '(无响应体)'}`));
            return;
          }
          try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`JSON 解析失败: ${e.message}`)); }
        });
      });
      req.on('error', (err) => reject(new Error(`请求错误: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(postData);
      req.end();
    });
  }

  saveB64ToFile(b64, imagePathBase) {
    const cleaned = b64.replace(/^data:image\/[a-z+]+;base64,/, '');
    const buf = Buffer.from(cleaned, 'base64');
    let finalPath = imagePathBase;
    if (this.config.renameByMagicBytes) {
      const ext = detectExt(buf);
      if (ext !== 'bin') {
        const dir = path.dirname(imagePathBase);
        const base = path.basename(imagePathBase, path.extname(imagePathBase));
        finalPath = path.join(dir, `${base}.${ext}`);
      }
    }
    fs.writeFileSync(finalPath, buf);
    console.log(`已保存: ${finalPath}`);
    return finalPath;
  }

  downloadImage(imageUrl, imagePath) {
    return new Promise((resolve, reject) => {
      const lib = imageUrl.startsWith('https:') ? https : http;
      const req = lib.get(imageUrl, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`下载失败 HTTP ${res.statusCode}`)); return; }
        const file = fs.createWriteStream(imagePath);
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(`已下载: ${imagePath}`); resolve(imagePath); });
        file.on('error', (e) => reject(e));
      });
      req.on('error', (e) => reject(e));
      req.setTimeout(this.config.timeout, () => { req.destroy(); reject(new Error('下载超时')); });
    });
  }

  generateFileName(i) {
    const t = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    return `edit_${String(i + 1).padStart(3, '0')}_${t}`;
  }

  saveResult() {
    const safeConfig = { ...this.config, apiKey: '***' };
    const out = {
      sessionName: path.basename(this.sessionDir),
      mode: 'edit',
      config: safeConfig,
      raw: this.rawResponse,
      generatedImages: this.generatedImages,
      taskStatus: this.taskStatus,
      startTime: this.startTime,
      endTime: this.endTime,
    };
    if (out.endTime && out.startTime) out.durationMs = out.endTime - out.startTime;
    out.savedAt = new Date().toISOString();
    const fp = path.join(this.sessionDir, 'edit_result.json');
    fs.writeFileSync(fp, JSON.stringify(out, null, 2));
    console.log(`结果: ${fp}`);
  }

  async editOnce() {
    let response;
    while (true) {
      try {
        response = await this.sendApiRequest();
        break;
      } catch (e) {
        const unknown = this.extractUnknownParameter(e);
        if (unknown && OPTIONAL_REQUEST_FIELDS.has(unknown) && !this.disabledRequestFields.has(unknown)) {
          this.disabledRequestFields.add(unknown);
          console.warn(`接口不支持参数，自动忽略: ${unknown}`);
          continue;
        }
        throw e;
      }
    }

    this.rawResponse = response;
    const data = response && response.data;
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('响应中无 data 或为空');
    }

    for (let i = 0; i < data.length; i += 1) {
      const item = data[i];
      const base = this.generateFileName(i);
      try {
        if (item.b64_json) {
          const p = this.saveB64ToFile(item.b64_json, path.join(this.sessionDir, `${base}.img`));
          this.generatedImages.push({ index: i, filePath: p, source: 'b64_json' });
        } else if (item.url) {
          const ext = path.extname(new URL(item.url).pathname) || '.png';
          const p = path.join(this.sessionDir, `${base}${ext}`);
          await this.downloadImage(item.url, p);
          this.generatedImages.push({ index: i, filePath: p, source: 'url' });
        } else {
          throw new Error('响应条目缺少 b64_json 与 url');
        }
      } catch (e) {
        this.generatedImages.push({ index: i, filePath: null, error: e.message });
      }
    }

    return response;
  }

  async editWithRetry() {
    let last;
    for (let attempt = 1; attempt <= this.config.retryCount; attempt += 1) {
      try {
        if (this.config.retryCount > 1) console.log(`尝试 ${attempt}/${this.config.retryCount}`);
        return await this.editOnce();
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

  async execute() {
    this.startTime = Date.now();
    const refCount = this.config.images.length || this.config.imagesJson.length;
    console.log('gpt-image-2 edits 开始');
    console.log(`model=${this.config.model} n=${this.config.n} size=${this.config.size} refImages=${refCount}${this.config.mask || this.config.maskJson ? ' mask=yes' : ''}`);

    try {
      this.initializeSession();
      this.taskStatus = 'editing';
      await this.editWithRetry();
      this.taskStatus = 'completed';
      this.endTime = Date.now();
      this.saveResult();
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
        try {
          fs.writeFileSync(
            path.join(this.sessionDir, 'edit_failed.json'),
            JSON.stringify({ failed: true, error: e.message, at: new Date().toISOString() }, null, 2),
          );
        } catch (_) {}
      }
      throw e;
    }
  }

  static loadFromConfig(configFile) {
    if (!fs.existsSync(configFile)) {
      throw new Error(`配置不存在: ${configFile}`);
    }
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return new GptImageEditor(raw);
  }
}

module.exports = GptImageEditor;
