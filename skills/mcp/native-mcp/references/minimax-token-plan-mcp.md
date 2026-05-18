# MiniMax Token Plan MCP — Configuration Reference

## Overview

MiniMax Token Plan MCP provides two tools:
- **`web_search`** — web search with query string input
- **`understand_image`** — image understanding (local path or URL, max 20MB; formats: JPEG/PNG/GIF/WebP)

API endpoint: `https://api.minimaxi.com`

## Hermes Agent Native MCP Config

Add to `~/.hermes/config.yaml` under `mcp_servers`:

```yaml
mcp_servers:
  minimax:
    command: "uvx"
    args: ["minimax-coding-plan-mcp", "-y"]
    env:
      MINIMAX_API_KEY: "your-token-plan-api-key"
      MINIMAX_API_HOST: "https://api.minimaxi.com"
    timeout: 120
    connect_timeout: 60
```

> **Prerequisite:** The `mcp` Python package must be installed in Hermes Agent's venv before MCP tools will register:
> ```bash
> ~/.hermes/hermes-agent/venv/bin/python -m pip install mcp
> ```
> Without this, servers connect but tools are silently never registered.

## Other IDE Integrations (for reference)

| IDE | Config Location | Notes |
|-----|----------------|-------|
| Claude Code | `~/.claude.json` | `command: uvx`, args: `["minimax-coding-plan-mcp", "-y"]` |
| Cursor | `mcp.json` | Requires `MINIMAX_MCP_BASE_PATH` (writable local output dir) |
| OpenCode | `~/.config/opencode/opencode.json` | `"type": "local"` |

## Gotchas

- **Token Plan API Key ≠按量付费 API Key** — They are separate. Get yours at <https://platform.minimaxi.com/subscribe/token-plan>
- **`uvx` vs `uv pip`**: `uvx` runs ephemeral tool packages; `uv pip install mcp` installs the Python SDK. Both may be needed.
- **Local file paths in `understand_image`**: The tool accepts local filesystem paths, not just HTTP URLs — useful for analyzing generated images.
- **Max image size**: 20MB per image.

## Tool Names

When registered via Hermes native MCP, tools appear as:
- `mcp_minimax_web_search`
- `mcp_minimax_understand_image`
