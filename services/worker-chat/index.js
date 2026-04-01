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

async function notifyDiscord(k, x, y, texto) {
  if (!DISCORD_WEBHOOK) return
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: ` K:${k} X:${x} Y:${y} (${texto})`
      })
    })
  } catch (error) {
    console.error(`[${config.workerId}] Discord notify failed:`, error.message)
  }
}
async function screenshot() {
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

  // Capture Sendbird credentials from WebSocket
  await page.addInitScript(() => {
    const OriginalWS = window.WebSocket
    window.WebSocket = class extends OriginalWS {
      constructor(url, protocols) {
        super(url, protocols)
        if (url.includes('sendbird')) {
          // capture appId from WebSocket URL: wss://ws-{APP_ID}.sendbird.com
          if (!window.__sbAppId) {
            const match = url.match(/ws-([a-f0-9\-]+)\.sendbird\.com/i)
            if (match) {
              window.__sbAppId = match[1].toUpperCase()
              console.log('MIO: Sendbird App-ID captured:', window.__sbAppId)
            }
          }
          this.addEventListener('message', event => {
            if (event.data.startsWith('LOGI')) {
              try {
                const json = JSON.parse(event.data.slice(4))
                if (json.user_id) window.__sbUserId = json.user_id
                if (json.key) window.__sbSessionKey = json.key
                console.log('MIO: LOGI captured userId:', json.user_id)
                console.log('MIO: LOGI captured sessionKey:', json.key)
              } catch {}
            }
          })
        }
      }
    }
  })

  console.log(`[${config.workerId}] Loading game...`)
  await page.goto('https://totalbattle.com/es', { timeout: 70000 })
  await page.waitForTimeout(90000)

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

  // Wait for Sendbird to connect and LOGI to be received
  console.log(`[${config.workerId}] Waiting for Sendbird credentials...`)
  await page.waitForFunction(
    () => !!window.__sbUserId && !!window.__sbSessionKey && !!window.__sbAppId,
    { timeout: 60000 }
  )

  const appId = await page.evaluate(() => window.__sbAppId)

  console.log(`[${config.workerId}] ✅ Sendbird credentials captured`)

  // Initialize Sendbird SDK once
  await page.evaluate(async () => {
    const sb = WebglSendbirdApi.SendbirdChat.init({
      appId: window.__sbAppId,
      modules: [new WebglSendbirdApi.GroupChannelModule()]
    })

    //list all channels the user have access to
    const query = sb.groupChannel.createMyGroupChannelListQuery()
    const channels = await query.next()
    console.log('MIO: available chat channels')
    channels.forEach(c => console.log(`Nombre: ${c.name} | URL: ${c.url}`))

    await sb.connect(window.__sbUserId, window.__sbSessionKey)
    window.__sb = sb
    console.log('MIO: Sendbird SDK initialized and connected')
    console.log(`config: 💬
     sbAppId:${window.__sbAppId}
     sbUserId:${window.__sbUserId}
     sbSessionKey:${window.__sbSessionKey}`)
  })

  await sendMessage(100, 200, 300)
  await notifyDiscord(100, 200, 300, 'Prueba de notificacion')
  return { appId }
}

async function sendMessage(k, x, y) {
  const channelUrl = config.channelUrl
  if (!channelUrl) {
    console.log(`[${config.workerId}] ⚠️ No channel URL configured`)
    return
  }

  const data = JSON.stringify({
    subs: {
      '/%0%/': {
        type: 'coord',
        entryType: 'poi',
        x,
        y,
        realmId: k,
        staticId: 400,
        name: 'Mercenary Exchange',
        v: 1
      }
    }
  })

  const result = await page.evaluate(
    async ({ channelUrl, data }) => {
      try {
        const channel = await window.__sb.groupChannel.getChannel(channelUrl)
        const msg = await channel.sendUserMessage({
          message: '/%0%/',
          customType: 'user',
          data
        })
        return { success: true, messageId: msg.messageId }
      } catch (e) {
        return { success: false, error: e.message }
      }
    },
    { channelUrl, data }
  )

  console.log(`[${config.workerId}] 💬 Message sent K:${k} X:${x} Y:${y}`, result)
}

async function run() {
  await initPage()

  while (running) {
    const item = await redis.blpop(REDIS_KEYS.CHAT_PENDING_LIST, 5)
    if (!item) continue

    const { k, x, y, confidence, text, timestamp } = JSON.parse(item[1])
    console.log(`[${config.workerId}] 📤 Sending chat for K:${k} X:${x} Y:${y} - ${text}`)

    try {
      await sendMessage(k, x, y)
      await notifyDiscord(k, x, y, text)
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
