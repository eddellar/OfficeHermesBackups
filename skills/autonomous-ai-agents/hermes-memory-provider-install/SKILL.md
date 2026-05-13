---
name: hermes-memory-provider-install
description: Install and configure third-party memory providers (Mem0, Honcho, etc.) as Hermes Agent memory backends.
version: 1.0.0
author: Hermes Agent
license: MIT
tags: [hermes, memory, plugin, mem0, configuration]
---

# Hermes Memory Provider Installation

Install a third-party memory provider plugin for Hermes Agent's persistent memory system.

## When to Use This Skill

**Trigger:** User asks to install/configure/replace a Hermes memory provider (e.g., Mem0, Honcho, SuperMemory). This includes:
- "Install mem0/mem0ai as memory"
- "Configure Hermes memory backend"
- "Set up persistent memory with [provider name]"
- Troubleshooting why a memory provider isn't loading
- The words "memos" (often confused with Mem0)

## Architecture Overview

```
memory.provider: mem0local     # config.yaml — selects the active provider
~/.hermes/plugins/mem0local/   # Plugin directory — NAME must match config value
├── __init__.py               # Must contain a MemoryProvider SUBCLASS (inherits from ABC)
└── plugin.yaml               # Optional
~/.hermes/hermes-agent/agent/memory_provider.py  # ABC definition
~/.hermes/hermes-agent/agent/memory_manager.py  # Manager that loads plugins
```

**Critical rules:**
1. `memory.provider: X` in config.yaml → plugin directory must be `~/.hermes/plugins/X/`
2. **Bundled providers** (`hermes-agent/plugins/memory/<name>/`) take precedence over user plugins with the SAME name. If `mem0` is configured but `hermes-agent/plugins/memory/mem0/` exists, THAT bundled one loads instead of the user's plugin. Use a unique name (e.g. `mem0local`) to avoid collision.
3. The plugin class MUST inherit from `MemoryProvider` (not just reference it in a comment)
4. `is_available` is a **regular method**, NOT a `@property` — the ABC declares `def is_available(self) -> bool:`. Using `@property` causes `TypeError: 'bool' object is not callable` when Hermes calls `_mp.is_available()`
5. **`handle_tool_call` must return `str` (JSON string), not `dict`** — the ABC signature is `def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:` and Hermes expects a JSON string. Returning a `dict` causes `unhashable type: 'slice'` error in `model_tools.py` when it tries `result[1:]` on the tool result.

## Installation Steps

### 0. Install Provider-Specific Dependencies

Before creating the plugin, install required Python packages in the Hermes venv:

```bash
~/.hermes/hermes-agent/venv/bin/pip install fastembed  # Required for mem0's fastembed embedder
```

mem0's `EmbedderFactory` maps provider names to classes: `fastembed` → `FastEmbedEmbedding`. Without `fastembed` installed, mem0 raises `ModuleNotFoundError: No module named 'fastembed'`.

### 1. Create Plugin Directory

Plugin name must match `memory.provider` value in config:

```bash
mkdir -p ~/.hermes/plugins/mem0
```

### 2. Implement the MemoryProvider Class

The `__init__.py` must contain a class that **inherits** from `MemoryProvider` (NOT just has a comment marker).

**Critical:** The class MUST inherit from `MemoryProvider` so that `issubclass()` succeeds in `load_memory_provider()`.

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'hermes-agent'))
from agent.memory_provider import MemoryProvider

class MyProvider(MemoryProvider):  # ← MUST inherit, not just reference in a comment!
    pass
```

**Required interface (all are abstract):**
- `@property name(self) -> str` — return provider name (e.g. `"mem0local"`)
- `is_available(self) -> bool` — **regular method, NOT a @property**. Return True if deps/config are present
- `initialize(self, session_id: str, **kwargs) -> None` — called once at startup. kwargs always includes `hermes_home`, `platform`, and may include `user_id` (platform user identifier, e.g. Feishu open_id)
- `get_tool_schemas(self) -> List[Dict[str, Any]]` — return list of tool schemas this provider exposes
- `sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None` — persist a completed turn

**Common non-abstract methods (optional overrides):**
- `prefetch(self, query: str, *, session_id: str = "") -> str` — called BEFORE each LLM API call to inject relevant memories as context. Return formatted memory text, or empty string. This is synchronous and must be fast (use background threads for expensive ops).
- `system_prompt_block(self) -> str` — return static text injected into the system prompt (告诉她有记忆工具可用). Return empty string to skip.
- `handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str` — handle tool calls. **Must return a JSON string**, not a dict.
- `queue_prefetch(self, query: str, *, session_id: str = "") -> None` — queue background prefetch for next turn
- `on_turn_start()`, `on_turn_end()`, `on_session_end()`, `shutdown()`, `get_stats()`

**Example:**
```python
from typing import Any, Dict, List
from agent.memory_provider import MemoryProvider

class Mem0LocalProvider(MemoryProvider):
    @property  # name is a @property
    def name(self) -> str:
        return "mem0local"

    def is_available(self) -> bool:
        return True

    def initialize(self, session_id: str, hermes_home: str, **kwargs) -> None:
        self._session_id = session_id

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [{"name": "memory_search", "description": "...", "parameters": {...}}]

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        # persist turn to backend
        pass
```

### 3. Create plugin.yaml (Recommended)

```yaml
name: mem0
version: 1.0.0
description: Mem0 AI memory provider for Hermes Agent
author: Custom
pip_dependencies:
  - mem0ai==2.0.1
requires_env: []
hooks:
  - on_turn_start
  - on_session_end
```

### 4. Update config.yaml

```yaml
memory:
  memory_enabled: true
  provider: mem0   # Must match plugin directory name

mem0:
  pluginPath: ~/.hermes/plugins/mem0  # Path to plugin directory
  llm_model: MiniMax-M2.7
  llm_base_url: https://api.minimaxi.com/v1
  embedder_model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  embedder_dims: 384
  user_id: hermes_user
```

### 5. Restart Hermes

```bash
# Gateway
sudo systemctl restart hermes-gateway

# Or in WSL (if systemd not available)
hermes gateway restart
```

### 6. Verify Loading

Check logs for memory provider registration:
```bash
grep "Memory provider" ~/.hermes/logs/agent.log
# Should show: Memory provider 'mem0' registered (N tools)
```

If no registration appears, common causes:
- **Plugin not found:** Directory `~/.hermes/plugins/<name>/` doesn't exist or `__init__.py` is missing
- **Name mismatch:** `memory.provider: X` but directory is `~/.hermes/plugins/Y/`
- **Missing interface:** Class doesn't implement all required `MemoryProvider` methods
- **`__init__.py` missing `MemoryProvider` string:** `load_memory_provider()` uses text scan to detect memory providers
- **Wrong location:** Never `plugins/memory/<name>/` — always directly under `plugins/`

## Plugin Discovery Mechanism

From `plugins/memory/__init__.py` — `load_memory_provider(name)`:

1. `find_provider_dir(name)` looks for `~/.hermes/plugins/<name>/__init__.py` first, then `hermes-agent/plugins/memory/<name>/`
2. **Bundled providers take precedence** — if both exist with the same name, the bundled one wins
3. Loads the module via `importlib.util.spec_from_file_location`
4. Checks for `MemoryProvider` string in `__init__.py` to identify as a memory provider plugin
5. Tries `register(collector)` pattern first, then falls back to instantiating **any `MemoryProvider` subclass** found in the module via `issubclass()` check

**Why `issubclass()` fails (leading to "no provider found"):**
- The class must ACTUALLY inherit from `MemoryProvider` (e.g. `class MyProvider(MemoryProvider):`)
- A comment `# MemoryProvider marker` does NOT make it a subclass
- `MemoryProvider` must be imported into the module's namespace so `issubclass()` can resolve it

**Why `is_available()` raises `TypeError: 'bool' object is not callable` after loading:**
- `is_available` was defined as a `@property` returning `True` in the plugin
- But the ABC declares it as `def is_available(self) -> bool:` (a regular method)
- Hermes calls `_mp.is_available()` — the plugin has no `__call__` on `True`
- Fix: remove `@property` decorator so it's `def is_available(self) -> bool:`

## Troubleshooting

### `unhashable type: 'slice'` on memory_search
**Cause:** `handle_tool_call` returned a Python `dict` instead of a JSON string. Hermes's `model_tools.py` passes tool results through `result[1:]` to strip the first char (expecting a string), causing `TypeError: 'slice' on dict` when result is a dict.

**Fix:** `handle_tool_call` must return `json.dumps(dict)` not the raw dict:
```python
def handle_tool_call(self, tool_name: str, parameters: Dict[str, Any]) -> str:
    if tool_name == "memory_search":
        return json.dumps(self._search(parameters.get("query", ""), parameters))
    ...
```

### `TypeError: 'bool' object is not callable` after loading
**Cause:** `is_available` was defined as a `@property` returning `True` in the plugin. But the ABC declares it as `def is_available(self) -> bool:` (a regular method). Hermes calls `_mp.is_available()` which gets the `True` bool, then tries to call it as `True()`.

**Fix:** Remove `@property` decorator:
    def is_available(self) -> bool:
        return True
```

### `memory_search` returns 0 hits despite data existing
**Cause:** User ID mismatch. Memories stored with `user_id='test_user'` are invisible to queries with `user_id='hermes_user'`. The mem0 FAISS index stores vectors with metadata including user_id as a filter.

**Fix:** Migrate data to the correct user_id:
```python
# Read from old user_id, re-add to new user_id
result = old_provider.handle_tool_call('memory_get_all', {})
for h in json.loads(result).get('hits', []):
    new_provider._get_memory().add(h['snippet'], user_id='hermes_user')
```

### Memory appears healthy but injection is always truncated
**Symptom:** `history.db` has hundreds of entries, `memory_search` works fine, but the LLM never retrieves old facts. The `memory_char_limit` in `config.yaml` is the bottleneck — mem0 produces a semantic summary, and if the char limit is too small, the summary gets truncated before injection.

**Diagnosis:**
```bash
# Check history.db stats
sqlite3 /home/eddellar/.mem0/history.db "SELECT COUNT(*) FROM history; SELECT event, COUNT(*) FROM history GROUP BY event;"

# Check current memory_char_limit
grep memory_char_limit ~/.hermes/config.yaml
```

**DB structure:** `history` table has `id, memory_id, old_memory, new_memory, event, created_at, is_deleted, actor_id, role`. All 872 entries were `event='ADD'` with no duplicates except early-session bugs (e.g., "coffee preference" ADD'd 8 times).

**Fix:** Increase `memory_char_limit` in `~/.hermes/config.yaml`:
```yaml
memory:
  memory_char_limit: 8000   # was 2200 — allows full mem0 semantic summary
```

**Deduplication** (if needed — rare):
```python
import sqlite3
db = "/home/eddellar/.mem0/history.db"
conn = sqlite3.connect(db)
conn.execute("BEGIN")
c = conn.cursor()
# Keep oldest, delete duplicate ADD entries with same new_memory
c.execute("""
    DELETE FROM history
    WHERE new_memory = 'User prefers to drink American coffee without sugar'
    AND id NOT IN (
        SELECT id FROM history
        WHERE new_memory = 'User prefers to drink American coffee without sugar'
        ORDER BY created_at ASC LIMIT 1
    )
""")
conn.commit()
```

**Key paths:**
- DB: `/home/eddellar/.mem0/history.db`
- Config: `~/.hermes/config.yaml` (NOT `~/.mem0/config.json` which only has `user_id`)
- FAISS index: `~/.mem0/faiss_index/`

### `ModuleNotFoundError: No module named 'fastembed'`
**Cause:** mem0's `EmbedderFactory` doesn't include `fastembed` as a built-in dependency. The `fastembed` package must be installed separately.

**Fix:**
```bash
~/.hermes/hermes-agent/venv/bin/pip install fastembed
```

### Plugin loads but returns 0 results for everything
1. Check `is_available()` returns `True` without raising
2. Verify `handle_tool_call` returns a `str` (JSON), not a `dict`
3. Check user_id matches between storage and query
4. Run direct test:
```python
mp = load_memory_provider('mem0local')
mp._user_id = 'hermes_user'  # Match what's in config
result = mp.handle_tool_call('memory_search', {'query': 'test', 'limit': 5})
print(json.loads(result))
```

```bash
# Restart Hermes first
sudo systemctl restart hermes-gateway

# Then check logs
grep "Memory provider" ~/.hermes/logs/agent.log
# Should show: Memory provider 'mem0local' registered (N tools)
```

**Debug loading manually:**
```python
import sys; sys.path.insert(0, 'hermes-agent')
from pathlib import Path
from plugins.memory import load_memory_provider
mp = load_memory_provider("mem0local")
print(mp.name, mp.is_available, mp.get_tool_schemas())
```

## Bundled vs User-Installed

| | Bundled | User-Installed |
|-|---------|---------------|
| Path | `hermes-agent/plugins/memory/<name>/` | `~/.hermes/plugins/<name>/` |
| Precedence | First (wins on collision) | Second |
| Use case | Providers shipped with Hermes | Custom/third-party providers |

For user-installed plugins, the module is loaded as `_hermes_user_memory.<name>` to avoid collision with bundled providers.
