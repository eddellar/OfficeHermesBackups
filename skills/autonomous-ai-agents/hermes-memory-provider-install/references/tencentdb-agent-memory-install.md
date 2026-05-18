# TencentDB Agent Memory — Installation Notes

> 2026-05-16 | Status: ✅ Installed and verified working

## Verified Working Installation

**Environment:** WSL2 + Hermes v0.12.0 + Node.js v23.11.1 + npm 11.13.0

**Fixed issues discovered:**
1. `@vitest/utils@4.1.6` doesn't exist in registry → use `--omit=dev`
2. `tsx` is a dev dep, not installed by default → `npm install tsx --omit=dev`
3. `pnpm` NOT required → use `npx tsx` instead

## Installation (Verified Working)

```bash
# 1. Download tarball
curl -sL "https://registry.npmjs.org/@tencentdb-agent-memory/memory-tencentdb/-/memory-tencentdb-0.3.5.tgz" -o /tmp/memory-tencentdb.tgz

mkdir -p ~/.memory-tencentdb/tdai-memory-openclaw-plugin
tar -xzf /tmp/memory-tencentdb.tgz --strip-components=1 -C ~/.memory-tencentdb/tdai-memory-openclaw-plugin

# 2. Install dependencies (omit dev to avoid @vitest/utils@4.1.6 not found)
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
npm install --omit=dev
npm install tsx --omit=dev  # tsx is a dev dep but needed for gateway

# 3. Symlink into Hermes (directory name: memory_tencentdb with underscore)
mkdir -p ~/.hermes/plugins/memory
ln -sf ~/.memory-tencentdb/tdai-memory-openclaw-plugin/hermes-plugin/memory/memory_tencentdb \
       ~/.hermes/plugins/memory/memory_tencentdb

# 4. Update config.yaml
# memory.provider: memory_tencentdb

# 5. Start gateway
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
npx tsx src/gateway/server.ts &
sleep 5 && curl http://127.0.0.1:8420/health
```

## Verified Gateway API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/recall` | Memory recall (prefetch) |
| POST | `/capture` | Conversation capture |
| POST | `/search/memories` | L1 memory search |
| POST | `/search/conversations` | L0 conversation search |

**Note:** Paths are at root (`/recall`), NOT `/api/recall`.

## Verified Database

**DB:** `~/.memory-tencentdb/memory-tdai/vectors.db`

**Tables:** `l0_conversations`, `l1_records`, `embedding_meta`

**Sample L0 capture verified:**
```json
{"l0_recorded": 2, "scheduler_notified": true}
-- inserted into l0_conversations:
('assistant', '很高兴认识你！')
('user', '我叫小明')
('assistant', '你好小明！')
```

## Limitation

`embeddingService: false` — without LLM API key configured, L1/L2/L3 extraction disabled. Only L0 capture works.

To enable full four-layer extraction:
```bash
export MEMORY_TENCENTDB_LLM_API_KEY=your_key
export MEMORY_TENCENTDB_LLM_BASE_URL=https://api.openai.com/v1
export MEMORY_TENCENTDB_LLM_MODEL=gpt-4o
export MEMORY_TENCENTDB_LLM_PROVIDER=openai_compatible
```

## Comparison with Hermes Built-in Memory

| | TencentDB Agent Memory | Hermes built-in |
|---|----------------------|-----------------|
| Memory layers | 4-layer (L0→L3, automatic) | 2-layer static |
| User profile | Auto-inferred | Manual |
| Short-term compression | Mermaid task graph | None |
| Token optimization | -61% (measured) | Context Compression only |
| State tracking | Structured task graph | Linear history |

**Core gap:** TencentDB auto-extracts user preferences from dialogue; Hermes requires manual MEMORY.md/USER.md maintenance.
