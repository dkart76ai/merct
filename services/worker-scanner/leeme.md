to run locally for testing in Node

set REDIS_HOST=localhost
set REDIS_PORT=6379
set REDIS_PASSWORD=changeme
set WORKER_ID=worker-scanner
set SCANNER_ACCOUNT_USER=youraccount@example.com
set SCANNER_ACCOUNT_PWD=yourpassword
set SCANNER_KINGDOM=305
set HEADLESS=false
cd services\worker-scanner
node index.js


Or add to services/worker-scanner/.env and run node index.js
