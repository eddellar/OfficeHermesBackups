#!/usr/bin/env node

/**
 * 视觉评审工具：读取一张或多张已生成图，结合 brief + 7 维评审 rubric，
 * 通过多模态模型的 Chat Completions 接口输出结构化评审 JSON。
 * 默认模型优先取 runtime/config/env，最后才回退到 gpt-4o。
 *
 * 主要字段：
 *   images          本地图片路径数组（至少 1 张，建议 ≤ 4）
 *   imagesJson      等价的 [{image_url}] / [{file_id}] 形式（二选一）
 *   brief           结构化 brief 文本；也可传对象会被 JSON.stringify
 *   rubric          可选，覆盖默认 rubric 文本
 *   model           评审模型；未传时最终回退到 gpt-4o
 *   outputDir       结果保存根目录
 *   sessionName     会话目录名
 *   baseUrl/apiKey  同 generator
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

require('dotenv').config();

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_REVIEW_MODEL = 'gpt-4o';

const DEFAULT_RUBRIC = `Score each dimension 1-5 with a short diagnostic note. Also call out any P0 issues (garbled/wrong text, cultural offense, anatomy catastrophic, logo misuse, legal risk).

Dimensions & weights:
- visual_hierarchy (20%)
- composition_balance (15%)
- color_harmony (15%)
- typography_text (15%)
- emotional_fit (15%)
- originality (10%)
- functionality (10%)

Overall = weighted sum normalized to 1-5 scale.

Bands:
- >=4.2 deliverable
- 3.6-4.1 deliverable with one iteration on the weakest dimension
- 3.0-3.5 must iterate, do not deliver
- <3.0 or any P0 -> regenerate from a different direction`;

const REVIEW_SCHEMA_HINT = `Return ONLY valid JSON matching this schema (no markdown, no prose outside JSON):
{
  "overall_score": number,
  "band": "deliverable" | "deliverable_with_one_iteration" | "must_iterate" | "regenerate",
  "dimension_scores": {
    "visual_hierarchy": { "score": number, "note": string },
    "composition_balance": { "score": number, "note": string },
    "color_harmony": { "score": number, "note": string },
    "typography_text": { "score": number, "note": string },
    "emotional_fit": { "score": number, "note": string },
    "originality": { "score": number, "note": string },
    "functionality": { "score": number, "note": string }
  },
  "p0_issues": [string],
  "top_strengths": [string],
  "critical_issues": [string],
  "improvement_suggestions": [
    { "issue": string, "prompt_patch": string }
  ]
}`;

function mimeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const mime = mimeFromExt(path.extname(filePath));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function tryExtractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {}
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch (_) {}
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch (_) {}
  }
  return null;
}

class GptImageReviewer {
  constructor(options = {}) {
    this.config = {
      baseUrl: (options.baseUrl || process.env.OPENAI_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || null,
      model: options.model || DEFAULT_REVIEW_MODEL,
      images: Array.isArray(options.images) ? options.images.slice() : [],
      imagesJson: Array.isArray(options.imagesJson) ? options.imagesJson.slice() : [],
      brief: options.brief != null ? (typeof options.brief === 'string' ? options.brief : JSON.stringify(options.brief, null, 2)) : '',
      rubric: options.rubric || DEFAULT_RUBRIC,
      outputDir: options.outputDir || './work_dir/generated_images_gpt_image_2',
      sessionName: options.sessionName || null,
      timeout: options.timeout || 180000,
      retryCount: options.retryCount != null ? options.retryCount : 2,
      retryDelay: options.retryDelay || 2000,
      temperature: options.temperature != null ? options.temperature : 0.2,
      maxTokens: options.maxTokens || 2000,
    };

    this.sessionDir = null;
    this.rawResponse = null;
    this.review = null;
    this.taskStatus = 'pending';
    this.startTime = null;
    this.endTime = null;

    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('必须提供 API 密钥: 在 .env 中设置 OPENAI_API_KEY 或使用 --api-key');
    }
    const hasLocal = this.config.images.length > 0;
    const hasJson = this.config.imagesJson.length > 0;
    if (!hasLocal && !hasJson) {
      throw new Error('必须至少提供一张图：--image <本地路径> 或 --image-url <URL|data URL>');
    }
    for (const p of this.config.images) {
      if (!fs.existsSync(p)) throw new Error(`评审图不存在: ${p}`);
    }
    if (this.config.images.length + this.config.imagesJson.length > 10) {
      throw new Error('一次评审最多 10 张图');
    }
  }

  initializeSession() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const sessionName = this.config.sessionName || `gpt_image2_review_${ts}`;
    this.sessionDir = path.join(this.config.outputDir, sessionName);
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.sessionDir, 'session_info.json'),
      JSON.stringify({
        sessionName,
        sessionDirectory: this.sessionDir,
        mode: 'review',
        model: this.config.model,
        createdAt: new Date().toISOString(),
        status: 'initialized',
      }, null, 2),
    );
    return this.sessionDir;
  }

  _parseBaseUrl(u) {
    const withProto = u.startsWith('http') ? u : `https://${u}`;
    const parsed = new URL(withProto);
    const isHttps = parsed.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;
    let pathname = (parsed.pathname || '/').replace(/\/$/, '');
    if (!/\/chat\/completions$/.test(pathname)) {
      if (!pathname.includes('/v1') && !pathname.endsWith('/v1')) {
        pathname = `${pathname && pathname !== '/' ? pathname : ''}/v1`;
      }
      pathname = `${pathname}/chat/completions`;
    }
    return {
      hostname: parsed.hostname,
      port: parseInt(parsed.port, 10) || defaultPort,
      isHttps,
      path: pathname + (parsed.search || ''),
    };
  }

  buildUserContent() {
    const content = [];
    const header = [
      'You are a senior visual design reviewer. Use the rubric below to critique the attached image(s).',
      '',
      '=== Brief ===',
      this.config.brief ? this.config.brief : '(no brief provided; infer from imagery)',
      '',
      '=== Rubric ===',
      this.config.rubric,
      '',
      '=== Output format ===',
      REVIEW_SCHEMA_HINT,
    ].join('\n');
    content.push({ type: 'text', text: header });

    for (const filePath of this.config.images) {
      content.push({
        type: 'image_url',
        image_url: { url: fileToDataUrl(filePath), detail: 'high' },
      });
    }
    for (const obj of this.config.imagesJson) {
      if (obj.image_url) {
        content.push({ type: 'image_url', image_url: { url: obj.image_url, detail: 'high' } });
      }
    }

    return content;
  }

  buildRequestBody() {
    return {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a senior visual design reviewer. Always answer in strict JSON matching the provided schema. No prose outside JSON.',
        },
        {
          role: 'user',
          content: this.buildUserContent(),
        },
      ],
    };
  }

  sendApiRequest(requestBody) {
    return new Promise((resolve, reject) => {
      const { hostname, port, isHttps, path: reqPath } = this._parseBaseUrl(this.config.baseUrl);
      const postData = Buffer.from(JSON.stringify(requestBody), 'utf8');
      const lib = isHttps ? https : http;

      const options = {
        hostname,
        port,
        path: reqPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Length': postData.length,
        },
        timeout: this.config.timeout,
      };

      const req = lib.request(options, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            // 若响应为不支持 response_format 的错误，回退重试由上层处理
            reject(Object.assign(new Error(`HTTP ${res.statusCode}: ${raw || '(无响应体)'}`), { status: res.statusCode, raw }));
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

  async reviewWithRetry() {
    let useJsonFormat = true;
    let last;
    for (let attempt = 1; attempt <= this.config.retryCount; attempt += 1) {
      try {
        if (this.config.retryCount > 1) {
          console.log(`评审尝试 ${attempt}/${this.config.retryCount}`);
        }
        const body = this.buildRequestBody();
        if (!useJsonFormat) delete body.response_format;
        const response = await this.sendApiRequest(body);
        this.rawResponse = response;
        const text = response && response.choices && response.choices[0]
          && response.choices[0].message && response.choices[0].message.content;
        const parsed = tryExtractJson(text);
        if (!parsed) {
          throw new Error('评审返回内容无法解析为 JSON');
        }
        this.review = parsed;
        return parsed;
      } catch (e) {
        last = e;
        console.error(`失败: ${e.message}`);
        if (useJsonFormat && e && e.raw && /response_format/i.test(e.raw)) {
          useJsonFormat = false;
        }
        if (attempt < this.config.retryCount) {
          await new Promise((r) => setTimeout(r, this.config.retryDelay));
        }
      }
    }
    throw last;
  }

  saveResult() {
    const safeConfig = { ...this.config, apiKey: '***' };
    const out = {
      sessionName: path.basename(this.sessionDir),
      mode: 'review',
      config: safeConfig,
      review: this.review,
      raw: this.rawResponse,
      taskStatus: this.taskStatus,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.endTime && this.startTime ? this.endTime - this.startTime : null,
      savedAt: new Date().toISOString(),
    };
    const fp = path.join(this.sessionDir, 'review_result.json');
    fs.writeFileSync(fp, JSON.stringify(out, null, 2));
    console.log(`结果: ${fp}`);
  }

  async execute() {
    this.startTime = Date.now();
    console.log('gpt-image review 开始');
    console.log(`model=${this.config.model} images=${this.config.images.length + this.config.imagesJson.length}`);
    try {
      this.initializeSession();
      this.taskStatus = 'reviewing';
      await this.reviewWithRetry();
      this.taskStatus = 'completed';
      this.endTime = Date.now();
      this.saveResult();
      if (this.review && this.review.overall_score != null) {
        console.log(`overall_score=${this.review.overall_score} band=${this.review.band || '(n/a)'}`);
      }
      return {
        success: true,
        sessionDir: this.sessionDir,
        review: this.review,
      };
    } catch (e) {
      this.taskStatus = 'failed';
      this.endTime = Date.now();
      if (this.sessionDir) {
        try {
          fs.writeFileSync(
            path.join(this.sessionDir, 'review_failed.json'),
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
    return new GptImageReviewer(raw);
  }
}

module.exports = GptImageReviewer;
module.exports.DEFAULT_RUBRIC = DEFAULT_RUBRIC;
module.exports.REVIEW_SCHEMA_HINT = REVIEW_SCHEMA_HINT;
