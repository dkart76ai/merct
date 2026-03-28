import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { ImageProcessor } from './image-processor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG = process.env.DEBUG || false

export class BrowserHandler {
  constructor(browser, config) {
    this.browser = browser
    this.config = config
    this.context = null
    this.page = null
    this.canvas = null
    this.code = null
    this.imageProcessor = new ImageProcessor()
    this.isInitialized = false
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath, fs.constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  async clearPopups() {
    console.log(`[${this.config.workerId}] Clearing popups...`)
    for (let i = 0; i < 5; i++) {
      // await this.canvas.press('Escape')

      await this.page.keyboard.press('Escape')
    }
  }

  async screenshot() {
    const client = await this.page.context().newCDPSession(this.page) // CDP=chrome devtools protocol
    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true // Captura directamente de la superficie de renderizado (GPU)
    })
    const screenshotBuffer = Buffer.from(data, 'base64')
    return screenshotBuffer
  }

  async closeScreen(times = 20, delay = 2500, captureScreenshotForDebug = false) {
    console.log(
      `[${this.config.workerId}] Found close button... sending escape to close the screen`
    )
    let attempts = times
    while (attempts-- > 0) {
      // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
      const screenshotBuffer = await this.screenshot()

      if (captureScreenshotForDebug) {
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_4_debug_shopping.png`
        )
        await fs.writeFile(debugPath, screenshotBuffer)
        console.log(
          `[${this.config.workerId}] ⚠️ shopping close button ${attempts} — debug screenshot saved to ${debugPath}`
        )
      }

      const result = await this.imageProcessor.detectCloseButton(screenshotBuffer)
      if (result.found) {
        console.log(
          `[${this.config.workerId}] Close button found at`,
          result.x,
          result.y,
          `(${(result.confidence * 100).toFixed(1)}%)`
        )
        // await this.canvas.click({ position: { x: result.x, y: result.y } })
        await this.page.keyboard.press('Escape')

        await this.page.waitForTimeout(delay)
        break
      } else {
        await this.page.waitForTimeout(delay)
      }
    }
  }

  async waitForSplashLoading(times = 300, delay = 1000, captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] Checking splash screen... `)
    let attempts = times
    while (attempts-- > 0) {
      // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
      const screenshotBuffer = await this.screenshot()

      if (captureScreenshotForDebug) {
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_1_debug_splash_loading.png`
        )
        await fs.writeFile(debugPath, screenshotBuffer)
        console.log(
          `[${this.config.workerId}] ⚠️ splash screen ${attempts}— debug screenshot saved to ${debugPath}`
        )
      }

      let isLoginScreen = false
      const loginInput = this.page.getByRole('textbox', { name: 'E-mail' })
      if (await loginInput.isVisible({ timeout: 5000 })) {
        isLoginScreen = true
      }

      const result = await this.imageProcessor.detectSplashLoading(screenshotBuffer)
      if (result.found && !isLoginScreen) {
        console.log(
          `[${this.config.workerId}] splash screen found at`,
          result.x,
          result.y,
          `(${(result.confidence * 100).toFixed(1)}%)`,
          '...waiting'
        )

        await this.page.waitForTimeout(delay)
      } else {
        break
      }
    }
  }

  async waitForLoading(times = 200, delay = 1000, captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] Checking loading screen... `)
    let attempts = times
    while (attempts-- > 0) {
      // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
      const screenshotBuffer = await this.screenshot()

      if (captureScreenshotForDebug) {
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_3_debug_loading.png`
        )
        await fs.writeFile(debugPath, screenshotBuffer)
        console.log(
          `[${this.config.workerId}] ⚠️ loading screen ${attempts}— debug screenshot saved to ${debugPath}`
        )
      }

      const result = await this.imageProcessor.detectLoading(screenshotBuffer)
      if (result.found) {
        console.log(
          `[${this.config.workerId}] loading screen found at`,
          result.x,
          result.y,
          `(${(result.confidence * 100).toFixed(1)}%)`,
          '...waiting'
        )

        await this.page.waitForTimeout(delay)
      } else {
        break
      }
    }
  }

  async closeVerifyAccount(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] checking verify account window...`)
    // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
    const screenshotBuffer = await this.screenshot()

    if (captureScreenshotForDebug) {
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_5_debug_verify_account.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer)
      console.log(
        `[${this.config.workerId}] ⚠️ verify account window — debug screenshot saved to ${debugPath}`
      )
    }

    for (let i = 0; i < 2; i++) {
      //TODO: remove loop
      const result = await this.imageProcessor.detectVerifyAccount(screenshotBuffer)
      if (result.found) {
        console.log(
          `[${this.config.workerId}] Verify account (reject button ${i}) found at`,
          result.x,
          result.y,
          `(${(result.confidence * 100).toFixed(1)}%)`
        )
        // await this.page.mouse.move(result.x, result.y)
        await this.page.mouse.click(result.x, result.y)
        // await this.canvas.click({ position: { x: result.x, y: result.y }, force: true }) //581, 572

        await this.page.waitForTimeout(4000)
      }
    }

    await this.page.keyboard.press('Escape')

    const screenshotBuffer2 = await this.screenshot()

    if (captureScreenshotForDebug) {
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_5_debug_verify_account_after.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer2)
      console.log(
        `[${this.config.workerId}] ⚠️ verify account window — debug screenshot saved to ${debugPath}`
      )
    }
  }

  async openWorldMap(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] Opening world map...`)
    // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
    const screenshotBuffer = await this.screenshot()

    if (captureScreenshotForDebug) {
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_6_debug_worldmap.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer)
      console.log(
        `[${this.config.workerId}] ⚠️ World map button  — debug screenshot saved to ${debugPath}`
      )
    }

    const result = await this.imageProcessor.detectMapaButton(screenshotBuffer)
    if (result.found) {
      console.log(
        `[${this.config.workerId}] World map button found at`,
        result.x,
        result.y,
        `(${(result.confidence * 100).toFixed(1)}%)`
      )
      // await this.page.mouse.move(result.x, result.y)
      // await this.canvas.click({ position: { x: result.x, y: result.y } }) //384,978
      await this.page.mouse.click(result.x, result.y)
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_6_debug_worldmap_button.png`
      )
      const result2 = await this.page.screenshot({
        path: debugPath,
        clip: { x: 384, y: 978, width: 300, height: 300 }
      })
      // await fs.writeFile(debugPath, screenshotBuffer)
      console.log(
        `[${this.config.workerId}] ⚠️ World map button found — debug screenshot saved to ${debugPath}`
      )

      await this.page.waitForTimeout(3500)

      if (captureScreenshotForDebug) {
        const screenshotBuffer2 = await this.screenshot()
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_6_debug_worldmap_after.png`
        )
        await fs.writeFile(debugPath, screenshotBuffer2)
        console.log(
          `[${this.config.workerId}] ⚠️ World map button  — debug screenshot saved to ${debugPath}`
        )
      }

      // await this.zoomIn()
    }
  }

  // async zoomIn() {
  //   // Zoom to 25%
  //   console.log(`[${this.config.workerId}] Setting zoom to 25%...`)
  //   for (let i = 0; i < 4; i++) await this.canvas.click({ position: { x: 1257, y: 924 } })
  // }

  async zoomingIn(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] zooming in ...`)
    // const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
    const screenshotBuffer = await this.screenshot()

    if (captureScreenshotForDebug) {
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_7_debug_zoomin.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer)
      console.log(`[${this.config.workerId}] ⚠️ zooming  — debug screenshot saved to ${debugPath}`)
    }

    const result = await this.imageProcessor.detectZoomIn(screenshotBuffer)
    if (result.found) {
      console.log(
        `[${this.config.workerId}] zoomin found at`,
        result.x,
        result.y,
        `(${(result.confidence * 100).toFixed(1)}%)`
      )
      for (let i = 0; i < 4; i++) {
        await this.page.mouse.click(result.x, result.y)
        // await this.canvas.click({ position: { x: result.x, y: result.y }, force: true }) //581, 572

        await this.page.waitForTimeout(5000)
      }
    }

    await this.page.keyboard.press('Escape')

    const screenshotBuffer2 = await this.screenshot()

    if (captureScreenshotForDebug) {
      const debugPath = path.join(
        process.cwd(),
        'debug',
        `${this.config.workerId}_7_debug_zoomin_after.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer2)
      console.log(`[${this.config.workerId}] ⚠️ zoomin — debug screenshot saved to ${debugPath}`)
    }
  }

  async initialize() {
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

    const authPath = path.join(process.cwd(), 'auth', this.config.accountFile)
    if (await this.fileExists(authPath)) {
      options.storageState = authPath
    }

    this.context = await this.browser.newContext(options)
    this.page = await this.context.newPage()

    // Forward browser console to Node.js stdout
    this.page.on('console', msg => {
      const text = msg.text()
      if (text.startsWith('MIO:')) {
        console.log(`[${this.config.workerId}] [browser] ${text}`)
      }
    })

    // Capture Sendbird App-ID and Api-Token from network requests
    this.sendbirdAppId = null
    this.sendbirdApiToken = null
    this.sendbirdUserId = null
    this.page.on('request', request => {
      const url = request.url()
      if (url.includes('.sendbird.com')) {
        // if (!this.sendbirdAppId) {
        const match = url.match(/api-([A-F0-9\-]+)\.sendbird\.com/i)
        if (match) {
          // this.sendbirdAppId = match[1]
          console.log('MIO: --------------------------------')
          console.log(`MIO: [${this.config.workerId}] 📡 Sendbird App-ID: ${this.sendbirdAppId}`)
          console.log('MIO: --------------------------------')
          console.log('MIO:', JSON.stringify(request.headers()))
          console.log('MIO: --------------------------------')
        }
        // }

        if (!this.sendbirdApiToken) {
          const token = request.headers()['access-token'] //['api-token']
          if (token) {
            this.sendbirdApiToken = token
            console.log('MIO: --------------------------------')
            console.log(
              `MIO: [${this.config.workerId}] 🔑 Sendbird Api-Token: ${this.sendbirdApiToken}`
            )
            console.log('MIO: --------------------------------')
          }
        }
        if (!this.sendbirdAppId) {
          const token = request.headers()['app-id']
          if (token) {
            this.sendbirdAppId = token
            console.log('MIO: --------------------------------')
            console.log(
              `MIO: [${this.config.workerId}] 🔑 Sendbird Api-Token: ${this.sendbirdApiToken}`
            )
            console.log('MIO: --------------------------------')
          }
        }
        if (!this.sendbirdUserId) {
          const match = url.match(/\/users\/([^/]+)\//)
          if (match) {
            this.sendbirdUserId = match[1]
            console.log(
              `MIO: [${this.config.workerId}] 👤 Sendbird User-ID: ${this.sendbirdUserId}`
            )
          }
        }
      }
    })

    // Capture Sendbird WebSocket
    const initialKeyword = this.config.keyword || null
    await this.page.addInitScript(keyword => {
      const OriginalWS = window.WebSocket
      window.WebSocket = class extends OriginalWS {
        constructor(url, protocols) {
          super(url, protocols)
          if (url.includes('sendbird')) {
            window.__sendbirdSocket = this
            window.__sendbirdChannelUrl = null
            window.__sendbirdChannelId = null
            window.__sendbirdKeyword = keyword
            // capture channel_url from messages matching the keyword
            this.addEventListener('message', event => {
              // capture user_id from login response
              if (event.data.startsWith('LOGI')) {
                try {
                  const json = JSON.parse(event.data.slice(4))
                  if (json.user_id) {
                    window.__sendbirdUserId = json.user_id
                    console.log('MIO: Sendbird User-ID captured:', json.user_id)
                  }
                  if (json.key) {
                    window.__sendbirdSessionKey = json.key
                    console.log('MIO: Sendbird Session-Key captured:', json.key)
                  }
                } catch {}
              }
              if (event.data.startsWith('MESG')) {
                if (!window.__sendbirdChannelUrl) {
                  try {
                    const json = JSON.parse(event.data.slice(4))
                    const kw = window.__sendbirdKeyword
                    const matches =
                      !kw || (json.message && json.message.toLowerCase().includes(kw.toLowerCase()))
                    if (json.channel_url && matches) {
                      window.__sendbirdChannelUrl = json.channel_url
                      window.__sendbirdChannelId = json.channel_id
                      console.log(
                        'MIO: Sendbird channel captured from keyword match:',
                        json.channel_url
                      )
                    } else {
                      console.log('MIO: nokey: Sendbird message received:', event.data)
                    }
                  } catch {}
                } else {
                  console.log('MIO: with/chan: Sendbird message received:', event.data)
                  const json = JSON.parse(event.data.slice(4))
                  if (json.message.toLowerCase().includes('p1.')) {
                    console.log('MIO: repling with: ', json.message.toUpperCase())
                    // this.sendChatMessage(json.message.toUpperCase())
                    // this.sendChatMessageREST('hello ', window.__sendbirdChannelUrl)
                  }
                }
              } else {
                console.log('MIO: nomesg: Sendbird message received: ', event.data)
              }
            })
            // fallback channel URL if no message received yet
            // window.__sendbirdChannelUrl = window.__sendbirdChannelUrl || 'sendbird_group_channel_XXXXXX_XXXXXXXX'
          }
        }
      }
    }, initialKeyword)

    // Block resources to speed up loading
    // await this.page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,pdf,mp4}', route => route.abort())
    await this.page.route('**/*.{woff,woff2,pdf,mp4}', route => route.abort())

    console.log(`[${this.config.workerId}] Loading game...`)
    await this.page.goto('https://totalbattle.com/es', { timeout: 70000 })
    await this.page.waitForTimeout(60000) //splash screen
    await this.waitForSplashLoading(300, 1000, DEBUG)

    // Handle login if needed
    const loginInput = this.page.getByRole('textbox', { name: 'E-mail' })
    if (await loginInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[${this.config.workerId}] Logging in...`)
      await this.page.locator('#registration').getByText('Iniciar sesión').click()
      await loginInput.fill(this.config.accountUser)
      await this.page.getByRole('textbox', { name: 'Contraseña' }).fill(this.config.accountPwd)
      await this.page.getByRole('button', { name: 'Iniciar sesión' }).click()

      await this.page.waitForTimeout(10000)

      // check if OTP is needed
      while (
        await this.page
          .locator('#otp_2fa_login')
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        console.log(`[${this.config.workerId}] ⚠️ OTP window found`)
        //repeat OTP check until the user enters the code
        while (!this.code) {
          console.log(`[${this.config.workerId}] ⚠️ requesting OTP code...`)
          if (
            await this.page
              .getByRole('link', { name: 'Reenviar' })
              .isVisible({ timeout: 5000 })
              .catch(() => false)
          ) {
            await this.page.getByRole('link', { name: 'Reenviar' }).click()
            console.log(`[${this.config.workerId}] ⚠️ request OTP code sent`)
          }

          await this.page.waitForTimeout(60000)
        }

        if (!!this.code) {
          console.log(`[${this.config.workerId}] ⚠️ entering OTP code... ${this.code}`)
          const inputs = this.page.getByRole('textbox')

          await inputs.first().click()
          for (const char of this.code) {
            // Enfocamos el primero y luego simplemente enviamos las teclas
            // El auto-tab se encargará de mover el cursor por nosotros
            await this.page.keyboard.press(char)
            await this.page.waitForTimeout(200)
          }
          await this.page.getByRole('button', { name: 'Iniciar sesión' }).click()

          //clear code
          this.code = null
        }
        await this.page.waitForTimeout(10000)

        // if the code repeats, keep inside while otp screen, means the code is wrong
      }

      try {
        await this.page.locator('canvas').waitFor({ state: 'visible', timeout: 90000 })

        // await this.page.waitForSelector('canvas', { timeout: 90000 })
      } catch (e) {
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_2_debug_login.png`
        )
        const screenshotBuffer = await this.page.screenshot({ animations: 'disabled' })
        await fs.writeFile(debugPath, screenshotBuffer)
        console.log(
          `[${this.config.workerId}] ⚠️ login error — debug screenshot saved to ${debugPath}`
        )
      }

      await this.context.storageState({ path: authPath })
    }

    console.log(`[${this.config.workerId}] Waiting for Unity to load...`)
    await this.page.waitForTimeout(10000) // Wait for Unity to load, shopping ads
    this.canvas = this.page.locator('canvas')

    await this.waitForLoading(200, 1000, DEBUG)

    // Clear popups
    await this.page.waitForTimeout(2000)
    await this.closeScreen(20, 2500, DEBUG)
    await this.page.waitForTimeout(5000)
    await this.closeVerifyAccount(DEBUG)
    await this.page.waitForTimeout(2000)
    await this.clearPopups()
    await this.openWorldMap(DEBUG)
    await this.page.waitForTimeout(4000)
    await this.clearPopups()
    await this.page.waitForTimeout(2000)
    await this.zoomingIn(DEBUG)
    await this.page.waitForTimeout(2000)

    // monitor for waiting delay
    await page.evaluate(() => {
      window.unityStatus = {
        isStable: false,
        frameHistory: [],
        lastTime: performance.now()
      }

      function checkStability(currentTime) {
        const delta = currentTime - window.unityStatus.lastTime
        window.unityStatus.lastTime = currentTime

        // Guardamos los últimos 10 deltas de tiempo
        window.unityStatus.frameHistory.push(delta)
        if (window.unityStatus.frameHistory.length > 10) window.unityStatus.frameHistory.shift()

        // Calculamos el promedio de los últimos 10 frames
        const avg = window.unityStatus.frameHistory.reduce((a, b) => a + b, 0) / 10

        // ESTABILIDAD: Si la diferencia entre el frame actual y el promedio es mínima (< 2ms)
        // y tenemos suficientes frames para promediar.
        window.unityStatus.isStable =
          window.unityStatus.frameHistory.length === 10 && Math.abs(delta - avg) < 2

        requestAnimationFrame(checkStability)
      }
      requestAnimationFrame(checkStability)
    })

    this.isInitialized = true
    console.log(`[${this.config.workerId}] ✅ Browser initialized and ready`)
  }

  setWorkerCode(code) {
    this.code = code
    console.log(`[${this.config.workerId}] OTP code received on BHdlr: ${code}`)
  }

  async setKeyword(keyword) {
    this.keyword = keyword
    if (this.page) {
      await this.page.evaluate(kw => {
        window.__sendbirdKeyword = kw
      }, keyword)
      console.log(`[${this.config.workerId}] 🔑 Keyword set to: ${keyword}`)
    }
  }

  async scanCoordinate(k, x, y) {
    if (!this.isInitialized) {
      throw new Error('Browser not initialized')
    }

    // Clear any popups
    let start = Date.now()
    for (let i = 0; i < 5; i++) {
      await this.page.keyboard.press('Escape')
    }
    console.log(`[${config.workerId}] scanCoordinate:clearPopups took ${Date.now() - start}ms`)

    await this.page.waitForTimeout(10)

    // A. Forzamos estado inestable antes del clic para evitar falsos positivos
    await page.evaluate(() => {
      window.unityStatus.isStable = false
      window.unityStatus.frameHistory = []
    })

    // Open search (magnifying glass)
    await this.canvas.click({ position: { x: 87, y: 757 } })
    await this.page.waitForTimeout(200)

    // Enter coordinates
    const inputs = [
      { x: 586, val: k },
      { x: 684, val: x },
      { x: 787, val: y }
    ]

    start = Date.now()
    for (const input of inputs) {
      await this.canvas.click({ clickCount: 1, position: { x: input.x, y: 446 } })
      // Clear current input
      for (let i = 0; i < 4; i++) await this.canvas.press('Backspace', { delay: 0 })
      await this.page.keyboard.type(input.val.toString(), { delay: 0 })
    }
    console.log(`[${config.workerId}] scanCoordinate:inputs took ${Date.now() - start}ms`)

    // Click GO button
    start = Date.now()
    await this.canvas.click({ position: { x: 680, y: 490 } })

    // await this.page.waitForTimeout(500) // Wait for camera to move

    // C. ESPERA CRÍTICA:
    // Esperamos a que 'isStable' sea TRUE.
    // Playwright consultará este valor en el contexto del navegador.
    await page.waitForFunction(() => window.unityStatus.isStable === true, {
      timeout: 30000,
      polling: 'raf' // Esto hace que Playwright chequee sincronizado con el renderizado
    })
    console.log(`[${config.workerId}] scanCoordinate:go button took ${Date.now() - start}ms`)

    // Take screenshot
    // const screenshotBuffer = await this.page.screenshot({
    //   animations: 'disabled',
    //   type: 'png'
    // })

    start = Date.now()
    const screenshotBuffer = await this.screenshot()

    this.lastScreenshot = screenshotBuffer

    // Process with OpenCV
    const result = await this.imageProcessor.detectMercenario(screenshotBuffer)
    console.log(`[${config.workerId}] scanCoordinate:detectMercenario took ${Date.now() - start}ms`)

    // if merc found on screeen, move mouse to that position, to capture game coordinates from bottom left,
    // and convert with OCR to coordinates
    if (result.found) {
      await this.page.mouse.move(result.x, result.y)
      await this.page.waitForTimeout(100) // Wait for camera to move

      // const screenshotBuffer = await this.page.screenshot({
      //   animations: 'disabled',
      //   type: 'png'
      // })

      // this.lastScreenshot = screenshotBuffer

      // use tesseract to get coordinates from bottom left of screenshot
      start = Date.now()
      const ocrResult = await this.imageProcessor.detectCoordinates(
        screenshotBuffer,
        this.page.viewportSize()
      )
      console.log(`[${config.workerId}] scanCoordinate:OCRCoordinates took ${Date.now() - start}ms`)

      result.text = ocrResult
    }
    return result
  }

  async sendChatMessage(message, coord = null) {
    try {
      const result = await this.page.evaluate(
        ({ msg, coord }) => {
          if (!window.__sendbirdSocket || window.__sendbirdSocket.readyState !== WebSocket.OPEN) {
            return { success: false, error: 'Sendbird WebSocket not connected' }
          }
          if (!window.__sendbirdChannelUrl) {
            return { success: false, error: 'Channel URL not captured yet' }
          }

          let messageText = msg
          let data = ''

          if (coord) {
            messageText = `${msg} /%0%/`
            data = JSON.stringify({
              subs: {
                '/%0%/': {
                  type: 'coord',
                  entryType: 'poi', //'tile',
                  x: coord.x,
                  y: coord.y,
                  realmId: coord.k,
                  staticId: 400, //6,
                  name: 'Mercenary Exchange',
                  v: 1
                }
              }
            })
          }

          const requestId = 'rq-' + crypto.randomUUID()
          const payload = JSON.stringify({
            channel_Id: window.__sendbirdChannelId,
            scrap_id: '',
            user: {
              name: 'Moginn',
              image: '',
              require_auth_for_profile_image: false,
              guest_id: 'tb:67606149',
              id: 411122123,
              role: '',
              metadata: {
                color: '0',
                hideTitlesTs: '0',
                memberInfo: '115,11500022611,0,0,0,',
                titles: ''
              },
              is_bot: false,
              is_ai_bot: false,
              is_active: true,
              is_blocked_by_me: false,
              friend_name: null,
              friend_discovery_key: null
            },
            silent: false,
            check_reactions: false,
            is_op_msg: false,
            is_guest_msg: true,
            data,
            sts: Date.now(),
            channel_url: window.__sendbirdChannelUrl,
            channel_type: 'group',
            is_super: true,
            mention_type: 'users',
            mentioned_users: [],
            message_events: {
              send_push_notification: 'receivers',
              update_unread_count: true,
              update_mention_count: true,
              update_last_message: true
            },
            message_retention_hour: -1,
            request_id: requestId,
            translations: {},
            custom_type: 'user',
            is_removed: false,
            last_updated_at: Date.now(),
            message: messageText,
            // msg_id:1111111,
            ts: Date.now(),
            mention_type: 'users',
            mentioned_user_ids: []
          })
          window.__sendbirdSocket.send('MESG' + payload)
          return { success: true }
        },
        { msg: message, coord }
      )
      console.log(`[${this.config.workerId}] 💬 Chat message sent: ${message}`, result)
      return result
    } catch (error) {
      console.error(`[${this.config.workerId}] ❌ Failed to send chat message:`, error.message)
      return { success: false, error: error.message }
    }
  }

  async sendChatMessageREST(message, channelUrl) {
    if (!this.sendbirdAppId || !this.sendbirdApiToken) {
      console.log(`MIO: [${this.config.workerId}] ⚠️ Sendbird REST credentials not captured yet`)
      return { success: false, error: 'Credentials not captured' }
    }
    const url =
      channelUrl || (this.page && (await this.page.evaluate(() => window.__sendbirdChannelUrl)))
    const userId =
      this.sendbirdUserId ||
      (this.page && (await this.page.evaluate(() => window.__sendbirdUserId)))
    const sessionKey = this.page && (await this.page.evaluate(() => window.__sendbirdSessionKey))
    const apiToken = sessionKey || this.sendbirdApiToken
    if (!url) return { success: false, error: 'Channel URL not available' }
    if (!userId) return { success: false, error: 'User ID not captured yet' }
    if (!apiToken) return { success: false, error: 'No API token available' }
    try {
      const res = await fetch(
        `https://api-${this.sendbirdAppId}.sendbird.com/v3/group_channels/${encodeURIComponent(url)}/messages`,
        {
          method: 'POST',
          headers: {
            'Api-Token': apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message_type: 'MESG',
            user_id: userId,
            message
          })
        }
      )
      const data = await res.json()
      console.log(`MIO: [${this.config.workerId}] 💬 REST message sent:`, data.message_id || data)
      return { success: true, data }
    } catch (error) {
      console.error(`MIO: [${this.config.workerId}] ❌ REST message failed:`, error.message)
      return { success: false, error: error.message }
    }
  }

  async reinitialize() {
    this.isInitialized = false
    if (this.context) await this.context.close().catch(() => {})
    this.context = null
    this.page = null
    this.canvas = null
    await this.initialize()
  }

  async close() {
    await this.imageProcessor.terminate()
    if (this.context) {
      await this.context.close()
    }
  }
}
