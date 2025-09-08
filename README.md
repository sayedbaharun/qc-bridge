# QC Bridge v2.0

Production-ready Notion to Supabase sync bridge with enterprise-grade reliability features.

## Features

✅ **Cursor-based sync** - Persistent state management in Supabase  
✅ **Hash-based deduplication** - Avoids unnecessary updates  
✅ **Retry logic** - Exponential backoff for API failures  
✅ **Rate limiting** - Respects Notion API limits  
✅ **Environment-first** - Secure credential management  
✅ **Multiple run modes** - `--once`, `--dry-run`, `--verbose`  
✅ **Production logging** - Structured output for monitoring  

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Test in dry-run mode
npm run dry-run

# Single sync
npm run once

# Continuous sync (local development)
npm start
```

## Environment Variables

```bash
NOTION_TOKEN=ntn_xxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE=eyJxxxxxxxxxxxxxxxx
SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxx  # Optional fallback
```

## Deployment

### Railway (Recommended)

1. Fork/clone this repository
2. Connect to Railway: https://railway.app/new
3. Select "Deploy from GitHub repo"
4. Add environment variables in Railway dashboard
5. Set up cron: `*/5 * * * *` (every 5 minutes)

### Manual Server

```bash
# Using PM2
npm install -g pm2
pm2 start index.mjs --name qc-bridge --cron "*/5 * * * *"

# Using systemd + crontab
crontab -e
# Add: */5 * * * * cd /path/to/qc-bridge && npm run once
```

## Architecture

```
Notion Quick Capture DB ──[Bridge]──> Supabase Tasks
                          │
                          ├─ Cursor persistence
                          ├─ Hash deduplication  
                          ├─ Retry + backoff
                          └─ Rate limiting
```

**Data Flow:**
1. Query Notion for updated pages since last cursor
2. Extract and normalize properties (Brand, Project, Priority, etc.)
3. Call Supabase RPC to create/update tasks
4. Update Notion pages with Task ID + "Linked ✅"
5. Store hash + cursor for next sync

## Monitoring

**Logs to watch:**
- `[INFO] Created task: <title>` - Successful sync
- `[WARN] Could not fetch cursor` - Cursor issues
- `[ERROR] Failed to process page` - Sync failures

**Health check:**
```bash
# Should complete without errors
npm run once
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Invalid API key` | Check SUPABASE_SERVICE_ROLE is fresh |
| `Function not found` | Verify RPC functions exist in Supabase |
| `No pages to process` | Normal - means no recent Notion updates |
| `Rate limited` | Built-in retries will handle this |

## Support

- **Issues**: https://github.com/sayedbaharun/qc-bridge/issues
- **Notion Setup**: Ensure "Quick Capture" database has properties: Title, Brand, Project, Milestone, Priority, Due, Assignee, Supabase Task ID, Linked ✅

---

**Status**: Production Ready ✅  
**Last Updated**: September 2025  
**Deployment**: Railway + Supabase  