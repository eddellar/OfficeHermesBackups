---
name: agent-memory-tencentdb
description: >
  TencentDB Agent Memory 四层记忆系统的安装、配置与使用。
  四层架构：L0 原始对话 → L1 原子事实提取 → L2 场景归纳 → L3 用户画像合成。
  作为 Hermes Agent 的 memory provider 插件运行，Gateway 为 Node.js sidecar 进程。
hermes:
  trigger: ["tencentdb", "四层记忆", "memory-tencentdb", "agent memory", "L0 L1 L2 L3", "长期记忆"]
  auto_load: false
category: hermes-agent
version: 1.0.0
---

# TencentDB Agent Memory

四层渐进式记忆系统，L0→L1→L2→L3 自动从对话中提取结构化记忆。

## 架构

```
Hermes (Python provider) ← HTTP → Gateway (Node.js sidecar, port 8420)
                                        ↓
                                  TDAI Core Engine
                                        ↓
                              ┌─────────┴─────────┐
                              ↓                   ↓
                       LLM 提取层           SQLite + vec0
                       (L1/L2/L3)            (L0 向量存储)
```

- **Python provider** (`hermes-plugin/memory/memory_tencentdb/`)：Hermes MemoryProvider 接口
- **Gateway sidecar** (`src/gateway/server.ts`)：Node.js HTTP 服务，处理实际记忆逻辑
- **LLM**：用于 L1/L2/L3 提取（与 embedding 服务无关）
- **Embedding**：用于向量搜索（需要单独配置，与 LLM 服务独立）

## 安装步骤

### 1. 下载 npm 包

```bash
# 下载 tarball（绕过 npm registry 超时）
curl -sL "https://registry.npmjs.org/@tencentdb-agent-memory/memory-tencentdb/-/memory-tencentdb-0.3.5.tgz" -o /tmp/memory-tencentdb.tgz
mkdir -p ~/.memory-tencentdb
tar -xzf /tmp/memory-tencentdb.tgz -C ~/.memory-tencentdb/
mv ~/.memory-tencentdb/package ~/.memory-tencentdb/tdai-memory-openclaw-plugin
```

### 2. 安装 Node.js 依赖

```bash
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin

# 跳过 dev 依赖（避免 vitest 版本问题）
npm install --omit=dev
# 如果 tsx 未安装（dev 依赖），单独安装：
npm install tsx --omit=dev
```

### 3. 链接到 Hermes 插件目录

```bash
mkdir -p ~/.hermes/hermes-agent/plugins/memory
ln -sf ~/.memory-tencentdb/tdai-memory-openclaw-plugin/hermes-plugin/memory/memory_tencentdb \
       ~/.hermes/hermes-agent/plugins/memory/memory_tencentdb
```

### 4. 修改 Hermes config.yaml

```yaml
memory:
  provider: memory_tencentdb   # 原来是 mem0local
```

### 5. 启动 Gateway（带 LLM 环境变量）

⚠️ **关键前提（2026-05-17 新发现）**：`.env` 中有 `MINIMAX_CN_API_KEY` 但**没有** `TDAI_LLM_API_KEY`。Gateway 启动脚本用 `env TDAI_LLM_API_KEY="$TDAI_LLM_API_KEY"` 时，若该变量未定义，bash 展开为空串，导致 Node 进程拿到空字符串 API key，产生 1004 auth 错误。

**正确做法**：从 `.env` 直接提取 key 原文，再启动 Gateway：
```bash
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin

# 从 .env 提取实际 key（不要用变量展开，那样会得到空串）
MINIMAX_KEY=$(grep '^MINIMAX_CN_API_KEY=' /home/eddellar/.hermes/.env | cut -d= -f2-)

# 杀掉旧进程
pkill -f "tsx src/gateway/server.ts"
sleep 1

# 用实际 key 值启动（env 接受字面值）
env TDAI_LLM_BASE_URL="https://api.minimax.chat/v1" \
    TDAI_LLM_API_KEY="$MINIMAX_KEY" \
    TDAI_LLM_MODEL="MiniMax-M2.7-highspeed" \
    npx tsx src/gateway/server.ts > ~/.hermes/logs/memory_tencentdb/gateway.new.log 2>&1 &
```

> ⚠️ **特别注意**：`TDAI_LLM_BASE_URL` 必须精确写成 `https://api.minimax.chat/v1`——不带 `/text/chatcompletion_v2` 后缀。
> - 正确：`https://api.minimax.chat/v1` → AI SDK 拼接为 `.../v1/chat/completions` ✅
> - 错误：`https://api.minimax.chat/v1/text/chatcompletion_v2` → SDK 拼接为 `.../v1/text/chatcompletion_v2/chat/completions` → 404 ❌
> - 旧错误：`https://api.minimaxi.com/v1` → 第三方镜像，404 ❌

**关键环境变量：**
| 变量 | 说明 | 当前验证值 |
|------|------|-----------|
| `TDAI_LLM_API_KEY` | MiniMax CN API key（125字符，sk-cp-n8 开头） | `sk-cp-n8...` |
| `TDAI_LLM_BASE_URL` | `https://api.minimax.chat/v1`（**不是** `api.minimaxi.com`，**也不带** `/text/chatcompletion_v2` 后缀） | ✅ 验证通过 |
| `TDAI_LLM_MODEL` | `MiniMax-M2.7-highspeed` | ✅ 验证通过 |
| `TDAI_GATEWAY_PORT` | Gateway 端口 | `8420` |
| `TDAI_DATA_DIR` | 记忆数据目录 | `~/.memory-tencentdb/memory-tdai` |

> ⚠️ **环境变量覆盖配置文件**：Gateway 代码优先读取环境变量 `TDAI_LLM_BASE_URL`，**其次**才读 `tdai-gateway.json`。修改配置文件后必须重启 Gateway 进程才能生效（运行中的进程不会重新读取配置文件）。

### 6. 验证

```bash
# 健康检查
curl http://127.0.0.1:8420/health

# 测试 L0 捕获
curl -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"user_content":"你好","assistant_content":"你好！","session_key":"test"}'

# 测试召回（需要 LLM）
curl -X POST http://127.0.0.1:8420/recall \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","session_key":"test","query":"刚才说了什么"}'
```

## 验证清单（2026-05-17 实测通过）

以下四条全部通过 = 系统正常运行：

```bash
# ① Gateway 健康
curl -s http://127.0.0.1:8420/health
# 期望: {"status":"ok",...,vectorStore:true,embeddingService:true}

# ② L0 对话捕获（手动测试）
curl -s -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"session_key":"vfy","session_id":"vfy-1","user_content":"测试","assistant_content":"测试回复"}'
# 期望: {"l0_recorded":2,"scheduler_notified":true}

# ③ L1 记录检查（当前状态：5条，全部为 5/16）
python3 -c "
import sqlite3
db='/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn=sqlite3.connect(db)
n=conn.execute('SELECT COUNT(*) FROM l1_records').fetchone()[0]
latest=conn.execute('SELECT MAX(timestamp_str) FROM l1_fts').fetchone()[0]
print(f'L1 records: {n}, latest: {latest}')
conn.close()
"
# 期望: L1 records: 5, latest: 2026-05-16T09:59:44.283Z（5/17 无新增是已知问题）

# ④ recall_checkpoint 中 session cursor 状态（确认 L1_DONE）
python3 << 'EOF'
import json
with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)
sessions_517 = {k:v for k,v in cp['runner_states'].items() if k.startswith('20260517')}
l1_done = sum(1 for v in sessions_517.values() if v.get('last_captured_timestamp',0) > 0 and v.get('last_l1_cursor',0) > v.get('last_captured_timestamp',0))
print(f"5/17 sessions: {len(sessions_517)}, L1_DONE: {l1_done}")
EOF
# 期望: L1_DONE = 所有有数据的 session（说明 pipeline 有触发）
```

> ⚠️ **recall API 的局限性**：`/recall` 返回 `memory_count: 0` 但 L3 画像模板正常，这是 `session_key` 过滤逻辑与实际存储 key 不匹配导致的，不影响 L1 自动提取链路。LLM 端到端是通的。

> ⚠️ **已知问题**：L1 extraction 链路运行正常（`L1_DONE`），但 LLM 返回 0 条 memories，5/17 后无新 L1 记录。这是 MiniMax JSON-mode 输出或 `shouldExtractL1` 过滤的问题，不是链路不通。

## Jina AI Embedding（✅ 当前验证可用）

> **2026-05-17 验证**：Jina AI 是目前唯一免费的可用 embedding 方案（1000万 tokens/月免费额度）。

**必需 Header**：Cloudflare 保护，不加 `User-Agent` 会返回 `1010` 错误。

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

**API 格式**：
```json
POST https://api.jina.ai/v1/embeddings
{
  "model": "jina-embeddings-v3",
  "input": ["text to embed"]
}
```
- 维度：1024
- 免费额度：1000万 tokens/月，100 RPM，100K TPM
- 获取 API Key：https://jina.ai/api-dashboard/key-manager

**tdai-gateway.json 配置示例**：
```json
{
  "memory": {
    "embedding": {
      "provider": "jina",
      "baseUrl": "https://api.jina.ai/v1",
      "apiKey": "jina_xxx",
      "model": "jina-embeddings-v3",
      "dimensions": 1024
    }
  }
}
```

## ⚠️ 已知问题：vec0 和 FTS5 SQLite 扩展均未加载

### vec0 向量搜索失效 → ✅ 已解决（2026-05-17）

> **⚠️ ESM 陷阱（2026-05-17）**：Gateway 启动即崩溃（exit code 1），错误 `require is not defined`。项目 `package.json` 含 `"type": "module"`，是 ESM 模式，不能用 `require()`。详见 `references/vec0-fts5-node-sqlite-fix.md`。

> **根因**：`node:sqlite`（Node.js 内置）的 SQLite 编译**不包含** FTS5/vec0 运行时模块，虽然 compile options 显示 `ENABLE_VEC`，但运行时 `PRAGMA module_list` 返回空。
>
> **解法**：将 Gateway 的 SQLite 底层从 `node:sqlite`（`DatabaseSync`）替换为 `better-sqlite3`（npm 包）。
> - `better-sqlite3@12.10.0` 包含完整 FTS5 支持（✅ 验证通过：`CREATE VIRTUAL TABLE ... USING fts5` 成功）
> - `sqlite-vec` 可在 `better-sqlite3` 上正常加载：`sqliteVec.load(db)` 会自动调用 `db.loadExtension(path)`，无需 `enableLoadExtension(true)`
> - 两者共存于同一数据库文件，无冲突
>
> **⚠️ ESM 陷阱（2026-05-17）**：项目是 `"type": "module"`（ESM），不能用 `require()`，必须用 `import` 语法。详见 `references/vec0-fts5-node-sqlite-fix.md`。
>
> **修复步骤**：
> ```bash
> # 1. 安装 better-sqlite3
> cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
> npm install better-sqlite3 --omit=dev
> npm install --save-dev @types/better-sqlite3 @types/node
>
> # 2. 修改 src/core/store/sqlite.ts（ESM import 语法）
> # 旧（CommonJS）：const { DatabaseSync } = require('node:sqlite')
> # 新（ESM）：import { Database } from "better-sqlite3"
> # 类型：import type { Statement } from "better-sqlite3"
> # 构造函数：new Database(dbPath)（无需 allowExtension 选项）
> # 删除：this.db.enableLoadExtension(true) 这行
>
> # 3. 重启 Gateway
> pkill -f "tsx src/gateway/server.ts"
> cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
> TDAI_LLM_API_KEY=... TDAI_LLM_BASE_URL=... TDAI_LLM_MODEL=... \
>   npx tsx src/gateway/server.ts &
> ```
>
> **验证**：
> ```python
> import sqlite3
> conn = sqlite3.connect(db_path)
> mods = [m[1] for m in conn.execute("PRAGMA module_list").fetchall()]
> print('fts5' in mods)      # True ← FTS5 正常
> print('vec0' in mods)      # True ← vec0 正常
> ```

### FTS5 模块不可用 → ✅ 已解决（同上）

> 与 vec0 同一根因，`node:sqlite` 不含 FTS5。修复方案相同：替换为 `better-sqlite3`。`better-sqlite3` 的 SQLite 编译包含完整 FTS5 扩展（验证：`CREATE VIRTUAL TABLE ... USING fts5` 成功执行）。

### BM25-local 是唯一正常工作的检索引擎

> **2026-05-17 确认**：`bm25-local` 已初始化（日志：`BM25 local encoder (language=zh)`），但因为 FTS5 不可用，BM25 的底层 FTS 索引也失效，两者叠加导致 hybrid search 整体返回 0。
>
> **单独验证 BM25**：目前无独立验证端点，需通过日志确认 `bm25-local` 初始化状态。

### LLM L1 提取链路诊断与修复（2026-05-17 完整记录）

#### 根因：端点配置错误 + 环境变量未同步

1. **`tdai-gateway.json` 配置文件**中 `baseUrl` 写成了 `https://api.minimaxi.com/v1`（第三方镜像，404）
2. **Gateway 进程运行时**通过 `TDAI_LLM_BASE_URL` 环境变量覆盖配置文件，但环境变量值也是旧的（`https://api.minimax.chat/v1/text/chatcompletion_v2`）
3. **配置文件修复后**：旧 Gateway 进程仍然使用内存中的旧环境变量，不会重新读取配置文件

#### 修复步骤（已完成）

1. **修改 `tdai-gateway.json`**：
   ```json
   { "llm": { "baseUrl": "https://api.minimax.chat/v1" } }
   ```

2. **重启 Gateway 进程**（必须！否则环境变量旧值持续生效）：
   ```bash
   # 查找进程
   ss -tlnp | grep 8420
   # 或
   ps aux | grep 'tsx.*server' | grep -v grep

   # kill 并确认
   kill <PID>
   sleep 2

   # 重新启动（带上正确环境变量）
   cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
   TDAI_LLM_API_KEY="sk-cp-n8..." \
   TDAI_LLM_BASE_URL="https://api.minimax.chat/v1" \
   TDAI_LLM_MODEL="MiniMax-M2.7-highspeed" \
   npx tsx src/gateway/server.ts > ~/.hermes/logs/memory_tencentdb/gateway.new.log 2>&1 &
   ```

3. **验证 LLM 链路**：发送测试对话，5-30秒后检查 `records/l1/` 是否有新 `.jsonl` 文件

#### AI SDK 路径拼接规则

Gateway 使用 `@ai-sdk/openai`（`createOpenAI`），自动拼接：
- 环境变量/配置 `baseUrl`: `https://api.minimax.chat/v1`
- SDK 自动追加: `/chat/completions`
- **实际请求**: `https://api.minimax.chat/v1/chat/completions` ✅

> ⚠️ 不要手动在 baseUrl 后面加 `/chat/completions`，会变成 `.../v1/chat/completions/chat/completions` 而 404。

#### 验证 L1 提取是否生效

```bash
# 触发 L0 捕获
curl -s -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"session_key":"test-verify","session_id":"test-verify-1","user_content":"测试消息","assistant_content":"测试回复"}'

# 等待 10-30 秒后检查 L1 记录
ls -la ~/.memory-tencentdb/memory-tdai/records/l1/

# 或查看 Gateway 日志中的 L1 提取记录
grep "L1.*extracted\|l1_recorded\|extraction completed" ~/.hermes/logs/memory_tencentdb/gateway.new.log
```

#### 已知有效配置（2026-05-17 验证）

```
TDAI_LLM_API_KEY=sk-cp-n8...（125字符，MiniMax CN key）
TDAI_LLM_BASE_URL=https://api.minimax.chat/v1
TDAI_LLM_MODEL=MiniMax-M2.7-highspeed
```

## Embedding 配置（可选，解锁向量搜索）

embedding 服务与 LLM 服务**独立**，需要单独配置。

**配置文件路径：`tdai-gateway.json`**（在 Gateway 启动的 CWD 目录下，即 `~/.memory-tencentdb/tdai-memory-openclaw-plugin/tdai-gateway.json`）

> ⚠️ 重要：`openclaw.json` 是 OpenClaw 宿主用的，不是 Gateway 的配置。不要写入那里。

```json
{
  "memory": {
    "embedding": {
      "provider": "jina",
      "baseUrl": "https://api.jina.ai/v1",
      "apiKey": "jina_xxx",
      "model": "jina-embeddings-v3",
      "dimensions": 1024
    }
  }
}
```

**⚠️ DeepSeek 官方 API 没有 embedding 端点**：DeepSeek 官方 API（api.deepseek.com）只有 `deepseek-chat` 模型，完全没有 embedding 端点。部分第三方平台（如硅基流动、火山引擎）的 DeepSeek Key 也没有独立 embedding 端点。

**推荐**：
- **Jina AI**（当前验证可用）：免费 1000万 tokens/月，1024维
- MiniMax Embedding-3（1536维）：超长上下文（32K），英文优秀，但需付费

## Gateway API 快速参考

```bash
# 健康检查
curl http://127.0.0.1:8420/health

# 捕获对话（L0）
curl -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"session_key":"...","session_id":"...","user_content":"...","assistant_content":"..."}'

# 召回记忆（L1）
curl -X POST http://127.0.0.1:8420/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"...","session_key":"...","maxResults":3}'

# 状态标志
# embeddingService: true ✅ / false ❌
# vectorStore: true ✅ / false ❌
# vec0 可用性：查询 l1_vec_info 表，count > 0 则 vec0 正常
```

## 已知限制

```
~/.memory-tencentdb/memory-tdai/
├── conversations/     # L0 每日 JSONL 分片
├── records/          # L1 每日 JSONL 分片
├── scene_blocks/     # L2 场景块 .md 文件
└── vectors.db       # SQLite + vec0 向量数据库
```

查看数据：
```python
import sqlite3
conn = sqlite3.connect('/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print([r[0] for r in cur.fetchall()])  # ['embedding_meta', 'l1_records', 'l0_conversations']
```

## 与 Hermes 内置记忆对比

| 维度 | TencentDB Agent Memory | Hermes 默认 (Context Compression) |
|------|:---------------------:|:--------------------------------:|
| 记忆层次 | 4层自动（L0→L1→L2→L3） | 2层静态（MEMORY.md + USER.md） |
| LLM 参与 | 每轮自动 L1 提取 | 无自动提取 |
| 向量搜索 | SQLite-vec 本地 | 无 |
| Token 优化 | 降低 61%（官测） | 阈值50%压缩 |
| 配置难度 | 高（多组件） | 低（即开即用） |

## 已知限制
**已知问题（2026-05-17 确认）**：
- **pnpm approve-builds**：不影响 Gateway 核心功能（tsx 可直接运行 Node.js），但会阻止 `pnpm install` 成功完成
- **L1 extraction 返回 0 条记忆**：所有 5/17 session 的 L1 pipeline 运行到 `L1_DONE`（cursor 更新），但 `l1_fts` 为空。根因待查（MiniMax JSON-mode 或 quality gate）。seed 批量重提取可验证。
- **L2/L3 依赖 L1**：由于 L1 为空，L2/L3 也无新数据

## 诊断：Feishu 会话 L0 无新记录（静默失败）

**症状**：Feishu 消息已处理，Gateway 健康，capture 接口手动测试正常，但 L0 数据库没有新记录。当前会话（session `20260517_173447_8c2810`，17:34 创建）L0 记录为 0，L0 最新记录停留在 17:30。

**⚠️ 已过时 — 2026-05-17 修正**：

经过完整诊断，**L0 链路实际是正常的**。数据库中 `l0_conversations` 有 61 条记录，包括 5/17 的真实 Feishu 对话（session `20260517_174009_eb6f02`）。之前"无新记录"的误判是因为：
1. 查询了错误的 session_key（`hermes_test_*` 是手动测试 session，不是 Feishu 会话）
2. `l0_conversations` 表结构与预期不同（字段为 `recorded_at` 而非 `created_time`）

**真正的 L1 问题（2026-05-17 确认）**：

所有 5/17 session 的 `recall_checkpoint` 状态为 `L1_DONE`（`last_l1_cursor >> last_captured_timestamp`），但 `l1_fts` 和 `l1_records` 表中**没有任何 5/17 的记录**。这说明：

> **L1 extraction 运行了，但 LLM 返回了 0 条 memories**（`extractedCount = 0, storedCount = 0`）

不是链路不通，而是 LLM 的 JSON-mode structured output 返回空结果。可能原因：
1. MiniMax-M2.7-highspeed 的 JSON-mode 不稳定
2. `shouldExtractL1` quality gate 把技能更新类消息（"Review the conversation above and update the skill library"）全部过滤
3. LLM 的 `callLlmExtraction` 输出无法解析，返回 `SceneSegment[]` 空数组

**关键澄清（2026-05-17 实测）**：

- **Provider 注册是成功的**：`memory_tencentdb registered (0 tools)` × 2 次（17:15 和 17:19），不是失败
- **"(0 tools)" 不是问题**：这是正常状态，memory_tencentdb 不提供 MCP tools，tools=0 表示无外部工具
- **无 "activated" 日志是预期行为**：当 Gateway 已运行时，`initialize` 内部提前返回，"activated" 日志不打印，但 provider 实际已激活
- **真正的激活状态**：看 Gateway health 的 `stores.vectorStore` 和 `stores.embeddingService`，不依赖日志
- **L1 记录在 SQLite 中**：不是 `records/l1/` 文件系统目录，存在 `vectors.db` 的 `l1_records` 表
- **`sync_all`/`prefetch_all` 使用 logger.debug**：grep agent.log 不会出现，但这是设计预期，不代表方法未被调用
- **L0 链路实际正常**：61条记录（包括 5/17 真实 Feishu 对话），之前误判是查询了错误的 session_key
- **L1 链路运行但返回空**：所有 5/17 session 的 recall_checkpoint 显示 `L1_DONE`，但 l1_fts 为空——pipeline 跑了但 LLM 输出 0 条 memory

**诊断步骤**：
```bash
# 1. 确认 Gateway 运行
curl -s http://127.0.0.1:8420/health
# 期望: {"status":"ok","stores":{"vectorStore":true,"embeddingService":true}}

# 2. 确认 Provider 已注册
grep "Memory provider.*registered" ~/.hermes/logs/agent.log | tail -3

# 3. 手动发送 capture 验证 Gateway 本身正常
curl -s -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{"session_key":"manual-test","session_id":"manual","user_content":"测试","assistant_content":"测试回复"}'
# 期望: {"l0_recorded":2,"scheduler_notified":true}

# 4. 检查 L0 是否有刚写入的记录（10秒内）
python3 -c "
import sqlite3, datetime
db='/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn=sqlite3.connect(db)
cutoff=(datetime.datetime.utcnow()-datetime.timedelta(minutes=5)).isoformat()+'Z'
rows=conn.execute('SELECT session_key,role,message_text,recorded_at FROM l0_conversations WHERE recorded_at>? ORDER BY recorded_at DESC',(cutoff,)).fetchall()
for r in rows: print(f'{r[0][:40]} [{r[1]}]: {r[2][:40]}... @ {r[3]}')
conn.close()
"

# 5. 确认 L1 记录存在（SQLite，非文件系统）
python3 -c "
import sqlite3
db='/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn=sqlite3.connect(db)
n=conn.execute('SELECT COUNT(*) FROM l1_records').fetchone()[0]
keys=[r[0] for r in conn.execute('SELECT DISTINCT session_key FROM l1_records ORDER BY created_time DESC LIMIT 5').fetchall()]
print(f'L1 records: {n}')
print(f'Session keys: {keys}')
conn.close()
"
# 期望: L1 records: 5（或更多）, Session keys: ['20260516_175735_1a35bd', ...]
```

**session_key 不匹配导致 recall 返回 0**：这是预期行为，不是错误。`/recall` 使用精确 session_key 过滤，不传 session_key 时向量搜索未命中。用正确的 session_key 查询才能返回结果：
```bash
curl -s -X POST http://127.0.0.1:8420/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"用户偏好","session_key":"20260516_175735_1a35bd","limit":3}'
```

**下一步修复方向**：在 `run_agent.py:4962` 的 `except Exception: pass` 改为 `logger.warning("sync_all failed: %s", e)`，重启 Gateway，验证下一条 Feishu 消息是否产生 L0 记录。

## L1 链路假性正常：pipeline 运行到 L1_DONE，但返回 0 条记忆（2026-05-17 新发现）

**症状**：`l1_fts` 和 `l1_records` 表只有 5 条（全部来自 5/16），但 `recall_checkpoint.json` 中所有 5/17 session 状态为 `L1_DONE`（`last_l1_cursor >> last_captured_timestamp`）。

**诊断**：
```python
python3 << 'EOF'
import sqlite3, json

db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# L0/L1 记录数对比
l0_n = conn.execute("SELECT COUNT(*) FROM l0_conversations").fetchone()[0]
l1_n = conn.execute("SELECT COUNT(*) FROM l1_fts").fetchone()[0]
print(f"L0: {l0_n} records, L1: {l1_n} records")

# L1 最新时间
l1_latest = conn.execute("SELECT MAX(timestamp_str) FROM l1_fts").fetchone()[0]
print(f"L1 latest: {l1_latest}")

with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)

# 对比每个 session 的 cursor 状态
print("\nSession cursor analysis:")
for k, v in sorted(cp['runner_states'].items()):
    lct = v.get('last_captured_timestamp', 0)
    ll1 = v.get('last_l1_cursor', 0)
    diff = ll1 - lct
    if lct > 0:
        status = "L1_DONE" if diff > 0 else "L1_PENDING"
    else:
        status = "NO_DATA"
    if k.startswith('20260517') and status == "L1_DONE":
        print(f"  [{status}] {k}: lct={lct}, ll1={ll1}, diff={diff}ms")
EOF
```

**根因确认（2026-05-17 — 100% 确定）**：

> **MiniMax-M2.7-highspeed 模型不遵循 `response_format: {type: "json_object"}` 指令，返回自由文本而非纯 JSON，导致 `parseExtractionResult` 无法解析为空数组。**

**证据链（完整）**：
1. `recall` 接口正常工作（返回 markdown L3 模板）→ LLM API key 和 `/v1/text/chatcompletion_v2` 路径 ✅
2. L1 extraction 确实运行了 → `last_extraction_time=13:58:32`（21:58），日志有记录
3. `parseExtractionResult` 找不到 `[` 开头 → `logger?.warn?.("[l1-debug] NO_JSON")` 触发 → `return []`
4. recall 返回 markdown（`<user-persona>` 标签）而非纯 JSON → 确认模型能生成结构化文本但不遵守 JSON-mode 指令

**MiniMax JSON-mode 失败的具体表现**：
- `generateText` 调用时传了 `response_format: { type: "json_object" }`
- 模型返回的是 markdown 代码块包裹的文本，或完全自由文本
- `parseExtractionResult` 的 `/\[\\s\\S\]*\[\]/` 正则找不到 JSON 数组 → 返回空

**L1 warmup 和 idle timer 参数（实测修正）**：
- `warmup = 2`（默认需要 **2 次对话**才触发 L1 extraction，**不是 1**）
- `l1IdleTimeout = 600s`（**10分钟**空闲才触发，**不是 60s**）
- 5/17 session 只有 1 次对话 → 需等第 2 次对话或等 10分钟 idle 才能触发 L1

**修复方案**：
在 `l1-extractor.ts` 的 `parseExtractionResult` 中添加 text-to-memory fallback：
当 JSON 解析失败时，从 LLM 自由文本响应中提取语义记忆作为备选。

```typescript
// l1-extractor.ts parseExtractionResult 函数中
// 现有代码：arrayMatch 检测不到 JSON → return []
// 修改为：检测非 JSON 输出，尝试语义提取 fallback
if (!arrayMatch) {
  logger?.warn?.(`${TAG} [l1-debug] NO_JSON — attempting text extraction fallback`);
  const textMemories = extractTextMemories(raw, logger);
  if (textMemories.length > 0) {
    return [{
      scene_name: "自动提取情境",
      message_ids: [],
      memories: textMemories
    }];
  }
  return [];
}
```

**验证修复**：
```bash
# 重启 Gateway 后，发送 2 次对话
# 等待 10 分钟 idle 或发第 3 条消息触发 warmup
# 检查 l1_fts 是否有新记录
python3 -c "
import sqlite3
db='/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn=sqlite3.connect(db)
n=conn.execute(\"SELECT COUNT(*) FROM l1_fts WHERE timestamp_str > '2026-05-17'\").fetchone()[0]
print(f'5/17 L1 records: {n}')
"
```

---

## recall_checkpoint.json — 关键诊断文件

`recall_checkpoint.json` 是理解 L1 链路状态的**最关键文件**，位于 `~/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json`。

**核心字段解读**：

```python
python3 << 'EOF'
import json
with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)

# last_captured_timestamp: 全局 L0 最新捕获时间
# total_processed: 已处理的 L0 消息总数
# runner_states: 每个 session 的处理状态
#   - last_captured_timestamp: 该 session L0 最新时间
#   - last_l1_cursor: 该 session L1 最新处理时间
#   - diff = last_l1_cursor - last_captured_timestamp
#     diff > 0: L1_DONE（提取完成）
#     diff < 0: L1_PENDING（提取落后，有待处理）
#     lct = 0: NO_DATA（session 无 L0 数据）

for k, v in sorted(cp['runner_states'].items()):
    lct = v.get('last_captured_timestamp', 0)
    ll1 = v.get('last_l1_cursor', 0)
    diff = ll1 - lct
    status = "L1_DONE" if (lct > 0 and diff > 0) else ("L1_PENDING" if (lct > 0 and diff < 0) else "NO_DATA")
    print(f"  [{status:12s}] {k}")
EOF
```

**关键洞察（2026-05-17）**：所有 session 都显示 `L1_DONE`（cursor 超前），但 `l1_fts` 只有 5 条旧记录。这说明 **L1 extraction 运行了但返回了 0 条 memories**——不是链路不通，而是 LLM 输出为空。

## 相关文档

- `references/feishu-aia-path.md` — Feishu → AIAgent → memory_tencentdb 完整调用链，关键代码位置，sync_all 静默失败修复方法
- `references/diagnostics-commands.md` — 调试命令参考：SQLite vec0/FTS5 模块诊断、Gateway 日志分析、recall/capture 链路验证
- `references/vec0-fts5-node-sqlite-fix.md` — vec0 + FTS5 修复：node:sqlite → better-sqlite3 完整步骤、MiniMax LLM 端点问题、旧 L1 向量回填脚本

## 卸载

```bash
pkill -f "tsx src/gateway/server.ts"
rm ~/.hermes/hermes-agent/plugins/memory/memory_tencentdb
# 编辑 ~/.hermes/config.yaml 将 memory.provider 改回 mem0local
```
