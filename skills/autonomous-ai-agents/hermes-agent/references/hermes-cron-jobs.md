# Hermes Cron Jobs — Operational Reference

## Active Jobs (as of 2026-05-14)

| Job ID | Name | Schedule | Last Status |
|--------|------|----------|-------------|
| `2fcbbe101235` | Hermes垃圾清理 | `0 5 * * *` | ok |
| `2fd7f4e362e2` | Hermes配置备份 | `0 6 * * *` | ok |

Job definitions live in `~/.hermes/cron/jobs.json`.

## Cron Job Prompt Design Patterns

### Pattern 1: GitHub Token in Cron Prompt (CRITICAL)

**Problem:** LLM-written git commands that embed `GITHUB_TOKEN` from `.env` get the token value masked to `***` by Hermes secret redaction, breaking push.

**Wrong (masked to `***`):**
```
git remote add origin "https://user:${GITHUB_TOKEN}@github.com/..."
git remote add origin "https://user:$(grep GITHUB_TOKEN ~/.hermes/.env | cut -d= -f2)@github.com/..."
```

**Correct — read token at shell execution time:**
```bash
source /home/eddellar/.hermes/.env && \
git remote add origin "https://${GITHUB_TOKEN}@github.com/eddellar/OfficeHermesBackups.git"
```

**Rule:** Always use `source .env && echo $VAR` or `source ... && git ...` so the shell resolves the variable, not the LLM prompt.

### Pattern 2: File Existence Guard Before Operations

```bash
for item in config.yaml .env skills cron; do
  [ -e "/home/eddellar/.hermes/$item" ] && cp -r "/home/eddellar/.hermes/$item" ./
done
```

### Pattern 3: sessions.json Exemption

When cleaning old sessions:
```bash
# CORRECT — protects sessions.json
find ~/.hermes/sessions/ -maxdepth 1 \( -name "*.json" -o -name "*.jsonl" \) ! -name "sessions.json" -mtime +90 -delete

# WRONG — deletes everything including sessions.json
find ~/.hermes/sessions/ -maxdepth 1 \( -name "*.json" -o -name "*.jsonl" \) -mtime +90 -delete
```

`sessions.json` is the session index — always preserved.

## Hermes配置备份 — Known Behaviors

### Backup File List (as of 2026-05-14, job `2fd7f4e362e2`)

**Tracked:**
- `~/.hermes/config.yaml`
- `~/.hermes/.env` ← excluded from git via prompt (GitHub secret scanning blocks push)
- `~/.hermes/skills/` — entire skills directory
- `~/.hermes/cron/` — job definitions + all output logs

**Explicitly excluded in prompt:**
- `.env` — GitHub PAT triggers push protection
- `sessions/` — session transcripts, no longer backed up (removed 2026-05-14; git history cleaned via `git filter-repo --path sessions --invert-paths --force`)
- `state-snapshots/` — contains `state.db` (451MB, >100MB GitHub limit)
- `node_modules/`, `__pycache__/`, `*.pyc`, `venv/`, `.cache/`, `*.log`, `*.tmp`, `.DS_Store`

### Backup Target

GitHub repo: `eddellar/OfficeHermesBackups`
Branch: `main` (force-pushed after git-filter-repo cleanup 2026-05-14)

## Hermes垃圾清理 — Scope

| Path | Condition | Protected |
|------|-----------|-----------|
| `~/.hermes/tmp/` | All files | — |
| `~/.hermes/logs/` | `>7 days` | Recent logs |
| `~/.hermes/cache/` | `>7 days` | Recent cache |
| `/tmp/hermes*` | WSL temp files | — |
| `~/.cache/hermes/` | Cache dir | — |
| `~/.hermes/sessions/` | `>90 days` *.json/*.jsonl, NOT sessions.json | `sessions.json`, recent sessions |

Sessions dir (~7MB as of 2026-05) is **not backed up** to GitHub (removed from backup list 2026-05-14). It grows at ~7MB/week; 90-day retention ≈ ~20MB.

## Cron Output

Each job writes output to: `~/.hermes/cron/output/{job_id}/{date}.md`

## Doctor Check for Hermes + Streaming Card Integration

```bash
python3 -m hermes_feishu_card.cli doctor \
  --config ~/.hermes_feishu_card/config.yaml \
  --hermes-dir ~/.hermes/hermes-agent
```

Key fields to verify:
- `compatibility: full` ✅
- `version: v2026.5.7` (must be ≥ `v2026.4.23`)
- `hook_strategy: legacy_gateway_run` (or `gateway_run_013_plus` for Hermes 0.13.0+)
- All anchors: `found`
