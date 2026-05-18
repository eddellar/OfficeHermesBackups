# Hermes Backup — Session Notes (2026-05-14)

## What Happened

Backup push to `eddellar/OfficeHermesBackups` was blocked by GitHub secret scanning push protection:
- `Hugging Face User Access Token` in `.env:99`
- `GitHub Personal Access Token` in `.env:369`

Two prior attempts to redact individual values still triggered the block because GitHub scans for ALL secret patterns. The working solution: **delete `.env` entirely** from the backup snapshot, since it contains secrets AND is not needed for a config/sessions/skills backup.

## Resolution

```bash
# Remove .env entirely (it contains secrets AND large embedded values)
rm -f .env

# Also remove state-snapshots (contained >100MB .db files)
rm -rf state-snapshots

# Re-commit and push — succeeds because no secrets remain
git add -A
git commit --amend -m "Backup $(date +%Y%m%d)"
git push --force origin main
# → + c2b981a...ed79c04 main -> main (forced update) — SUCCESS
```

## Key Lesson

Redacting `.env` with `python3` line-by-line replacement works when there are few secrets. But when `.env` has **multiple detected patterns** (e.g. both `hf_` and `ghp_` tokens), GitHub blocks the push on any remaining secret. The pragmatic backup approach:

1. `.env` is **not needed** for a config/sessions/skills backup — it's environment-specific secrets
2. Simply excluding it entirely is cleaner and more reliable than partial redaction
3. State snapshots should also be excluded (large `.db` files, often contain embedded secrets from tool use)

## Files Actually Backed

| Item | Status | Reason |
|------|--------|--------|
| `config.yaml` | ✅ Backed up | Config only, no secrets |
| `.env` | ❌ Excluded | Contains HF token + GitHub PAT |
| `skills/` | ✅ Backed up | Skills content, nested `.git` dirs cleaned |
| `cron/` | ✅ Backed up | Jobs + output logs |
| `sessions/` | ✅ Backed up | Session JSON records |
| `state-snapshots/` | ❌ Excluded | >100MB `.db` files + potential secrets |

## Feishu Webhook Discovery

`FEISHU_*` vars in `.env` are for **bot/websocket mode** (`FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_CONNECTION_MODE=websocket`). There is no `FEISHU_WEBHOOK` key. Posting to `https://open.feishu.cn/open-apis/bot/v2/hook/{token}` returns `404 page not found`. To send Feishu notifications from cron, either:
1. Add a simple outgoing webhook bot in Feishu admin panel and use its URL
2. Use the bot API with `FEISHU_APP_ID` + `FEISHU_APP_SECRET` to obtain a tenant access token, then POST to the IM message API

## Cleanup Gotcha

After `rm -rf /tmp/hermes_git_backup`, the shell's CWD is destroyed. The next command fails with:
```
error retrieving current directory: getcwd: cannot access parent directories: No such file or directory
```
Fix: `cd /` before the rm, or chain cleanup into one command:
```bash
rm -rf /tmp/hermes_git_backup && cd /
```
