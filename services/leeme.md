How to deploy:

Server A:

cp .env.example .env  # set REDIS_PASSWORD, WORKER_1_* credentials
docker compose -f docker-compose.server-a.yml up --build

Copy
bash
Server B/C (copy the project files there too):

cp .env.example .env  # set REDIS_PASSWORD, REDIS_HOST=<server-a-ip>, WORKER_2/3_* credentials
docker compose -f docker-compose.server-b.yml up --build
docker compose -f docker-compose.server-c.yml up --build

Copy
bash
The old docker-compose.yml is still there if you ever want to run everything on a single machine.



//---------------------------

so if i want to deploy more servers with another game account, what should i do ?


Context
Just create a new compose file following the same pattern. For example, Server D with account 4:

1. Add the new account to your .env on every server:

WORKER_4_USER=account4@example.com
WORKER_4_PWD=password4

Copy
bash
2. Create docker-compose.server-d.yml:

services:
  worker-4:
    build:
      context: .
      dockerfile: services/worker/Dockerfile
    environment:
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT:-6379}
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - WORKER_ID=worker-4
      - WORKER_ACCOUNT_USER=${WORKER_4_USER}
      - WORKER_ACCOUNT_PWD=${WORKER_4_PWD}
      - WORKER_ACCOUNT_FILE=user_3.json
      - HEADLESS=true
    volumes:
      - ./assets:/app/assets
      - ./auth:/app/auth

Copy
yaml
3. Deploy on Server D:

cp .env.example .env  # fill in credentials
docker compose -f docker-compose.server-d.yml up --build

Copy
bash
That's it — the new worker automatically joins the pool, picks coordinates from the shared Redis list, and starts scanning. No changes needed to Server A, B, or C.

---
to run locally without docker

1- run redis inside docker

2. set variables

set REDIS_HOST=localhost
set REDIS_PORT=6379
set REDIS_PASSWORD=changeme
set WORKER_ID=worker-1
set WORKER_ACCOUNT_USER=ajuegar5+1@outlook.com
set WORKER_ACCOUNT_PWD=game.123
set WORKER_ACCOUNT_FILE=session1.json
set HEADLESS=false

cd g:\delphiprojs\playWTB
node services/worker/index.js
