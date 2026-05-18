# Sending Text Messages to Feishu via REST API (httpx)

The `feishu-file-attachments` skill focuses on file attachments. This note covers **text-only message sending** via the Feishu REST API — useful for reports, alerts, and bot replies.

## Why not just use `send_message`?

The `send_message` tool routes through the Hermes gateway's `_send_feishu` platform adapter. This works for active gateway sessions but **may not be available in cron/sandbox contexts** where the gateway isn't running. Direct REST API calls work unconditionally.

## Method: httpx + Feishu IM API

```python
import json, httpx, os

app_id = os.environ.get('FEISHU_APP_ID', '')
app_secret = os.environ.get('FEISHU_APP_SECRET', '')
chat_id = os.environ.get('FEISHU_HOME_CHANNEL', '')  # or specific chat_id

# Step 1: Get tenant access token
resp = httpx.post(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    json={"app_id": app_id, "app_secret": app_secret},
    timeout=30
)
resp.raise_for_status()
token = resp.json()["tenant_access_token"]

# Step 2: Send text message
msg_resp = httpx.post(
    "https://open.feishu.cn/open-apis/im/v1/messages",
    params={"receive_id_type": "chat_id"},
    headers={"Authorization": f"Bearer {token}"},
    json={
        "receive_id": chat_id,
        "msg_type": "text",
        "content": json.dumps({"text": "Your message here"})
    },
    timeout=30
)
msg_resp.raise_for_status()
print(f"Sent: {msg_resp.json()}")
```

## Key Gotcha: `lark_oapi` SDK Client Initialization

The `lark_oapi.Client` class does **NOT** accept `app_id`/`app_secret` as constructor kwargs:

```python
# ❌ Wrong — TypeError: unexpected keyword argument 'app_id'
from lark_oapi import Client
client = Client(app_id=app_id, app_secret=app_secret, domain=lark.FEISHU_DOMAIN)

# ✅ Use httpx directly for token + API calls instead
```

The SDK's `Client` is used internally by the Hermes gateway platform adapter. For standalone scripts (cron jobs, sandboxes), use raw `httpx` calls as shown above — it works reliably and doesn't depend on SDK setup.

## Environment Variables Needed

| Variable | Source | Notes |
|----------|--------|-------|
| `FEISHU_APP_ID` | `~/.hermes/config.yaml` or `~/.hermes/.env` | Bot app ID |
| `FEISHU_APP_SECRET` | Same | Bot app secret |
| `FEISHU_HOME_CHANNEL` | Same | Default chat_id for the bot's home channel |

All three are already set in the standard Hermes + Feishu configuration.

## Sending Markdown/Formatted Text

Feishu `text` type does not render markdown. For formatted text, use `post` type with Feishu's card format:

```python
# For simple markdown-like text, send as plain text (Feishu will NOT render **bold**, etc.)
# Feishu 'post' type supports a rich JSON format — see Feishu docs for element_types
```

For simplicity, plain `text` type is usually sufficient for reports and alerts. Markdown formatting characters will appear literally in the Feishu client.

## Source

Discovered 2026-05-15 during Hermes cleanup cron job — gateway adapter unavailable in sandbox context, needed direct API access.
