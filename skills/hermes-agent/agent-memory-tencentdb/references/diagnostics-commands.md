# TencentDB Agent Memory 调试命令参考

## Gateway 调试

### 查看 Gateway 进程的环境变量（确认注入是否生效）

```bash
# 找 PID
ss -tlnp | grep 8420
# 或
ps aux | grep 'tsx.*server' | grep -v grep

# 读取环境变量
cat /proc/<PID>/environ | tr '\0' '\n' | grep -E 'TDAI_|MINIMAX|API_KEY'
```

### Gateway 启动即崩溃（exit code 1，stderr 空）

**症状**：Hermes logs 显示 `Gateway process exited with code 1 during startup`，但 `gateway.stderr.log` 是空的。

**诊断**：
```bash
# 1. 手动运行看实际错误
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
timeout 10 npx tsx src/gateway/server.ts 2>&1 | tail -20
# 典型错误：require is not defined
```

**根因**：项目是 `"type": "module"`（ESM），但代码中仍用 `require()`（CommonJS）。

**解法**：将 `require()` 改为 ESM `import` 语法。见 `references/vec0-fts5-node-sqlite-fix.md`。

### 查看 Gateway 日志

```bash
tail -f /tmp/tdai-gateway.log
grep -E 'ERROR|login fail|vec0|FTS5|extraction failed' /tmp/tdai-gateway.log
```

### 健康检查

```bash
curl -s http://127.0.0.1:8420/health | python3 -m json.tool
# 关键标志：embeddingService: true/false, vectorStore: true/false
```

## SQLite 数据库调试

### 检查 SQLite 版本和编译选项

```python
import sqlite3
conn = sqlite3.connect(':memory:')
print('SQLite version:', sqlite3.sqlite_version)
opts = [r[0] for r in conn.execute('PRAGMA compile_options').fetchall()]
print('ENABLE_VEC:', 'ENABLE_VEC' in opts)
print('ENABLE_FTS5:', 'ENABLE_FTS5' in opts)
print('ENABLE_FTS4:', 'ENABLE_FTS4' in opts)

# 运行时模块列表（关键！）
mods = conn.execute("PRAGMA module_list").fetchall()
print('Runtime modules:', [m[1] for m in mods])
# vec0 不在列表 → 向量搜索失效
# fts5 不在列表 → FTS5 不可用
conn.close()
```

### 检查 vec0 是否实际加载

```python
import sqlite3
db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
try:
    count = conn.execute("SELECT COUNT(*) FROM l1_vec").fetchone()[0]
    print(f"vec0 OK: {count} vectors")
except sqlite3.OperationalError as e:
    print(f"vec0 FAILED: {e}")  # "no such module: vec0"
conn.close()
```

### 检查数据库记录数

```python
import sqlite3
db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
for t in ['l0_conversations', 'l1_records', 'l1_vec', 'l1_vec_info']:
    if t in tables:
        try:
            n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"{t}: {n} rows")
        except Exception as e:
            print(f"{t}: ERROR - {e}")
conn.close()
```

### 检查 vec0 扩展文件路径

```python
import sqlite3, os
paths = [
    '/usr/lib/sqlite/vec0.so',
    '/usr/local/lib/sqlite/vec0.so',
    os.path.expanduser('~/.memory-tencentdb/tdai-memory-openclaw-plugin/node_modules/vec0/...'),
]
conn = sqlite3.connect(':memory:')
for p in paths:
    try:
        conn.execute(f"SELECT load_extension('{p}')")
        print(f"✅ vec0 loaded from {p}")
        break
    except Exception as e:
        print(f"❌ {p}: {e}")
conn.close()
```

## recall 链路诊断

```bash
# 测试 recall（需要 session_key）
curl -s -X POST http://127.0.0.1:8420/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"关键词","session_key":"20260516_175735_1a35bd","maxResults":3}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'strategy={d.get(\"strategy\")}')
print(f'memory_count={d.get(\"memory_count\")}')
print(f'context_len={len(d.get(\"context\",\"\"))}')
"

# 日志中对应的 recall 诊断
grep 'Recall completed\|hybrid-embedding\|FTS5 unavailable\|vec0 returned' /tmp/tdai-gateway.log
```

## capture 链路诊断

```bash
curl -s -X POST http://127.0.0.1:8420/capture \
  -H "Content-Type: application/json" \
  -d '{
    "session_key": "test_diags",
    "session_id": "test-diags",
    "user_content": "测试消息",
    "assistant_content": "测试回复"
  }'
# 成功返回: {"l0_recorded":2,"scheduler_notified":true}
# 失败返回: {"error":"Missing required fields: ..."}
```

## Gateway 重启

```bash
# 查找进程并杀掉
ss -tlnp | grep 8420
kill <PID>

# 重启（从 .env 提取 key，不要用变量展开）
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
MINIMAX_KEY=$(grep '^MINIMAX_CN_API_KEY=' /home/eddellar/.hermes/.env | cut -d= -f2-)

env TDAI_LLM_BASE_URL="https://api.minimax.chat/v1" \
    TDAI_LLM_API_KEY="$MINIMAX_KEY" \
    TDAI_LLM_MODEL="MiniMax-M2.7-highspeed" \
    npx tsx src/gateway/server.ts > ~/.hermes/logs/memory_tencentdb/gateway.new.log 2>&1 &

sleep 4 && curl -s http://127.0.0.1:8420/health
```
```
