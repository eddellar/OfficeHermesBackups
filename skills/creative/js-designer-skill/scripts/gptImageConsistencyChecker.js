#!/usr/bin/env node

/**
 * 一致性检查工具：输入一组已生成图 + 锁定变量清单，
 * 通过多模态模型检测系列间的风格偏差，输出结构化差异报告与修正建议。
 * 默认模型优先取 runtime/config/env，最后才回退到 gpt-4o。
 *
 * 主要字段：
 *   images          本地图片路径数组（至少 2 张，建议 ≤ 8）
 *   imagesJson      等价的 [{image_url|file_id}]
 *   lockedVariables 数组或逗号分隔字符串，可选值：
 *                   palette, lighting, framing, texture, character, typography,
 *                   aspect_ratio, brand_cues
 *   permittedVariance  可选。描述哪些维度可以变（纯文本）
 *   brief           可选的 brief 文本
 *   model           一致性检查模型；未传时最终回退到 gpt-4o
 *   outputDir/sessionName/baseUrl/apiKey 同 reviewer
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

require('dotenv').config();

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

const SUPPORTED_LOCKED_VARS = new Set([
  'palette',
  'lighting',
  'framing',
  'texture',
  'character',
  'typography',
  'aspect_ratio',
  'brand_cues',
]);

const OUTPUT_SCHEMA_HINT = `Return ONLY valid JSON (no markdown, no prose) matching this schema:
{
  "overall_consistency": number,   // 1-5
  "band": "consistent" | "minor_drift" | "major_drift",
  "locked_variables": [string],
  "per_variable_report": [
    {
      "variable": string,
      "score": number,             // 1-5; 5 = fully consistent
      "observation": string,
      "outlier_indices": [number]  // 0-based indices of images that drift
    }
  ],
  "outlier_images": [
    {
      "index": number,             // 0-based index in input order
      "reason": string,
      "fix_suggestion": string,    // concrete prompt patch or edit instruction
      "tool_recommendation": "gpt_image_edit" | "gpt_image_generate"
    }
  ],
  "summary": string
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
  try { return JSON.parse(trimmed); } catch (_) {}
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

function normalizeLockedVars(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/);
  const out = [];
  for (const x of arr) {
    const k = String(x || '').trim().toLowerCase();
    if (!k) continue;
    if (!SUPPORTED_LOCKED_VARS.has(k)) {
      throw new Error(`未知的锁定变量: ${k}。可选: ${Array.from(SUPPORTED_LOCKED_VARS).join(', ')}`);
    }
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

class GptImageConsistencyChecker {
  constructor(options = {}) {
    this.config = {
      baseUrl: (options.baseUrl || process.env.OPENAI_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || null,
      model: options.model || DEFAULT_MODEL,
      images: Array.isArray(options.images) ? options.images.slice() : [],
      imagesJson: Array.isArray(options.imagesJson) ? options.imagesJson.slice() : [],
      lockedVariables: normalizeLockedVars(options.lockedVariables || options.locked),
      permittedVariance: options.permittedVariance || options.permitted || '',
      brief: options.brief != null
        ? (typeof options.brief === 'string' ? options.brief : JSON.stringify(options.brief, null, 2))
        : '',
      outputDir: options.outputDir || './work_dir/generated_images_gpt_image_2',
      sessionName: options.sessionName || null,
      timeout: options.timeout || 180000,
      retryCount: options.retryCount != null ? options.retryCount : 2,
      retryDelay: options.retryDelay || 2000,
      temperature: options.temperature != null ? options.temperature : 0.2,
      maxTokens: options.maxTokens || 2500,
    };

    this.sessionDir = null;
    this.rawResponse = null;
    this.report = null;
    this.taskStatus = 'pending';
    this.startTime = null;
    this.endTime = null;

    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('必须提供 API 密钥: 在 .env 中设置 OPENAI_API_KEY 或使用 --api-key');
    }
    const total = this.config.images.length + this.config.imagesJson.length;
    if (total < 2) {
      throw new Error('至少需要 2 张图才能做一致性检查');
    }
    if (total > 8) {
      throw new Error('一次最多 8 张图');
    }
    for (const p of this.config.images) {
      if (!fs.existsSync(p)) throw new Error(`图片不存在: ${p}`);
    }
    if (this.config.lockedVariables.length === 0) {
      console.warn('未指定 --locked，将检测常见 5 维默认值 (palette,lighting,framing,texture,typography)');
      this.config.lockedVariables = ['palette', 'lighting', 'framing', 'texture', 'typography'];
    }
  }

  initializeSession() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const sessionName = this.config.sessionName || `gpt_image2_consistency_${ts}`;
    this.sessionDir = path.join(this.config.outputDir, sessionName);
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.sessionDir, 'session_info.json'),
      JSON.stringify({
        sessionName,
        sessionDirectory: this.sessionDir,
        mode: 'consistency',
        model: this.config.model,
        lockedVariables: this.config.lockedVariables,
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
    const indexList = [];
    this.config.images.forEach((p, i) => indexList.push(`${i}: local ${path.basename(p)}`));
    this.config.imagesJson.forEach((obj, i) => {
      const idx = this.config.images.length + i;
      indexList.push(`${idx}: ${obj.image_url || obj.file_id || '<remote>'}`);
    });

    const header = [
      'You are a senior visual design reviewer evaluating consistency across a series of images that should belong to one visual system.',
      '',
      '=== Brief ===',
      this.config.brief ? this.config.brief : '(no brief provided; infer from imagery)',
      '',
      '=== Locked variables (must stay the same across the series) ===',
      this.config.lockedVariables.join(', '),
      '',
      '=== Permitted variance (ok to differ) ===',
      this.config.permittedVariance || '(not specified)',
      '',
      '=== Image index map (0-based, same order as attachments below) ===',
      indexList.join('\n'),
      '',
      '=== Output format ===',
      OUTPUT_SCHEMA_HINT,
      '',
      'Scoring rule: 5 = fully consistent on that variable; 3 = noticeable drift on one image; 1 = each image different.',
      'band: consistent (overall >=4.2), minor_drift (3.5-4.1), major_drift (<3.5).',
      'For any outlier_image, always provide a concrete fix_suggestion that can be fed into a follow-up prompt patch.',
    ].join('\n');

    content.push({ type: 'text', text: header });

    for (const filePath of this.config.images) {
      content.push({ type: 'image_url', image_url: { url: fileToDataUrl(filePath), detail: 'high' } });
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
          content: 'You are a senior visual design reviewer specialized in series consistency. Always answer in strict JSON matching the provided schema. No prose outside JSON.',
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

  async runWithRetry() {
    let useJsonFormat = true;
    let last;
    for (let attempt = 1; attempt <= this.config.retryCount; attempt += 1) {
      try {
        if (this.config.retryCount > 1) {
          console.log(`一致性检查尝试 ${attempt}/${this.config.retryCount}`);
        }
        const body = this.buildRequestBody();
        if (!useJsonFormat) delete body.response_format;
        const response = await this.sendApiRequest(body);
        this.rawResponse = response;
        const text = response && response.choices && response.choices[0]
          && response.choices[0].message && response.choices[0].message.content;
        const parsed = tryExtractJson(text);
        if (!parsed) throw new Error('一致性检查返回内容无法解析为 JSON');
        this.report = parsed;
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
      mode: 'consistency',
      config: safeConfig,
      report: this.report,
      raw: this.rawResponse,
      taskStatus: this.taskStatus,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.endTime && this.startTime ? this.endTime - this.startTime : null,
      savedAt: new Date().toISOString(),
    };
    const fp = path.join(this.sessionDir, 'consistency_result.json');
    fs.writeFileSync(fp, JSON.stringify(out, null, 2));
    console.log(`结果: ${fp}`);
  }

  async execute() {
    this.startTime = Date.now();
    const total = this.config.images.length + this.config.imagesJson.length;
    console.log('gpt-image consistency 开始');
    console.log(`model=${this.config.model} images=${total} locked=${this.config.lockedVariables.join(',')}`);

    try {
      this.initializeSession();
      this.taskStatus = 'checking';
      await this.runWithRetry();
      this.taskStatus = 'completed';
      this.endTime = Date.now();
      this.saveResult();
      if (this.report) {
        console.log(`overall_consistency=${this.report.overall_consistency ?? 'n/a'} band=${this.report.band || 'n/a'}`);
      }
      return {
        success: true,
        sessionDir: this.sessionDir,
        report: this.report,
      };
    } catch (e) {
      this.taskStatus = 'failed';
      this.endTime = Date.now();
      if (this.sessionDir) {
        try {
          fs.writeFileSync(
            path.join(this.sessionDir, 'consistency_failed.json'),
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
    return new GptImageConsistencyChecker(raw);
  }
}

module.exports = GptImageConsistencyChecker;
module.exports.SUPPORTED_LOCKED_VARS = SUPPORTED_LOCKED_VARS;
module.exports.OUTPUT_SCHEMA_HINT = OUTPUT_SCHEMA_HINT;
