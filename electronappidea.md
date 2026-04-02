What it is:

A Windows desktop app (.exe installer) distributed to volunteers

Each volunteer runs 1 instance, contributing their game account to scan the map

All results go to your central Redis server

What stays on the user's machine:

Game account credentials (email + password)

Playwright + Chromium (bundled in the app)

Auth session file (so they don't re-login every time)

What lives on your server:

Redis (coordinates list, results, chat pending)

API + web dashboard (your existing setup)

worker-chat service

How it works:

User installs the app and enters:

Their game account credentials

App connects to Redis through an API endpoints and starts BLPOP loop

Playwright launches headless Chromium, logs into the game

For each coordinate: navigate → screenshot → OpenCV detect → push result

Found mercenaries are pushed to mercenaries:found and chat:pending

User can pause/resume scanning from the UI

When app closes, it just stops consuming — no cleanup needed on Redis side

UI panels:

Settings — credentials, connection token, headless toggle

Status — online/offline, current coordinate being scanned, scan speed

Results — mercenaries found by this user

Map input — user submits kingdoms/coordinates they want prioritized

Map input feature:

User enters the kingdom list they care about

App pushes those kingdoms in Redis


User gets notified in the app when results come back for their submitted areas

Distribution:

Built with electron-builder → single .exe installer

Auto-update support via electron-updater so you can push new versions

Chromium downloaded on first run to keep installer size small (~50MB installer, downloads ~150MB Chromium on first launch)

Security:

Credentials never leave the user's machine

Users connect to Redis via a token you issue (can revoke access per token)

No personal data stored on your server — only scan coordinates and results



@
services

