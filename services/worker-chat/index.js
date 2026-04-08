import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'

import { chromium } from 'playwright'
import { getRedisClient } from '../shared/redis-client.js'
import { REDIS_KEYS } from '../shared/constants.js'

const redis = getRedisClient()
let page = null
let context = null
let running = true

const config = {
  headless: process.env.HEADLESS === 'true',
  workerId: process.env.WORKER_ID || 'worker-chat',
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD,
  channelUrl: process.env.CHAT_CHANNEL_URL || ''
}

console.log(`💬 Chat worker starting: ${config.workerId}`)

const DEBUG = process.env.DEBUG || false
let OTP = process.env.OTP || ''
const DEBUG_PATH = path.join(process.cwd(), 'debug')
fs.mkdirSync(DEBUG_PATH, { recursive: true })

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || ''

async function notifyDiscord(texto = '', coord = null) {
  if (!DISCORD_WEBHOOK) return
  try {
    let message = texto
    if (coord) {
      message = `K:${coord.k} X:${coord.x} Y:${coord.y} (${texto})`
    }
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message
      })
    })
  } catch (error) {
    console.error(`[${config.workerId}] Discord notify failed:`, error.message)
  }
}

async function screenshot(page) {
  if (!page) return

  const client = await page.context().newCDPSession(page) // CDP=chrome devtools protocol
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true // Captura directamente de la superficie de renderizado (GPU)
  })
  const screenshotBuffer = Buffer.from(data, 'base64')
  return screenshotBuffer
}

async function initPage() {
  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--mute-audio',
      '--use-gl=egl',
      '--enable-webgl',
      '--ignore-gpu-blocklist'
    ]
  })

  const options = {
    screen: { width: 1360, height: 1024 },
    viewport: { width: 1360, height: 1024 },
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="125", "Not(A:Brand";v="99", "Google Chrome";v="125"' // Remove "HeadlessChrome"
    }
  }

  const authPath = path.join(process.cwd(), 'auth', 'chatsession.json')
  if (await fileExists(authPath)) {
    options.storageState = authPath
  }

  context = await browser.newContext(options)

  page = await context.newPage()

  // Forward browser console
  page.on('console', msg => {
    const text = msg.text()
    if (text.startsWith('MIO:')) console.log(`[${config.workerId}] [browser] ${text}`)
  })

  // Patch Triumph.framework.js to expose SendBirdHelper globally
  await page.route('**/Triumph.framework.js', async route => {
    try {
      const response = await route.fetch()
      let body = await response.text()
      body = body.replace(
        'var SendBirdHelper = {',
        'var SendBirdHelper = window.SendBirdHelper = {'
      )
      await route.fulfill({ response, body })
      console.log(`[${config.workerId}] 🔧 Triumph.framework.js patched`)
    } catch (e) {
      console.error(`[${config.workerId}] Failed to patch framework:`, e.message)
      await route.continue()
    }
  })

  console.log(`[${config.workerId}] Loading game...`)
  await page.goto('https://totalbattle.com/es', { timeout: 70000 })
  await page.waitForTimeout(120000)

  // Login if needed
  const loginInput = page.getByRole('textbox', { name: 'E-mail' })
  if (await loginInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`[${config.workerId}] Logging in...`)
    await page.locator('#registration').getByText('Iniciar sesión').click()
    await loginInput.fill(config.accountUser)
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(config.accountPwd)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    await page.waitForTimeout(10000)

    // check OTP
    if (
      await page
        .locator('#otp_2fa_login')
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      console.log(`[${config.workerId}] ⚠️ OTPcode =${OTP}$`)

      OTP = OTP.trim()
      if (!OTP) {
        console.log(`[${config.workerId}] ⚠️ requesting OTP code...`)
        if (
          await page
            .getByRole('link', { name: 'Reenviar' })
            .isVisible({ timeout: 5000 })
            .catch(() => false)
        ) {
          await page.getByRole('link', { name: 'Reenviar' }).click()
          console.log(`[${config.workerId}] ⚠️ request OTP code sent`)
        }
      } else {
        console.log(`[${config.workerId}] ⚠️ entering OTP code... ${OTP}`)
        const inputs = page.getByRole('textbox')

        await inputs.first().click()
        for (const char of OTP) {
          // Enfocamos el primero y luego simplemente enviamos las teclas
          // El auto-tab se encargará de mover el cursor por nosotros
          await page.keyboard.press(char)
          await page.waitForTimeout(200)
        }
        await page.getByRole('button', { name: 'Iniciar sesión' }).click()

        //clear OTP
        OTP = null

        await page.waitForTimeout(10000)
      }
    } else {
      console.log(`[${config.workerId}] ⚠️ no OTP required`)
    }
  }

  await page.waitForTimeout(20000)

  // await page.locator('canvas').waitFor({ state: 'visible', timeout: 90000 })
  try {
    await page.locator('canvas').waitFor({ state: 'visible', timeout: 90000 })
  } catch (e) {
    const debugPath = path.join(process.cwd(), 'debug', `${config.workerId}_1_debug_login.png`)
    const screenshotBuffer = await page.screenshot({ animations: 'disabled', path: debugPath })
    // fs.writeFileSync(debugPath, screenshotBuffer)
    console.log(`[${config.workerId}] ⚠️ login error — debug screenshot saved to ${debugPath}`)
  }

  await context.storageState({ path: authPath })

  // Wait for SendBirdHelper to be ready (game initializes it on login)
  console.log(`[${config.workerId}] Waiting for SendBirdHelper...`)
  await page.waitForFunction(() => !!window.SendBirdHelper?.sb, { timeout: 120000 })
  console.log(`[${config.workerId}] SendBirdHelper ready`)
  await sendMessage('hello')
  await notifyDiscord('olleh')
  return { appId }
}

/*
MESG{"channel_url":"sendbird_group_channel_410194735_97bcbeb14fc041a2c9c680d4983eb9c9606b3bf2",
"message":"Deyernus: /%0%/",
"data":"{\"subs\":{\"/%0%/\":{\"type\":\"coord\",
\"entryType\":\"poi\",
\"x\":200,
\"y\":300,
\"realmId\":100
\"staticId\":400
\"name\":\"Mercenary Exchange\"
\"v\":1}}}"
"custom_type":"user"
"mention_type":"users"
"mentioned_user_ids":[],
"reply_to_channel":false,
"req_id":"rq-c50a20e6-216f-40fc-b1cf-54fc6ceb64d2",
"pin_message":false}


MESG{"channel_url":"sendbird_group_channel_410194735_97bcbeb14fc041a2c9c680d4983eb9c9606b3bf2",
"message":"asdf",
"data":"",
"custom_type":"user",
"mention_type":"users",
"mentioned_user_ids":[],
"reply_to_channel":false,
"req_id":"rq-d660ef43-0a41-4bba-8592-17d69c4b680a",
"pin_message":false}


*/
async function sendMessage(msg = '', coord = null) {
  const channelUrl = config.channelUrl
  if (!channelUrl) {
    console.log(`[${config.workerId}] ⚠️ No channel URL configured`)
    return
  }

  let data = ''
  let message = msg
  if (!!coord) {
    data = JSON.stringify({
      subs: {
        '/%0%/': {
          type: 'coord',
          entryType: 'poi',
          x: coord?.x ?? 0,
          y: coord?.y ?? 0,
          realmId: coord?.k ?? 0,
          staticId: 400,
          name: 'Mercenary Exchange',
          v: 1
        }
      }
    })
    message = '/%0%/'
  }

  const result = await page.evaluate(
    async ({ channelUrl, data, message }) => {
      try {
        // use game's own SendBirdHelper — no new connection needed
        if (!window.SendBirdHelper?.sb) {
          return { success: false, error: 'SendBirdHelper not ready' }
        }
        // find channel in existing list or fetch it
        let channel = window.SendBirdHelper.channelsList.find(c => c.url === channelUrl)
        if (!channel) {
          channel = await window.SendBirdHelper.sb.groupChannel.getChannel(channelUrl)
        }
        const msg = await channel.sendUserMessage({
          message,
          customType: 'user',
          data
        })
        return { success: true, messageId: msg.messageId }
      } catch (e) {
        return { success: false, error: e.message }
      }
    },
    { channelUrl, data, message }
  )

  console.log(`[${config.workerId}] 💬 Message sent `, result)
}

async function run() {
  await initPage()

  while (running) {
    const item = await redis.blpop(REDIS_KEYS.CHAT_PENDING_LIST, 5)
    if (!item) continue

    const { k, x, y, confidence, text, timestamp } = JSON.parse(item[1])
    console.log(`[${config.workerId}] 📤 Sending chat for K:${k} X:${x} Y:${y} - ${text}`)

    try {
      await sendMessage('', { k, x, y })
      await notifyDiscord(text, { k, x, y })
    } catch (error) {
      console.error(`[${config.workerId}] ❌ Failed to send:`, error.message)
    }
  }
}

run().catch(err => {
  console.error(`[${config.workerId}] Fatal error:`, err)
  process.exit(1)
})

async function shutdown() {
  console.log(`[${config.workerId}] 🛑 Shutting down...`)
  running = false
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
