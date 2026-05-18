# Feishu → AIAgent → Memory 调用链（2026-05-17）

## 完整调用链

```
Feishu Platform
    ↓
feishu.py:2127 _handle_message_event_data(data)
    ↓
feishu.py:2569 _handle_message_with_guards(event)
    ↓
feishu.py:2578 handle_message(event) [via super()]
    ↓
gateway/run.py:6749 agent_result = await self._run_agent(...)
    ↓
gateway/run.py:13145 async def _run_agent(...)
    ↓
gateway/run.py:13934 agent = AIAgent(...)  ← skip_memory=False（默认）
    ↓
AIAgent.__init__ (run_agent.py:1767)
    _memory_manager = MemoryManager()
    _memory_manager.add_provider(_mp)      ← memory_tencentdb
    _memory_manager.initialize_all(...)    ← 初始化 provider
    ↓
AIAgent.run_conversation → sync_all (run_agent.py:4951)
    self._memory_manager.sync_all(
        original_user_message, final_response,
        session_id=self.session_id or "")
    ↓
gateway/run.py:4962
    except Exception: pass   ← ⚠️ 静默吞异常，无日志
```

## 关键代码位置

| 步骤 | 文件 | 行号 | 说明 |
|------|------|------|------|
| Feishu 消息入口 | `feishu.py` | 2127 | `_handle_message_event_data` |
| 消息处理 | `feishu.py` | 2578 | `handle_message`（继承自 BasePlatformAdapter） |
| Agent 调度 | `run.py` | 6749 | `_run_agent` 调用入口 |
| Agent 创建/复用 | `run.py` | 13934 | `AIAgent(...)` — `skip_memory=False`（默认） |
| Memory 初始化 | `run.py` | 1767-1811 | `add_provider` + `initialize_all` |
| Sync 调用 | `run.py` | 4954-4962 | `sync_all` + 静默异常捕获 |

## `skip_memory=True` 的特例（不影响 Feishu 主路径）

只有以下场景使用 `skip_memory=True`，不参与日常 Feishu 会话：

1. **`/compress` 命令**（run.py:6554）：临时压缩会话
2. **`/background` 命令**（run.py:9879）：后台任务

## `sync_all` 静默失败的原因

```python
# run_agent.py:4954-4962
try:
    self._memory_manager.sync_all(
        original_user_message, final_response,
        session_id=self.session_id or "",
    )
    self._memory_manager.queue_prefetch_all(
        original_user_message,
        session_id=self.session_id or "",
    )
except Exception:
    pass  # ← 任何异常被吞掉，无任何日志
```

这是防故障设计（外部 provider 失败不阻断用户响应），但导致 memory-tencentdb 静默失效时完全无感知。

**修复方法**：改为 `logger.warning("sync_all failed: %s", e)`

## `sync_all`/`prefetch_all` 使用 logger.debug

这两个方法内部使用 `logger.debug`，不在 info 级别日志中出现——这是设计预期，不代表方法未被调用。如果需要验证调用，可临时改为 `logger.info`。

## 2026-05-17 新发现：Feishu 会话 L0 正常，但 L1 静默返回 0 条记录

**发现背景**：所有 5/17 Feishu 会话的 `recall_checkpoint` 显示 `L1_DONE`（cursor 已更新），但 `l1_fts` 和 `l1_records` 表中没有任何 5/17 的记录（5条全来自 5/16）。

**解释**：这说明 `sync_all` → `/capture` → L1 pipeline **实际执行了**，但 LLM 在 extraction 阶段返回了 0 条 memories（`extractedCount = 0, storedCount = 0`）。pipeline 正常完成，但结果是空的。

**可能的根因**：
1. MiniMax-M2.7-highspeed 的 JSON-mode structured output 不稳定
2. `shouldExtractL1` quality gate 把所有消息过滤掉了（因为都是技能更新指令类的短消息）
3. 消息内容不适合提取记忆（都是"Review the conversation above and update the skill library"类的元指令）

**验证命令**：
```python
# 对比 L0 和 L1 记录的时间
python3 << 'EOF'
import sqlite3, json
db = '/home/eddellar/.memory-tencentdb/memory-tdai/vectors.db'
conn = sqlite3.connect(db)
l0_latest = conn.execute("SELECT MAX(recorded_at) FROM l0_conversations").fetchone()[0]
l1_latest = conn.execute("SELECT MAX(timestamp_str) FROM l1_fts").fetchone()[0]
print(f"L0 latest: {l0_latest}")
print(f"L1 latest: {l1_latest}")
EOF
```
如果 L0 最新时间 >> L1 最新时间，且 recall_checkpoint 显示 L1_DONE，说明 L1 运行了但返回空。

---

## 验证 memory_tencentdb 是否在当前会话被调用

在 `memory_tencentdb/__init__.py` 的 `sync_all` 方法开头添加：
```python
logger.info("sync_all called for session %s", session_id)
```
然后重启 Gateway，观察 agent.log。
