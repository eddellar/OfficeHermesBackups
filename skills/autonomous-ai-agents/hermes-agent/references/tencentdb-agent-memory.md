# TencentDB Agent Memory — Research Notes (2026-05-16)

## What It Is

**MIT-licensed** open-source memory plugin by Tencent Cloud database team (released 2026-05-14).
GitHub: `Tencent/TencentDB-Agent-Memory`

## Architecture: Node.js Gateway Sidecar + Python Provider

```
Hermes (Python)
  └─ MemoryTencentdbProvider (Python HTTP client + supervisor)
       ├─ GatewaySupervisor — starts Node.js sidecar
       └─ SdkClient — POST /recall, /capture, /search → 127.0.0.1:8420
            memory-tencentdb Gateway (Node.js)
               ├─ L0: Raw conversation store (SQLite + JSONL)
               ├─ L1: Episodic extraction (LLM + vector dedup)
               ├─ L2: Scene blocks (Markdown)
               └─ L3: Persona synthesis (persona.md)
```

**Key insight:** NOT a pure Python provider like mem0. Requires Node.js runtime (>=22.16) and a separate LLM API for L1/L2/L3 extraction.

## Four-Layer Memory

| Layer | What | Storage |
|-------|------|---------|
| L0 | Raw conversation | SQLite + JSONL (`refs/*.md`) |
| L1 | Atomic facts (extracted from dialogue) | SQLite + sqlite-vec |
| L2 | Scene blocks | Markdown files |
| L3 | User persona | Markdown (`persona.md`) |

## Short-Term Compression (Core Innovation)

**Problem:** Long tasks → verbose tool logs accumulate → context window fills → token cost ↑, task state lost.

**Solution:**
1. Full tool logs written to `refs/*.md` (external FS)
2. Context only gets Mermaid Flowchart task graph with `node_id` references
3. Agent reasons on compact Mermaid, drills down via `node_id` when needed
4. **Result:** -61% token consumption (WideSearch benchmark), +51% task success rate

## Comparison: Hermes Current Memory

| Aspect | TencentDB Agent Memory | Hermes default |
|--------|----------------------|----------------|
| Memory layers | 4-layer progressive (auto) | 2-layer static (manual) |
| Short-term compression | Mermaid task graph + offloading | None |
| User profile | Auto-inferred from dialogue | Manually maintained |
| Evidence traceability | node_id → refs/*.md | None |
| Long-term retrieval | Vector + BM25 + RRF | session_search (manual) |
| Token optimization | -61% measured | None |
| Implementation | Node.js Gateway + Python adapter | Python in-process |

## Benchmark Results (from README)

| Memory Capability | Benchmark | OpenClaw Success | With Plugin | Relative Δ |
| :--- | :--- | :---: | :---: | :---: |
| Short-term | WideSearch | 33% | 50% | +51.52% |
| Short-term | SWE-bench | 58.4% | 64.2% | +9.93% |
| Short-term | AA-LCR | 44.0% | 47.5% | +7.95% |
| Long-term | PersonaMem | 48% | 76% | +59% |

| | OpenClaw Tokens | With Plugin Tokens | Relative Δ |
| :--- | :---: | :---: | :---: |
| WideSearch | 221.31M | 85.64M | **−61.38%** |
| SWE-bench | 3474.1M | 2375.4M | −33.09% |
| AA-LCR | 112.0M | 77.3M | −30.98% |

## Status in This Session

Research completed. npm install stalled due to slow network in WSL. Package downloaded and extracted to `~/.memory-tencentdb/tdai-memory-openclaw-plugin/`. Installation not finished.

Full install steps: see `hermes-memory-provider-install` skill references.
