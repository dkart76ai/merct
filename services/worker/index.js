import 'dotenv/config'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { getRedisClient } from '../shared/redis-client.js'
import { REDIS_KEYS } from '../shared/constants.js'
import { BrowserHandler } from './browser-handler.js'

const redis = getRedisClient()
let browser = null
let browserHandler = null
let running = true
let workerCode = null
let claimedAccount = null // holds the raw JSON string to push back on shutdown

const config = {
  headless: process.env.HEADLESS === 'true',
  workerId: process.env.WORKER_ID || process.env.HOSTNAME || 'worker-unknown',
  port: parseInt(process.env.PORT || '3001')
}

const workerUrl = `http://${process.env.HOSTNAME || 'localhost'}:${config.port}`

let accountUser = process.env.WORKER_ACCOUNT_USER
let accountPwd = process.env.WORKER_ACCOUNT_PWD
let accountFile = process.env.WORKER_ACCOUNT_FILE || 'session.json'

const SCREENSHOT_PATH = path.join(process.cwd(), 'screenshots', 'latest.jpg')
fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true })
fs.mkdirSync(path.join(process.cwd(), 'debug'), { recursive: true })

const DEBUG_PATH = path.join(process.cwd(), 'debug')
fs.mkdirSync(path.dirname(DEBUG_PATH), { recursive: true })

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || ''

async function notifyDiscord(k, x, y, texto) {
  if (!DISCORD_WEBHOOK) return
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `⚔️ K:${k} X:${x} Y:${y} (${texto})`
      })
    })
  } catch (error) {
    console.error(`[${config.workerId}] Discord notify failed:`, error.message)
  }
}

async function recoverAbandonedAccounts() {
  const registry = await redis.hgetall(REDIS_KEYS.WORKERS_REGISTRY) || {}
  const activeWorkerIds = new Set(Object.keys(registry))
  const inUse = await redis.hgetall(REDIS_KEYS.ACCOUNTS_INUSE) || {}
  for (const [workerId, account] of Object.entries(inUse)) {
    if (!activeWorkerIds.has(workerId)) {
      await redis.rpush(REDIS_KEYS.ACCOUNTS_LIST, account)
      await redis.hdel(REDIS_KEYS.ACCOUNTS_INUSE, workerId)
      console.log(`[${config.workerId}] 🔄 Recovered account from dead worker: ${workerId}`)
    }
  }
}

async function claimAccount() {
  const item = await redis.blpop(REDIS_KEYS.ACCOUNTS_LIST, 10)
  if (!item) {
    if (accountUser && accountPwd) {
      console.log(`[${config.workerId}] No accounts in Redis, using env vars`)
      return
    }
    throw new Error('No accounts available — stopping worker')
  }
  const account = JSON.parse(item[1])
  accountUser = account.user
  accountPwd = account.pwd
  accountFile = account.session || 'session.json'
  claimedAccount = item[1]
  await redis.hset(REDIS_KEYS.ACCOUNTS_INUSE, config.workerId, claimedAccount)
  console.log(`[${config.workerId}] ✅ Claimed account: ${accountUser}`)
}

async function initBrowser() {
  const keyword = await redis.get(REDIS_KEYS.SCAN_KEYWORD).catch(() => null)
  browser = await chromium.launch({
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
  const browserConfig = { ...config, accountUser, accountPwd, accountFile, keyword }
  browserHandler = new BrowserHandler(browser, browserConfig)
  await browserHandler.initialize()
}

async function run() {
  await recoverAbandonedAccounts()
  await claimAccount()

  await redis.hset(
    REDIS_KEYS.WORKERS_REGISTRY,
    config.workerId,
    JSON.stringify({ url: workerUrl, startedAt: new Date().toISOString() })
  )
  console.log(`[${config.workerId}] 📋 Registered at ${workerUrl}`)

  while (running) {
    const item = await redis.blpop(REDIS_KEYS.COORDINATES_LIST, 5)
    if (!item) continue

    const paused = await redis.exists(REDIS_KEYS.SCAN_PAUSED)
    if (paused) {
      await redis.rpush(REDIS_KEYS.COORDINATES_LIST, item[1])
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    const { k, x, y } = JSON.parse(item[1])
    console.log(`[${config.workerId}] 🔍 Scanning K:${k} X:${x} Y:${y}`)

    try {
      if (!browser) {
        console.log(`[${config.workerId}] 🌐 Launching browser...`)
        await initBrowser()
      }

      const result = await browserHandler.scanCoordinate(k, x, y, workerCode)

      // sync keyword from Redis to browser
      const keyword = await redis.get(REDIS_KEYS.SCAN_KEYWORD)
      await browserHandler.setKeyword(keyword || null)

      if (browserHandler.lastScreenshot) {
        fs.writeFileSync(SCREENSHOT_PATH, browserHandler.lastScreenshot)
      }

      if (result.found) {
        await redis.lpush(
          REDIS_KEYS.MERCENARIES_LIST,
          JSON.stringify({
            k,
            x,
            y,
            confidence: result.confidence,
            text: result.text,
            timestamp: new Date().toISOString()
          })
        )
        console.log(`[${config.workerId}] ✅ MERCENARIO FOUND! K:${k} X:${x} Y:${y}`)
        await notifyDiscord(k, x, y, result.text)
        await browserHandler.sendChatMessage(`⚔️ Mercenario found!`, { k, x, y })
      } else {
        console.log(`[${config.workerId}] ❌ No mercenario at K:${k} X:${x} Y:${y}`)
      }
    } catch (error) {
      console.error(`[${config.workerId}] ❌ Error at K:${k} X:${x} Y:${y}:`, error)
      if (browserHandler) await browserHandler.close().catch(() => {})
      browser = null
      browserHandler = null
    }

    // Only push back if the list still exists (not stopped)
    const listExists = await redis.exists(REDIS_KEYS.COORDINATES_LIST)
    if (listExists) {
      await redis.rpush(REDIS_KEYS.COORDINATES_LIST, item[1])
    } else {
      console.log(`[${config.workerId}] 🛑 Scan stopped — worker going idle`)
    }
  }
}

// Health + screenshot + code endpoint
http
  .createServer((req, res) => {
    if (req.url === '/screenshot' && fs.existsSync(SCREENSHOT_PATH)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' })
      fs.createReadStream(SCREENSHOT_PATH).pipe(res)
      return
    }

    if (req.method === 'POST' && req.url === '/code') {
      let body = ''
      req.on('data', chunk => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const { code } = JSON.parse(body)
          workerCode = code || null
          if (browserHandler) browserHandler.setWorkerCode(workerCode)
          console.log(`[${config.workerId}] 🔑 Code set to: ${workerCode}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, code: workerCode }))
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
        browserReady: !!browser,
        code: workerCode,
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
  if (claimedAccount) {
    await redis.rpush(REDIS_KEYS.ACCOUNTS_LIST, claimedAccount).catch(() => {})
    await redis.hdel(REDIS_KEYS.ACCOUNTS_INUSE, config.workerId).catch(() => {})
    console.log(`[${config.workerId}] 🔄 Account returned to pool`)
  }
  await redis.hdel(REDIS_KEYS.WORKERS_REGISTRY, config.workerId).catch(() => {})
  if (browserHandler) await browserHandler.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
