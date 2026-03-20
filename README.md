# Mercenaries Scanner

Scans Total Battle kingdoms for mercenaries using Playwright + OpenCV template matching, distributed via BullMQ + Redis.

## Architecture

- **API** (`services/api`) — Express server on port 3000, web UI, REST endpoints
- **Worker** (`services/worker`) — BullMQ consumer, Playwright browser, OpenCV image matching
- **Shared** (`services/shared`) — Redis client, queue config, constants

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Fill in your 3 game account credentials
```

### 2. Add assets

Place `merc3.jpg` (mercenary template) in `assets/`.

### 3. Build and run

```bash
docker compose up --build
```

### 4. Initialize the queue

```bash
curl -X POST http://localhost:3000/api/queue/init
```

Or click **Initialize Queue** in the web UI at http://localhost:3000.

## Auth files

On first run each worker will log in and save its session to `auth/user_N.json`. Subsequent runs reuse the saved session.

To regenerate auth files, delete the corresponding `auth/user_N.json` and restart the worker.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mercenaries` | List all found mercenaries |
| GET | `/api/queue/stats` | Queue waiting/active/completed/failed counts |
| POST | `/api/queue/init` | Populate queue with all coordinates |
| POST | `/api/queue/clear` | Drain queue |
| POST | `/api/mercenaries/clear` | Clear results list |
# merct
