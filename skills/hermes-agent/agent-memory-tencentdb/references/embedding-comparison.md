# Embedding Provider Comparison (2026-05-17 更新)

## ⚠️ 关键修正：DeepSeek 官方 API 没有 embedding 端点

> **2026-05-17 实测确认**：DeepSeek 官方 API（api.deepseek.com）只返回两个模型：
> - `deepseek-chat`（即 `deepseek-v4-flash`）
> - `deepseek-pro`（即 `deepseek-v4-pro`）
>
> **完全没有 embedding 端点**。所有 DeepSeek embedding 方案（deepseek-embedding-3、text-embedding-3 等）在 DeepSeek 官方 API 都不存在。
>
> 部分第三方平台（硅基流动、火山引擎等）的 DeepSeek Key 也只有 chat 权限，没有独立 embedding 端点，调用 `/embeddings` 返回 404。

## Embedding 可用方案（2026-05-17 实测）

| Provider | 模型 | 维度 | 免费额度 | 状态 | API 格式 |
|----------|------|------|---------|------|----------|
| **Jina AI** | jina-embeddings-v3 | 1024 | 1000万 tokens/月 | ✅ **已验证可用** | `input: ["text"]` |
| MiniMax | embo-01 | — | 需付费 | ⚠️ 余额不足 | `texts: [...], type: db` |
| DeepSeek | — | — | — | ❌ **无 embedding 端点** | — |

## Jina AI 验证细节

**必需 Header**：Cloudflare 反爬，不带 `User-Agent` 返回 `error code: 1010`。

```bash
curl -X POST https://api.jina.ai/v1/embeddings \
  -H "Authorization: Bearer jina_xxx" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -d '{"model": "jina-embeddings-v3", "input": ["hello"]}'
# ✅ 返回: {"data":[{"embedding": [0.12, -0.13, ...], "index": 0}], "model": "jina-embeddings-v3"}
```

**获取 API Key**：https://jina.ai/api-dashboard/key-manager（注册即送 1000万 tokens）

## LLM vs Embedding 是两套独立服务

TencentDB Agent Memory 中：

| 服务 | 用途 | 配置方式 |
|------|------|---------|
| **LLM** | L1/L2/L3 提取 | 环境变量 `TDAI_LLM_API_KEY` 等 |
| **Embedding** | 向量搜索 | `tdai-gateway.json`（Gateway CWD 目录） |

两者都支持 OpenAI 兼容格式，但需分别配置。

## Gateway 环境变量（已验证）

```
TDAI_LLM_API_KEY        # LLM API key
TDAI_LLM_BASE_URL       # 默认 https://api.openai.com/v1
TDAI_LLM_MODEL          # 默认 gpt-4o
TDAI_LLM_MAX_TOKENS    # 默认 4096
TDAI_LLM_TIMEOUT_MS     # 默认 120000
TDAI_GATEWAY_PORT       # 默认 8420
TDAI_DATA_DIR           # 默认 ~/.memory-tencentdb/memory-tdai
```

## 已验证可用的 LLM 配置（2026-05-17 更新）

```bash
# MiniMax CN（当前使用）✅ 已验证有效
TDAI_LLM_API_KEY="sk-cp-n8..."  # 125字符，sk-cp-n8 开头
TDAI_LLM_BASE_URL="https://api.minimax.chat/v1"  # ⚠️ 不是 api.minimaxi.com
TDAI_LLM_MODEL="MiniMax-M2.7-highspeed"

# AI SDK (@ai-sdk/openai) 自动拼接 /chat/completions
# 实际请求: https://api.minimax.chat/v1/chat/completions ✅
```

> ⚠️ **旧错误配置**：`https://api.minimaxi.com/v1` 返回 404，不要使用。

## Gateway API 快速参考

```bash
# 健康检查
curl http://127.0.0.1:8420/health

# 捕获对话（L0）
curl -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"session_key":"...","session_id":"...","user_content":"...","assistant_content":"..."}'

# 召回记忆（L1）— 需要 session_key
curl -X POST http://127.0.0.1:8420/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"...","session_key":"...","maxResults":3}'

# 健康检查状态标志
# embeddingService: true ✅ / false ❌
# vectorStore: true ✅ / false ❌
# vec0 可用性：查询 l1_vec_info 表，count > 0 则 vec0 正常
```

## 安装中遇到的问题

1. **pnpm not found**：`npm install -g pnpm` 安装
2. **tsx not found**：`npm install tsx --omit=dev` 单独安装
3. **vitest 版本不存在**：`npm install --omit=dev` 跳过 dev 依赖
4. **embeddingService=false**：正常（embedding 需单独配置后才变 true）
5. **DeepSeek embedding 404**：官方 API 没有 embedding 端点，改用 Jina AI
6. **Jina AI 1010 错误**：缺少 `User-Agent` header，Cloudflare 拦截
7. **LLM 提取失败 `login fail: Please carry the API secret key`**：环境变量未正确传入，检查拼写
8. **recall memory_count=0 但 L3 模板正常**：session_key 过滤逻辑与实际存储 key 不匹配，导致查不到 L1 记录，但 LLM 端到端是通的，L1 数据实际已正确提取（5 条记录）
9. **capture Missing required fields**：需要 `user_content` + `assistant_content` 双字段，不能只传 `message_text`

## Embedding 配置路径

> ⚠️ `openclaw.json` 是 OpenClaw 宿主配置文件，Gateway 不读取。
> 配置写入 **`tdai-gateway.json`**（Gateway CWD，即 `~/.memory-tencentdb/tdai-memory-openclaw-plugin/`）

Gateway 读取 `tdai-gateway.json`，搜索路径顺序：
1. `TDAI_GATEWAY_CONFIG` 环境变量（显式路径）
2. `CWD/tdai-gateway.json`（Gateway 启动目录）
3. `<dataDir>/tdai-gateway.json`（`~/.memory-tencentdb/memory-tdai/`）
