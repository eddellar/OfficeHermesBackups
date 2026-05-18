# Hermes Backup — Session Notes (2026-05-15)

## What Happened

Backup push to `eddellar/OfficeHermesBackups` encountered two new failure modes beyond yesterday's session.

### Failure 1: GH013 — Secret in Ancestor Commit

A first commit (`6483fd3`) containing unredacted secrets was created. Even after a second commit that amended the `.env` with redacted values, GitHub's Secret Scanning blocked the push because it scans the **entire reachable commit graph**, not just HEAD.

`git commit --amend` did NOT fix it — it only rewrote HEAD, leaving the original secret commit as its parent, still reachable in the object graph.

**Solution: Reinitialize the repo from scratch (rm -rf .git; git init) with secrets redacted at copy time.**

### Failure 2: HTTP 408 with Large Pack Upload

When pushing a large pack (~265K lines), attempts failed with:
```
error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408
send-pack: unexpected disconnect while reading sideband packet
```
**Fix:** `git config http.version HTTP/1.1 && git config http.postBuffer 524288000`

### Failure 3: Nested .git Dirs — Correct Order

Three skills contained embedded `.git` dirs. The correct fix order:
1. `git rm --cached -rf skills/.archive/comfyui-skill-openclaw ...` (un-track first)
2. `find . -name '.git' -type d -exec rm -rf {} +` (then remove from filesystem)
3. `git add -A` (re-add cleanly)

## Feishu Bot API

Bot: `FEISHU_APP_ID=cli_a96b4ae49dfa5bcf`. No webhook URL — use bot IM API:
1. Get token: `POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`
2. Send message: `POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id`

## Result

Commit `3b4ea9a` — 889 files, 265,654 insertions, all secrets redacted at copy time.
