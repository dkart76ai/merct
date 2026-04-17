# Docker Setup with BullMQ

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   React UI      │────▶│  Express API   │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ BullMQ   │ │ BullMQ   │ │ BullMQ   │
              │ Queue    │ │ Worker   │ │  Redis   │
              └──────────┘ └──────────┘ └──────────┘
```

## Quick Start

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## BullMQ Job Types

| Job Type | Priority | Description |
|----------|----------|-------------|
| `send-packet` | CRITICAL/HIGH/LOW | Send packets to game server |
| `extract-objects` | NORMAL | Extract objects from responses |
| `notification` | HIGH | Send Discord/chat notifications |

## API Endpoints

### Jobs
- `POST /api/scanKingdom` - Queue manual scan (CRITICAL priority)
- `POST /api/timer/start` - Start periodic scans (LOW priority)
- `GET /api/jobs/status` - Queue status
- `GET /api/jobs/:id` - Job details

### Timers
- `GET /api/timers` - Active timers
- `POST /api/timer/stop` - Stop timers

### Browser
- `POST /api/browser/start` - Start Playwright browser
- `POST /api/capturing/start` - Start packet capture

## Environment Variables

Create a `.env` file:

```env
PORT=3000
REDIS_HOST=redis
REDIS_PORT=6379
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
CHAT_CHANNEL_ID=
```

## Health Check

```bash
curl http://localhost:3000/api/health
```

## Useful Commands

```bash
# Shell into app container
docker-compose exec app sh

# Connect to Redis CLI
docker-compose exec redis redis-cli

# View queue status
curl http://localhost:3000/api/jobs/status

# View active timers
curl http://localhost:3000/api/timers
```

## Cleanup

```bash
# Remove everything (including data)
docker-compose down -v

# Rebuild without cache
docker-compose build --no-cache
```
