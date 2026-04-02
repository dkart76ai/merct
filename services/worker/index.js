import 'dotenv/config'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { getRedisClient } from '../shared/redis-client.js'
import { REDIS_KEYS } from '../shared/constants.js'
import { BrowserHandler } from './browser-handler.js'

// Force unbuffered stdout in Docker
if (process.stdout._handle) process.stdout._handle.setBlocking(true)

const redis = getRedisClient()
let running = true

const config = {
  headless: process.env.HEADLESS === 'true',
  workerId: process.env.WORKER_ID || process.env.HOSTNAME || 'worker-unknown',
  port: parseInt(process.env.PORT || '3001'),
  instances: parseInt(process.env.WORKER_INSTANCES || '1')
}

const workerUrl = `http://${config.workerId}:${config.port}`

const SCREENSHOT_PATH = path.join(process.cwd(), 'screenshots', 'latest.jpg')
fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true })
fs.mkdirSync(path.join(process.cwd(), 'debug'), { recursive: true })

console.log(`🤖 Worker starting: ${config.workerId} (${config.instances} instances)`)

// Track all instances
const instances = [] // [{ id, browser, browserHandler, workerCode, claimedAccount }]

async function recoverAbandonedAccounts() {
  const registry = (await redis.hgetall(REDIS_KEYS.WORKERS_REGISTRY)) || {}
  const activeWorkerIds = new Set(Object.keys(registry))
  const inUse = (await redis.hgetall(REDIS_KEYS.ACCOUNTS_INUSE)) || {}
  for (const [workerId, account] of Object.entries(inUse)) {
    if (!activeWorkerIds.has(workerId)) {
      await redis.rpush(REDIS_KEYS.ACCOUNTS_LIST, account)
      await redis.hdel(REDIS_KEYS.ACCOUNTS_INUSE, workerId)
      console.log(`[${config.workerId}] 🔄 Recovered account from dead worker: ${workerId}`)
    }
  }
}

async function claimAccount(instanceId) {
  const item = await redis.blpop(REDIS_KEYS.ACCOUNTS_LIST, 10)
  if (!item) {
    throw new Error(`[${instanceId}] No accounts available`)
  }
  const account = JSON.parse(item[1])
  await redis.hset(REDIS_KEYS.ACCOUNTS_INUSE, instanceId, item[1])
  console.log(`[${instanceId}] ✅ Claimed account: ${account.user}`)
  return { ...account, raw: item[1] }
}

async function initBrowser(instanceId, account) {
  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--proxy-server="direct://"',
      '--proxy-bypass-list=*',
      '--mute-audio',
      '--use-gl=egl',
      '--enable-webgl',
      '--ignore-gpu-blocklist'
    ]
  })
  const browserConfig = {
    ...config,
    workerId: instanceId,
    accountUser: account.user,
    accountPwd: account.pwd,
    accountFile: account.session || 'session.json'
  }
  const browserHandler = new BrowserHandler(browser, browserConfig)
  await browserHandler.initialize()
  return { browser, browserHandler }
}

async function runInstance(instanceId) {
  const account = await claimAccount(instanceId)
  const instance = {
    id: instanceId,
    browser: null,
    browserHandler: null,
    workerCode: null,
    claimedAccount: account.raw
  }
  instances.push(instance)

  const screenshotPath = path.join(process.cwd(), 'screenshots', `${instanceId}_latest.jpg`)

  while (running) {
    const item = await redis.blpop(REDIS_KEYS.COORDINATES_LIST, 5)

    try {
      if (!instance.browser) {
        console.log(`[${instanceId}] 🌐 Launching browser...`)
        const { browser, browserHandler } = await initBrowser(instanceId, account)
        instance.browser = browser
        instance.browserHandler = browserHandler
      }

      if (!item) continue

      const paused = await redis.exists(REDIS_KEYS.SCAN_PAUSED)
      if (paused) {
        await redis.rpush(REDIS_KEYS.COORDINATES_LIST, item[1])
        await new Promise(r => setTimeout(r, 2000))
        continue
      }

      const { k, x, y } = JSON.parse(item[1])
      console.log(`[${instanceId}] 🔍 Scanning K:${k} X:${x} Y:${y}`)

      console.time('scanCoordinate')
      const result = await instance.browserHandler.scanCoordinate(k, x, y, instance.workerCode)
      console.timeEnd('scanCoordinate')

      if (instance.browserHandler.lastScreenshot) {
        fs.writeFileSync(screenshotPath, instance.browserHandler.lastScreenshot)
      }

      if (result.found) {
        const mercData = {
          k,
          x,
          y,
          confidence: result.confidence,
          text: result.text,
          timestamp: new Date().toISOString()
        }
        await redis.lpush(REDIS_KEYS.MERCENARIES_LIST, JSON.stringify(mercData))
        await redis.rpush(REDIS_KEYS.CHAT_PENDING_LIST, JSON.stringify(mercData))
        console.log(`[${instanceId}] ✅ MERCENARIO FOUND! K:${k} X:${x} Y:${y}`)
      }
    } catch (error) {
      console.error(`[${instanceId}] ❌ Error:`, error.message)
      if (instance.browserHandler) await instance.browserHandler.close().catch(() => {})
      instance.browser = null
      instance.browserHandler = null
    }

    if (item) {
      const listExists = await redis.exists(REDIS_KEYS.COORDINATES_LIST)
      if (listExists) {
        await redis.rpush(REDIS_KEYS.COORDINATES_LIST, item[1])
      } else {
        console.log(`[${instanceId}] 🛑 Scan stopped — going idle`)
      }
    }
  }
}

async function run() {
  await recoverAbandonedAccounts()

  await redis.hset(
    REDIS_KEYS.WORKERS_REGISTRY,
    config.workerId,
    JSON.stringify({ url: workerUrl, startedAt: new Date().toISOString() })
  )
  console.log(`[${config.workerId}] 📋 Registered at ${workerUrl}`)

  // Launch all instances in parallel
  const promises = []
  for (let i = 0; i < config.instances; i++) {
    const instanceId = `${config.workerId}-${i}`
    promises.push(
      runInstance(instanceId).catch(err => {
        console.error(`[${instanceId}] Fatal:`, err.message)
      })
    )
  }
  await Promise.all(promises)
}

// Health + screenshot + code endpoint
http
  .createServer((req, res) => {
    // serve screenshot for specific instance: /screenshot/worker-1-0
    const screenshotMatch = req.url.match(/^\/screenshot\/(.+)$/)
    if (screenshotMatch) {
      const p = path.join(process.cwd(), 'screenshots', `${screenshotMatch[1]}_latest.jpg`)
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' })
        fs.createReadStream(p).pipe(res)
        return
      }
    }

    if (req.method === 'POST' && req.url.startsWith('/code/')) {
      const instanceId = req.url.slice(6)
      let body = ''
      req.on('data', chunk => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const { code } = JSON.parse(body)
          const instance = instances.find(i => i.id === instanceId) || instances[0]
          if (instance) {
            instance.workerCode = code || null
            if (instance.browserHandler) instance.browserHandler.setWorkerCode(instance.workerCode)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, code }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        workerId: config.workerId,
        status: 'ok',
        browserReady: instances.some(i => !!i.browser),
        instances: instances.map(i => ({
          id: i.id,
          browserReady: !!i.browser,
          code: i.workerCode
        })),
        timestamp: new Date().toISOString()
      })
    )
  })
  .listen(config.port, () => {
    console.log(`[${config.workerId}] 🏥 Health server on port ${config.port}`)
  })

run().catch(err => {
  console.error(`[${config.workerId}] Fatal error:`, err)
  process.exit(1)
})

async function shutdown() {
  console.log(`[${config.workerId}] 🛑 Shutting down...`)
  running = false
  for (const instance of instances) {
    if (instance.claimedAccount) {
      await redis.rpush(REDIS_KEYS.ACCOUNTS_LIST, instance.claimedAccount).catch(() => {})
      await redis.hdel(REDIS_KEYS.ACCOUNTS_INUSE, instance.id).catch(() => {})
    }
    if (instance.browserHandler) await instance.browserHandler.close().catch(() => {})
    if (instance.browser) await instance.browser.close().catch(() => {})
  }
  await redis.hdel(REDIS_KEYS.WORKERS_REGISTRY, config.workerId).catch(() => {})
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
