# vec0 + FTS5 修复：node:sqlite → better-sqlite3

## 核心发现（2026-05-17 实测）

### node:sqlite vs better-sqlite3

| 特性 | `node:sqlite` (DatabaseSync) | `better-sqlite3` |
|------|:---------------------------:|:----------------:|
| FTS5 虚拟表 | ❌ `no such module: fts5` | ✅ 完全正常 |
| sqlite-vec vec0 | ❌ 运行时未装载 | ✅ `load()` 自动成功 |
| extension loading | `enableLoadExtension(true)` | 默认启用（无此方法） |
| BM25 底层 | 依赖 FTS5 → 失效 | 依赖 FTS5 → 正常 |
| 包大小 | 内置，无需安装 | 需 npm install |
| Node.js 版本 | v22 内置 | 需编译（但有预编译版） |

### 验证方法（Python，直接查 SQLite 运行时模块）

```python
import sqlite3
conn = sqlite3.connect(db_path)

# 检查运行时已加载的模块（不是 compile_options！）
mods = [m[1] for m in conn.execute("PRAGMA module_list").fetchall()]
print('FTS5:', 'fts5' in mods)      # node:sqlite → False
print('vec0:', 'vec0' in mods)      # node:sqlite → False

# better-sqlite3 验证（启动 Gateway 后）
# $ cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
# $ node -e "const Database = require('better-sqlite3'); ..."
```

### sqlite-vec 加载机制（better-sqlite3 场景）

```javascript
const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');

const db = new Database('/path/to/vectors.db');
sqliteVec.load(db);  // 会调用 db.loadExtension(getLoadablePath())

// 无需调用 db.enableLoadExtension() — 不存在这个方法
// 也不需要手动 load_extension
```

### 修复步骤（完整）

**⚠️ ESM vs CommonJS 陷阱**：项目 `package.json` 含 `"type": "module"`，是 **ESM 模式**，不能用 `require()`，必须用 `import` 语法。`require is not defined` 是 exit code 1 的根因。

```bash
# 1. 安装 better-sqlite3 到插件目录
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
npm install better-sqlite3 --omit=dev
npm install --save-dev @types/better-sqlite3 @types/node
```

**2. 修改 `src/core/store/sqlite.ts`**

```typescript
// 顶部 import（ESM）
import { Database } from "better-sqlite3";
import type { Statement } from "better-sqlite3";

// class VectorStore 成员类型
private db!: Database;           // 替代 DatabaseSync
private stmtUpsertMeta!: Statement;  // 替代 StatementSync

// constructor 中
constructor(dbPath: string, dimensions: number, logger?: Logger) {
  this.dimensions = dimensions;
  this.logger = logger;

  // ✅ 正确：ESM import（不再是 require）
  const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
  this.db = new BetterSqlite3(dbPath, { verbose: undefined });

  // ... PRAGMAs ...

  // ❌ 删除这行：this.db.enableLoadExtension(true)
  // （better-sqlite3 的 Database 默认启用 extension loading）
}

// init() 中的 sqlite-vec 加载
try {
  const sqliteVec = require("sqlite-vec");
  // 移除 this.db.enableLoadExtension(true)
  sqliteVec.load(this.db);
} catch (err) { ... }
```

**如果还报 `require is not defined`**：说明 tsx 的 ESM 处理有问题，需要用动态 `import()` 代替顶层的 `require()`。但 `init()` 是同步方法，改 async 会影响整个调用链，建议找腾讯DB维护者确认官方是否有 ESM 构建。

```bash
# 3. 重启 Gateway
pkill -f "tsx src/gateway/server.ts"
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
TDAI_LLM_API_KEY="sk-cp-n8..." \
TDAI_LLM_BASE_URL="https://api.minimax.chat/v1" \
TDAI_LLM_MODEL="MiniMax-M2.7-highspeed" \
  npx tsx src/gateway/server.ts &
```

**验证 FTS5 是否生效**：
```bash
# Gateway 启动后日志检查
grep -E "FTS5|fts5|vec0|degraded" /tmp/tdai-gateway.log
# 应该看到 FTS5 初始化成功，不再是 degraded mode

# Python 运行时验证
python3 -c "
import sqlite3
conn = sqlite3.connect('/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db')
mods = [m[1] for m in conn.execute('PRAGMA module_list').fetchall()]
print('FTS5:', 'fts5' in mods)
print('vec0:', 'vec0' in mods)
"
```

## MiniMax LLM API 端点问题

### 已确认不可用
- `https://api.minimaxi.com/v1/chat_completions` → 404（Python/Node/curl 均测）

### 待验证（用户需确认）
- MiniMax 官方文档中的正确 chat API 端点
- 认证格式（是否需要 `app:` 前缀或其他编码）

### Embedding 端点（已验证可用）
- Endpoint: `https://api.jina.ai/v1/embeddings`
- Model: `jina-embeddings-v3`
- 维度: 1024
- 认证: `Authorization: Bearer <jina_api_key>`
- Header 要求: 必须带 `User-Agent`，否则 Cloudflare 返回 1010

## 旧 L1 记录向量回填

现有 5 条 L1 记录在配置 Jina 之前创建，`embedding=null`。修复 FTS5 后需要回填：

```python
import sqlite3, json, urllib.request

DB = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
JINA_API = 'https://api.jina.ai/v1/embeddings'
JINA_KEY = 'jina_12e...'  # 已知

conn = sqlite3.connect(DB)
rows = conn.execute(
    "SELECT id, content FROM l1_records WHERE embedding IS NULL"
).fetchall()

for id, content in rows:
    req = urllib.request.Request(
        JINA_API,
        data=json.dumps({'model': 'jina-embeddings-v3', 'input': [content]}).encode(),
        headers={'Authorization': f'Bearer {JINA_KEY}', 'User-Agent': 'Mozilla/5.0'}
    )
    vec = json.loads(urllib.request.urlopen(req).read())['data'][0]['embedding']
    # 写入 l1_vec 表（根据实际 schema 调整）
    print(f"Row {id}: {len(vec)}D vector ready")
```
