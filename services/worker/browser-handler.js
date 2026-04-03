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

  async openGoToCoords(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] GoToCoords window...`)

    // use cached position if available
    if (this.cachedGoToCoordPos) {
      await this.page.mouse.click(this.cachedGoToCoordPos.x, this.cachedGoToCoordPos.y)

      return this.cachedGoToCoordPos
    }

    const screenshotBuffer = await this.screenshot()

    const result = await this.imageProcessor.detectGotoCoordButton(screenshotBuffer)
    if (result.found) {
      console.log(
        `[${this.config.workerId}] go to coords button found at`,
        result.x,
        result.y,
        `(${(result.confidence * 100).toFixed(1)}%)`
      )

      await this.page.mouse.click(result.x, result.y)
      this.cachedGoToCoordPos = result

      if (captureScreenshotForDebug) {
        // const screenshotBuffer2 = await this.screenshot()
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_debug_gotocoordbutton.png`
        )
        // await fs.writeFile(debugPath, screenshotBuffer2)

        await this.page.screenshot({
          path: debugPath,
          clip: { x: result.x - 10, y: result.y - 10, width: 40, height: 40 }
        })
        console.log(
          `[${this.config.workerId}] ⚠️ go to coords button  — debug screenshot saved to ${debugPath}`
        )
      }
    } else {
      console.log(`[${this.config.workerId}] go to coords button NOT found`)
    }

    return result
  }

  async getKCoordPosition(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] KCoord Position window...`)

    // use cached position if available
    if (this.cachedKCoordPosition) {
      return this.cachedKCoordPosition
    }

    const screenshotBuffer = await this.screenshot()

    const result = await this.imageProcessor.detectCoordsInput(screenshotBuffer)
    if (result.found) {
      console.log(
        `[${this.config.workerId}] KCoordPosition found at`,
        result.x,
        result.y,
        `(${(result.confidence * 100).toFixed(1)}%)`
      )
      this.cachedKCoordPosition = result

      if (captureScreenshotForDebug) {
        // const screenshotBuffer2 = await this.screenshot()
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_debug_KCoordPosition.png`
        )
        // await fs.writeFile(debugPath, screenshotBuffer2)
        await this.page.screenshot({
          path: debugPath,
          clip: { x: result.x + 25, y: result.y, width: 340, height: 80 }
        })
        console.log(
          `[${this.config.workerId}] ⚠️ go to coords button  — debug screenshot saved to ${debugPath}`
        )
      }
    } else {
      console.log(`[${this.config.workerId}] KCoordPosition not found`)
    }
    return result
  }

  async detectCurrentState(screenshotBuffer) {
    const [splash, loading, closeBtn, verifyAccount, mapaButton, cityButton, loginInput] =
      await Promise.all([
        this.imageProcessor.detectSplashLoading(screenshotBuffer),
        this.imageProcessor.detectLoading(screenshotBuffer),
        this.imageProcessor.detectCloseButton(screenshotBuffer),
        this.imageProcessor.detectVerifyAccount(screenshotBuffer),
        this.imageProcessor.detectMapaButton(screenshotBuffer),
        this.imageProcessor.detectCityButton(screenshotBuffer),

        this.page
          .getByRole('textbox', { name: 'E-mail' })
          .isVisible({ timeout: 500 })
          .catch(() => false)
      ])

    if (splash.found) return { state: 'SPLASH', ...splash }
    if (loginInput) return { state: 'LOGIN', ...loginInput }

    // if (loading.found)     return{state: 'LOADING',...loading}
    if (closeBtn.found) return { state: 'CLOSE', ...closeBtn }
    if (verifyAccount.found) return { state: 'VERIFY_ACCOUNT', ...verifyAccount }
    if (mapaButton.found) return { state: 'MAPA', ...mapaButton }
    if (cityButton.found) return { state: 'CITY', ...cityButton }

    return { state: 'UNKNOWN', found: false }
  }

  async handleLogin() {
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
        // console.log(`[${this.config.workerId}] ⚠️ OTP window found`)
        //repeat OTP check until the user enters the code
        while (!this.code) {
          // console.log(`[${this.config.workerId}] ⚠️ requesting OTP code...`)
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
  }

  async handleVerifyAccount(result) {
    console.log(
      `[${this.config.workerId}] Verify account (reject button) found at`,
      result.x,
      result.y,
      `(${(result.confidence * 100).toFixed(1)}%)`
    )
    await this.page.mouse.click(result.x, result.y)
    await this.page.waitForTimeout(1000)
  }

  async handleMapa(result) {
    console.log(
      `[${this.config.workerId}] World map button found at`,
      result.x,
      result.y,
      `(${(result.confidence * 100).toFixed(1)}%)`
    )

    await this.page.mouse.click(result.x, result.y)

    await this.page.waitForTimeout(3500)
  }

  async waitForState(
    targetState,
    timeout = 1000 * 60 * 20 /*20 minutes */,
    captureScreenshotForDebug = false
  ) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const screenshot = await this.screenshot()
      const state = await this.detectCurrentState(screenshot)
      console.log(
        `[${this.config.workerId}] State: ${state.state} (${(state.confidence * 100).toFixed(1)}%)`
      )

      if (captureScreenshotForDebug) {
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_${state.state}.png`
        )
        await fs.writeFile(debugPath, screenshot)
        console.log(
          `[${this.config.workerId}] ⚠️ ${state.state} — debug screenshot saved to ${debugPath}`
        )
      }

      switch (state.state) {
        case 'SPLASH':
          await this.page.waitForTimeout(1000)
          break
        case 'LOGIN':
          // if (targetState === 'LOGIN') return state
          await this.handleLogin()
          break

        case 'LOADING':
          await this.page.waitForTimeout(1000)
          break
        case 'CLOSE':
          console.log(
            `[${this.config.workerId}] Close button found at`,
            state.x,
            state.y,
            `(${(state.confidence * 100).toFixed(1)}%)`
          )
          await this.page.keyboard.press('Escape')
          await this.page.waitForTimeout(500)
          break
        case 'VERIFY_ACCOUNT':
          // if (targetState === 'VERIFY_ACCOUNT') return state
          await this.handleVerifyAccount(state)
          break
        case 'MAPA':
          // if (targetState === 'MAPA') return state
          await this.handleMapa(state)
          break
        case 'CITY':
          if (targetState === 'CITY') return state
          break
      }

      if (state.state === targetState) return state
      await this.page.waitForTimeout(500)
      await this.clearPopups()
    }
    throw new Error(`Timeout waiting for state: ${targetState}`)
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
    await this.context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Forward browser console to Node.js stdout
    this.page.on('console', msg => {
      const text = msg.text()
      if (text.startsWith('MIO:')) {
        console.log(`[${this.config.workerId}] [browser] ${text}`)
      }
    })

    // Block resources to speed up loading
    // await this.page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,pdf,mp4}', route => route.abort())
    await this.page.route('**/*.{woff,woff2,pdf,mp4}', route => route.abort())

    console.log(`[${this.config.workerId}] Loading game...`)
    await this.page.goto('https://totalbattle.com/es', { timeout: 70000 })
    await this.page.waitForTimeout(60000) //splash screen

    const state = await this.waitForState('CITY', 1000 * 60 * 20 /*20 minutes */, DEBUG)

    this.canvas = this.page.locator('canvas')

    await this.clearPopups()
    await this.page.waitForTimeout(2000)

    await this.zoomingIn(DEBUG)
    await this.page.waitForTimeout(2000)

    this.isInitialized = true
    console.log(`[${this.config.workerId}] ✅ Browser initialized and ready`)
  }

  setWorkerCode(code) {
    this.code = code
    console.log(`[${this.config.workerId}] OTP code received on BHdlr: ${code}`)
  }

  async inputData(value) {
    await this.page.keyboard.press('End', { delay: 10 })
    await this.page.waitForTimeout(10)
    for (let i = 0; i < 3; i++) await this.page.keyboard.press('Backspace', { delay: 0 })
    // await this.page.evaluate(t => navigator.clipboard.writeText(t), value.toString())
    // await this.page.keyboard.press('Control+V') //se come los numeros

    // await this.page.keyboard.type(value.toString()) //lento

    for (const caracter of value.toString()) {
      await this.page.keyboard.press(caracter, { delay: 0 })
    }
  }

  async scanCoordinate(k, x, y) {
    if (!this.isInitialized) {
      throw new Error('Browser not initialized')
    }

    let start = Date.now()

    // Open search (magnifying glass)
    // await this.page.mouse.click(95, 787)
    await this.openGoToCoords(DEBUG)
    await this.page.waitForTimeout(200)
    console.log(`[${this.config.workerId}] scanCoordinate:search opened`)

    start = Date.now()
    const KCoordPosition = await this.getKCoordPosition(DEBUG)
    if (KCoordPosition.found) {
      // if (DEBUG) {
      //   try {
      //     const debugPath = path.join(process.cwd(), 'debug', `${this.config.workerId}_inputs.png`)
      //     await this.page.screenshot({
      //       path: debugPath,
      //       clip: { x: KCoordPosition.x - 20, y: KCoordPosition.y - 20, width: 300, height: 60 }
      //     })
      //     console.log(`[${this.config.workerId}] screenshot saved: ${debugPath}`)
      //   } catch (e) {
      //     console.error(`[${this.config.workerId}] screenshot failed:`, e.message)
      //   }

      // await this.page.screenshot({
      //   path: path.join(process.cwd(), 'debug', `${this.config.workerId}_Kinput.png`),
      //   clip: { x: KCoordPosition.x + 40, y: KCoordPosition.y, width: 300, height: 60 }
      // })
      //   await this.page.screenshot({
      //     path: path.join(process.cwd(), 'debug', `${this.config.workerId}_Xinput.png`),
      //     clip: { x: KCoordPosition.x + 25 + 120, y: KCoordPosition.y, width: 300, height: 60 }
      //   })
      //   await this.page.screenshot({
      //     path: path.join(process.cwd(), 'debug', `${this.config.workerId}_Yinput.png`),
      //     clip: { x: KCoordPosition.x + 25 + 210, y: KCoordPosition.y, width: 300, height: 60 }
      //   })
      //   await this.page.screenshot({
      //     path: path.join(process.cwd(), 'debug', `${this.config.workerId}_gobutton.png`),
      //     clip: { x: KCoordPosition.x + 138, y: KCoordPosition.y + 45, width: 300, height: 60 }
      //   })
      // }
      //--

      await this.page.mouse.click(KCoordPosition.x + 40, KCoordPosition.y)
      await this.inputData(k) //X
      // await this.page.waitForTimeout(300)
      await this.page.mouse.click(KCoordPosition.x + 145, KCoordPosition.y)
      await this.inputData(x) // Y
      // await this.page.waitForTimeout(300)
      await this.page.mouse.click(KCoordPosition.x + 235, KCoordPosition.y)
      await this.inputData(y) // K
      // await this.page.waitForTimeout(30)

      console.log(`[${this.config.workerId}] scanCoordinate:inputs took ${Date.now() - start}ms`)

      if (DEBUG) {
        try {
          await this.page.screenshot({
            path: path.join(process.cwd(), 'debug', `${this.config.workerId}_after_inputs.png`)
          })
        } catch (e) {
          console.error(`[${this.config.workerId}] screenshot failed:`, e.message)
        }
      }

      // Click GO button
      start = Date.now()

      await this.page.mouse.click(KCoordPosition.x + 138, KCoordPosition.y + 45) //680, 526)

      await this.page.waitForTimeout(10000) // Wait for camera to move

      console.log(`[${this.config.workerId}] scanCoordinate:go button took ${Date.now() - start}ms`)

      start = Date.now()
      const screenshotBuffer = await this.screenshot()

      this.lastScreenshot = screenshotBuffer

      if (DEBUG) {
        try {
          const debugPath = path.join(
            process.cwd(),
            'debug',
            `${this.config.workerId}_after_inputsAndGo.png`
          )

          await fs.writeFile(debugPath, screenshotBuffer)
          console.log(
            `[${this.config.workerId}] ⚠️  scanCoordinate — debug screenshot saved to ${debugPath}`
          )
        } catch (e) {
          console.error(`[${this.config.workerId}] screenshot failed:`, e.message)
        }
      }

      // Process with OpenCV
      const resultMerc = await this.imageProcessor.detectMercenario(screenshotBuffer)
      console.log(
        `[${this.config.workerId}] scanCoordinate:detectMercenario took ${Date.now() - start}ms`
      )

      // if merc found on screeen, move mouse to that position, to capture game coordinates from bottom left,
      // and convert with OCR to coordinates
      if (resultMerc.found) {
        await this.page.mouse.move(resultMerc.x, resultMerc.y)
        await this.page.waitForTimeout(200) // Wait for camera to move

        //TODO: remove this screenshot (2 lines)
        const debugPath = path.join(
          process.cwd(),
          'debug',
          `${this.config.workerId}_merc_found.png`
        )
        await this.page.screenshot({ path: debugPath })

        // use tesseract to get coordinates from bottom left of screenshot
        start = Date.now()
        const ocrResult = await this.imageProcessor.detectCoordinates(
          screenshotBuffer,
          this.page.viewportSize()
        )
        console.log(
          `[${this.config.workerId}] scanCoordinate:OCRCoordinates took ${Date.now() - start}ms`
        )

        resultMerc.text = ocrResult?.trim() ?? ''
      }
      return resultMerc
    } else {
      console.log(`[${this.config.workerId}] no inputs found:`)
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
