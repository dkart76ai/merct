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

const config = {
  accountUser: process.env.WORKER_ACCOUNT_USER,
  accountPwd: process.env.WORKER_ACCOUNT_PWD,
  accountFile: process.env.WORKER_ACCOUNT_FILE,
  headless: process.env.HEADLESS === 'true',
  workerId: process.env.WORKER_ID || 'worker-unknown'
}

const SCREENSHOT_PATH = path.join(process.cwd(), 'screenshots', 'latest.jpg')
fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true })

console.log(`🤖 Worker starting with account: ${config.accountUser}`)

async function initBrowser() {
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
  browserHandler = new BrowserHandler(browser, config)
  await browserHandler.initialize()
}

async function run() {
  while (running) {
    // BLPOP blocks up to 5s waiting for an item — naturally pauses when list is empty
    const item = await redis.blpop(REDIS_KEYS.COORDINATES_LIST, 5)
    if (!item) continue

    const paused = await redis.exists(REDIS_KEYS.SCAN_PAUSED)
    if (paused) {
      // Put it back and wait before retrying
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

      if (browserHandler.lastScreenshot) {
        fs.writeFileSync(SCREENSHOT_PATH, browserHandler.lastScreenshot)
      }

      if (result.found) {
        await redis.lpush(
          REDIS_KEYS.MERCENARIES_LIST,
          JSON.stringify({ k, x, y, text: result.text, timestamp: new Date().toISOString() })
        )
        console.log(
          `[${config.workerId}] ✅ MERCENARIO FOUND! K:${k} X:${x} Y:${y} coord:${result.text} `
        )
      } else {
        console.log(
          `[${config.workerId}] ❌ No mercenario at K:${k} X:${x} Y:${y} coord:${result.text}`
        )
      }
    } catch (error) {
      console.error(`[${config.workerId}] ❌ Error at K:${k} X:${x} Y:${y}:`, error)
      // Reset browser on error so it reinitializes on next iteration
      if (browserHandler) await browserHandler.close().catch(() => {})
      browser = null
      browserHandler = null
    }

    // Always push back to end of list for circular scanning
    await redis.rpush(REDIS_KEYS.COORDINATES_LIST, item[1])
  }
}

let workerCode = null

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
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const { code } = JSON.parse(body)
          workerCode = code || null
          console.log(`[${config.workerId}] 🔑 Code set to: ${workerCode}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, code: workerCode }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
        }
      })
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      workerId: config.workerId,
      status: 'ok',
      browserReady: !!browser,
      code: workerCode,
      timestamp: new Date().toISOString()
    }))
  })
  .listen(process.env.PORT || 3001, () => {
    console.log(`[${config.workerId}] 🏥 Health server on port ${process.env.PORT || 3001}`)
  })

run().catch(err => {
  console.error(`[${config.workerId}] Fatal error:`, err)
  process.exit(1)
})

async function shutdown() {
  console.log(`[${config.workerId}] 🛑 Shutting down...`)
  running = false
  if (browserHandler) await browserHandler.close()
  if (browser) await browser.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
