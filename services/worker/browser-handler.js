import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { ImageProcessor } from './image-processor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
          'assets',
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
          'assets',
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
          'assets',
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
        'assets',
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
        'assets',
        `${this.config.workerId}_debug_verify_account_after.png`
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
        'assets',
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
        'assets',
        `${this.config.workerId}_debug_worldmap_button.png`
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
          'assets',
          `${this.config.workerId}_debug_worldmap_after.png`
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
        'assets',
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
        'assets',
        `${this.config.workerId}_debug_zoomin_after.png`
      )
      await fs.writeFile(debugPath, screenshotBuffer2)
      console.log(`[${this.config.workerId}] ⚠️ zoomin — debug screenshot saved to ${debugPath}`)
    }
  }

  async initialize() {
    const options = {
      screen: { width: 1360, height: 1024 },
      viewport: { width: 1360, height: 1024 },
      deviceScaleFactor: 1
    }

    const authPath = path.join(process.cwd(), 'auth', this.config.accountFile)
    if (await this.fileExists(authPath)) {
      options.storageState = authPath
    }

    this.context = await this.browser.newContext(options)
    this.page = await this.context.newPage()

    // Block resources to speed up loading
    // await this.page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,pdf,mp4}', route => route.abort())
    await this.page.route('**/*.{woff,woff2,pdf,mp4}', route => route.abort())

    console.log(`[${this.config.workerId}] Loading game...`)
    await this.page.goto('https://totalbattle.com/es', { timeout: 70000 })
    await this.page.waitForTimeout(60000) //splash screen
    await this.waitForSplashLoading(300, 1000, true)

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
      if (
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
          await this.page.waitForTimeout(10000)
        }
      }

      try {
        await this.page.locator('canvas').waitFor({ state: 'visible', timeout: 90000 })

        // await this.page.waitForSelector('canvas', { timeout: 90000 })
      } catch (e) {
        const debugPath = path.join(
          process.cwd(),
          'assets',
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

    await this.waitForLoading(200, 1000, true)

    // Clear popups
    await this.page.waitForTimeout(2000)
    await this.closeScreen(20, 2500, true)
    await this.page.waitForTimeout(5000)
    await this.closeVerifyAccount(true)
    await this.page.waitForTimeout(2000)
    await this.clearPopups()
    await this.openWorldMap(true)
    await this.page.waitForTimeout(4000)
    await this.clearPopups()
    await this.page.waitForTimeout(2000)
    await this.zoomingIn(true)
    await this.page.waitForTimeout(2000)

    this.isInitialized = true
    console.log(`[${this.config.workerId}] ✅ Browser initialized and ready`)
  }

  setWorkerCode(code) {
    this.code = code
    console.log(`[${this.config.workerId}] OTP code received on BHdlr: ${code}`)
  }

  async scanCoordinate(k, x, y) {
    if (!this.isInitialized) {
      throw new Error('Browser not initialized')
    }

    // Clear any popups
    for (let i = 0; i < 5; i++) {
      await this.page.keyboard.press('Escape')
    }
    await this.page.waitForTimeout(100)

    // Open search (magnifying glass)
    await this.canvas.click({ position: { x: 87, y: 757 } })
    await this.page.waitForTimeout(500)

    // Enter coordinates
    const inputs = [
      { x: 586, val: k },
      { x: 684, val: x },
      { x: 787, val: y }
    ]

    for (const input of inputs) {
      await this.canvas.click({ clickCount: 1, position: { x: input.x, y: 446 } })
      // Clear current input
      for (let i = 0; i < 4; i++) await this.canvas.press('Backspace', { delay: 0 })
      await this.page.keyboard.type(input.val.toString(), { delay: 0 })
    }

    // Click GO button
    await this.canvas.click({ position: { x: 680, y: 490 } })
    await this.page.waitForTimeout(1000) // Wait for camera to move

    // Take screenshot
    // const screenshotBuffer = await this.page.screenshot({
    //   animations: 'disabled',
    //   type: 'png'
    // })
    const screenshotBuffer = await this.screenshot()

    this.lastScreenshot = screenshotBuffer

    // Process with OpenCV
    const result = await this.imageProcessor.detectMercenario(screenshotBuffer)

    // if merc found on screeen, move mouse to that position, to capture game coordinates from bottom left,
    // and convert with OCR to coordinates
    if (result.found) {
      await this.page.mouse.move(result.x, result.y)
      await this.page.waitForTimeout(300) // Wait for camera to move

      const screenshotBuffer = await this.page.screenshot({
        animations: 'disabled',
        type: 'png'
      })

      this.lastScreenshot = screenshotBuffer

      // use tesseract to get coordinates from bottom left of screenshot
      const ocrResult = await this.imageProcessor.detectCoordinates(screenshotBuffer)

      result.text = ocrResult
    }
    return result
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
