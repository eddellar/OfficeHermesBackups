# L1 Pipeline 诊断方法论（2026-05-17）

## 核心原则

**当你发现 `l1_fts` 无新记录时，不要猜测链路断了。**

正确姿势：用 `recall_checkpoint.json` 的 cursor 状态判断 pipeline 是否真的跑了。

## 诊断流程

```
Step 1: 检查 L0/L1 记录数和最新时间
Step 2: 分析 recall_checkpoint 中每个 session 的 cursor 状态
Step 3: 区分 L1_DONE + 空结果 vs 真正未运行
Step 4: 定位根因（LLM 输出空 vs quality gate 过滤 vs 其他）
```

## Step 1: 快速状态检查

```python
import sqlite3, json

db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# L0/L1 数量和时间
l0_n  = conn.execute("SELECT COUNT(*) FROM l0_conversations").fetchone()[0]
l1_n  = conn.execute("SELECT COUNT(*) FROM l1_fts").fetchone()[0]
l0_ts = conn.execute("SELECT MAX(recorded_at) FROM l0_conversations").fetchone()[0]
l1_ts = conn.execute("SELECT MAX(timestamp_str) FROM l1_fts").fetchone()[0]
print(f"L0: {l0_n} records, latest={l0_ts}")
print(f"L1: {l1_n} records, latest={l1_ts}")

with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)

# 全局 cursor 状态
print(f"\ntotal_processed: {cp['total_processed']}")
print(f"last_captured_timestamp: {cp['last_captured_timestamp']}")
```

## Step 2: Cursor 状态分析（关键！）

```python
print("\nSession cursor analysis:")
for k, v in sorted(cp['runner_states'].items()):
    lct = v.get('last_captured_timestamp', 0)   # L0 最新时间
    ll1 = v.get('last_l1_cursor', 0)            # L1 cursor
    diff = ll1 - lct

    if lct == 0:
        status = "NO_DATA"       # session 无 L0 数据
    elif diff > 0:
        status = "L1_DONE"      # L1 cursor 超前 L0 → pipeline 跑了
    elif diff < 0:
        status = "L1_PENDING"   # L1 cursor 落后 → 有待处理
    else:
        status = "SYNC"

    # 只打印有意义的
    if status != "NO_DATA":
        print(f"  [{status:12s}] {k}: lct={lct}, ll1={ll1}, diff={diff}ms")
```

**状态解读**：

| status | 含义 | 下一步 |
|--------|------|--------|
| `L1_DONE` | pipeline 跑了，cursor 已更新 | 检查 l1_fts 是否有记录 |
| `L1_PENDING` | L1 落后，有待处理 | 等待或手动触发 seed |
| `NO_DATA` | session 无 L0 数据 | 正常，可能只是初始化 |

## Step 3: 区分两种 L1_DONE 假象

### 情况 A：L1_DONE + l1_fts 有记录
→ 正常，链路完全打通

### 情况 B：L1_DONE + l1_fts 无记录（当前问题）
→ pipeline 跑了但 LLM 返回 0 条 memory

**区分命令**：
```python
# 5/17 session 有 L1_DONE 但 l1_fts 为空
python3 << 'EOF'
import sqlite3, json

db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)

sessions_517 = {k:v for k,v in cp['runner_states'].items() if k.startswith('20260517')}
l1_sessions = set(r['session_key'] for r in conn.execute("SELECT DISTINCT session_key FROM l1_fts").fetchall())

for k, v in sorted(sessions_517.items()):
    lct = v.get('last_captured_timestamp', 0)
    ll1 = v.get('last_l1_cursor', 0)
    diff = ll1 - lct
    if lct > 0 and diff > 0:
        in_l1 = "✅" if k in l1_sessions else "❌ EMPTY"
        print(f"  {in_l1} {k}")
EOF
```

## Step 4: 根因定位

### 如果 L1_DONE + l1_fts 为空

可能原因：

1. **LLM JSON-mode 输出失败**（最可能）
   - MiniMax 对 JSON-mode structured output 支持不稳定
   - 验证：`/seed` 批量重提取，如成功则 LLM 链路正常

2. **`shouldExtractL1` quality gate 过滤全部消息**
   - 所有消息被质量过滤器筛掉
   - 验证：检查 `l1-extractor.ts` 中 `qualifiedMessages.length`
   - 注意：当前 5/17 的 Feishu 消息大多是技能更新指令（`Review the conversation...`），可能被认为不适合提取为记忆

3. **LLM 返回空 SceneSegment 数组**
   - `callLlmExtraction` 返回 `[]`
   - 但 cursor 已更新（说明 extraction 步骤本身没抛异常）

### 根因：MiniMax JSON-mode 不遵循（已确认）

**问题代码**：`l1-extractor.ts` 的 `parseExtractionResult`

```typescript
// 当 LLM 返回中没有 [...] JSON 数组时
const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
if (!arrayMatch) {
  logger?.warn?.(`${TAG} [l1-debug] NO_JSON taskId=l1-extraction, rawLen=..., rawFull=...`);
  return [];  // ← 返回空，记忆丢失
}
```

**MiniMax 行为**：recall 接口能返回 markdown（`<user-persona>`），说明模型能生成结构化文本；但 L1 extraction 要求纯 JSON `[{...}]`，模型不遵守 `response_format: {type: "json_object"}`，返回自由文本或 markdown包裹的JSON。

**NO_JSON 日志位置**：搜索 gateway stdout/stderr 中 `[l1-debug] NO_JSON`

**修复方向**：在 `return []` 之前添加 text-to-memory fallback，从自由文本中提取语义记忆。

### 验证方法：用 seed 重提取

```bash
curl -X POST http://127.127.0.0.1:8420/seed \
  -H "Content-Type: application/json" \
  -d '{"sessionKeys":["20260517_174009_eb6f02"],"dryRun":false}'
```

如果 seed 成功提取出 memories，说明 LLM 链路正常，问题在增量 extraction；如果 seed 也返回 0，说明是 LLM JSON-mode 固有问题。

## 快速诊断一命令

```bash
python3 << 'EOF'
import sqlite3, json

db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)

l0_n  = conn.execute("SELECT COUNT(*) FROM l0_conversations").fetchone()[0]
l1_n  = conn.execute("SELECT COUNT(*) FROM l1_fts").fetchone()[0]
l1_ts = conn.execute("SELECT MAX(timestamp_str) FROM l1_fts").fetchone()[0]
print(f"L0={l0_n} L1={l1_n} L1_latest={l1_ts}")

with open('/home/eddellar/.memory-tencentdb/memory-tdai/.metadata/recall_checkpoint.json') as f:
    cp = json.load(f)

pending = sum(1 for v in cp['runner_states'].values()
              if v.get('last_captured_timestamp',0) > 0
              and v.get('last_l1_cursor',0) < v.get('last_captured_timestamp',0))
done = sum(1 for v in cp['runner_states'].values()
           if v.get('last_captured_timestamp',0) > 0
           and v.get('last_l1_cursor',0) > v.get('last_captured_timestamp',0))
print(f"L1_DONE={done} L1_PENDING={pending}")
print(f"total_processed={cp['total_processed']} total_l0={l0_n}")

if l1_n == 0 and done > 0:
    print("\n⚠️  L1_DONE but l1_fts is EMPTY → LLM returned 0 memories")
elif l1_n > 0:
    print("\n✅ L1 pipeline appears functional")
EOF
```

## 关键文件路径

```
~/.memory-tencentdb/memory-tdai/
├── vectors.db                              # SQLite（含 l0_conversations, l1_fts, l1_records）
└── .metadata/
    └── recall_checkpoint.json             # cursor 状态文件（关键诊断文件）

~/.memory-tencentdb/tdai-memory-openclaw-plugin/src/
├── core/record/l1-extractor.ts          # LLM extraction 逻辑
└── utils/sanitize.ts                     # shouldExtractL1 质量过滤
```
