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
      // const debugPath = path.join(
      //   process.cwd(),
      //   'debug',
      //   `${this.config.workerId}_6_debug_worldmap_button.png`
      // )
      // await this.page.waitForTimeout(100)

      // const result2 = await this.page.screenshot({
      //   path: debugPath,
      //   clip: { x: 384, y: 978, width: 300, height: 300 }
      // })
      // // await fs.writeFile(debugPath, screenshotBuffer)
      // console.log(
      //   `[${this.config.workerId}] ⚠️ World map button found — debug screenshot saved to ${debugPath}`
      // )

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
    }
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

      await this.page.waitForTimeout(200)

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
    }
  }

  async getKCoordPosition(captureScreenshotForDebug = false) {
    console.log(`[${this.config.workerId}] KCoord Position window...`)
    const screenshotBuffer = await this.screenshot()

    const result = await this.imageProcessor.detectCoordsInput(screenshotBuffer)
    if (result.found) {
      console.log(
        `[${this.config.workerId}] KCoordPosition found at`,
        result.x,
        result.y,
        `(${(result.confidence * 100).toFixed(1)}%)`
      )

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
    }
    return result
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
    // await this.page.evaluate(() => {
    //   window.unityStatus = {
    //     isStable: false,
    //     frameHistory: [],
    //     lastTime: performance.now()
    //   }

    //   function checkStability(currentTime) {
    //     const delta = currentTime - window.unityStatus.lastTime
    //     window.unityStatus.lastTime = currentTime

    //     // Guardamos los últimos 10 deltas de tiempo
    //     window.unityStatus.frameHistory.push(delta)
    //     if (window.unityStatus.frameHistory.length > 10) window.unityStatus.frameHistory.shift()

    //     // Calculamos el promedio de los últimos 10 frames
    //     const avg = window.unityStatus.frameHistory.reduce((a, b) => a + b, 0) / 10

    //     // ESTABILIDAD: Si la diferencia entre el frame actual y el promedio es mínima (< 2ms)
    //     // y tenemos suficientes frames para promediar.
    //     window.unityStatus.isStable =
    //       window.unityStatus.frameHistory.length === 10 && Math.abs(delta - avg) < 2

    //     requestAnimationFrame(checkStability)
    //   }
    //   requestAnimationFrame(checkStability)
    // })

    this.isInitialized = true
    console.log(`[${this.config.workerId}] ✅ Browser initialized and ready`)
  }

  setWorkerCode(code) {
    this.code = code
    console.log(`[${this.config.workerId}] OTP code received on BHdlr: ${code}`)
  }

  async inputData(value) {
    await this.page.keyboard.press('End', { delay: 0 })
    for (let i = 0; i < 3; i++) await this.page.keyboard.press('Backspace', { delay: 0 })
    // await this.page.evaluate(t => navigator.clipboard.writeText(t), value.toString())
    // await this.page.keyboard.press('Control+V') //se come los numeros

    // await this.page.keyboard.type(value.toString()) //lento

    for (const caracter of value.toString()) {
      await this.page.keyboard.press(caracter, { delay: 10 })
    }
  }

  async scanCoordinate(k, x, y) {
    if (!this.isInitialized) {
      throw new Error('Browser not initialized')
    }
    123
    // Clear any popups, takes 1.5 seconds average
    let start = Date.now()
    for (let i = 0; i < 5; i++) {
      await this.page.keyboard.press('Escape', { delay: 0 })
    }
    console.log(`[${this.config.workerId}] scanCoordinate:clearPopups took ${Date.now() - start}ms`)

    await this.page.waitForTimeout(10)

    // A. Forzamos estado inestable antes del clic para evitar falsos positivos
    // await this.page.evaluate(() => {
    //   if (window.unityStatus) {
    //     window.unityStatus.isStable = false
    //     window.unityStatus.frameHistory = []
    //   }
    // })

    // Open search (magnifying glass)
    // await this.page.mouse.click(95, 787)
    await this.openGoToCoords(DEBUG)
    await this.page.waitForTimeout(100)
    console.log(`[${this.config.workerId}] scanCoordinate:search opened`)

    // try {
    //   const debugPath0 = path.join(
    //     process.cwd(),
    //     'debug',
    //     `${this.config.workerId}_after_search_open.png`
    //   )
    //   await this.page.screenshot({
    //     path: debugPath0,
    //     clip: { x: 95, y: 787, width: 40, height: 40 }
    //   })
    //   console.log(`[${this.config.workerId}] screenshot saved: ${debugPath0}`)
    // } catch (e) {
    //   console.error(`[${this.config.workerId}] screenshot failed:`, e.message)
    // }

    // Enter coordinates
    // const inputs = [
    //   { x: 546, val: 123 },
    //   { x: 536, val: 111 },
    //   { x: 636, val: 222 }
    // ]

    /*
    window.gameInstance.Module.SendMessage(
      'UnityBrowserApi',
      'Receive',
      JSON.stringify({ method: 'pasteClipboardContent', params: { content: '222' } })
    )
 gameObject: UnityBrowserApi
 func: Receive
 param: {"method":"pasteClipboardContent","params":{"content":"123"}}
 paramType: string
 ---

*/
    start = Date.now()
    const KCoordPosition = await this.getKCoordPosition(DEBUG)

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

    //   await this.page.screenshot({
    //     path: path.join(process.cwd(), 'debug', `${this.config.workerId}_Kinput.png`),
    //     clip: { x: KCoordPosition.x + 25, y: KCoordPosition.y, width: 300, height: 60 }
    //   })
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

    await this.page.mouse.click(KCoordPosition.x + 25, KCoordPosition.y)
    await this.inputData(k) //X
    // await this.page.waitForTimeout(300)
    await this.page.mouse.click(KCoordPosition.x + 25 + 120, KCoordPosition.y)
    await this.inputData(x) // Y
    // await this.page.waitForTimeout(300)
    await this.page.mouse.click(KCoordPosition.x + 25 + 210, KCoordPosition.y)
    await this.inputData(y) // K
    await this.page.waitForTimeout(300)

    // for (const input of inputs) {
    //   await this.page.mouse.click(input.x, 486)
    //   for (let i = 0; i < 4; i++) await this.page.keyboard.press('Backspace', { delay: 0 })
    //   await this.page.evaluate(t => navigator.clipboard.writeText(t), input.val.toString())
    //   await this.page.keyboard.press('Control+V')
    // }
    console.log(`[${this.config.workerId}] scanCoordinate:inputs took ${Date.now() - start}ms`)
    // process.stdout.write('')

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

    await this.page.waitForTimeout(500) // Wait for camera to move

    // C. ESPERA CRÍTICA:
    // Esperamos a que 'isStable' sea TRUE.
    // Playwright consultará este valor en el contexto del navegador.
    // await this.page.waitForFunction(
    //   () => !window.unityStatus || window.unityStatus.isStable === true,
    //   {
    //     timeout: 30000,
    //     polling: 'raf' // Esto hace que Playwright chequee sincronizado con el renderizado
    //   }
    // )
    console.log(`[${this.config.workerId}] scanCoordinate:go button took ${Date.now() - start}ms`)

    if (DEBUG) {
      try {
        await this.page.screenshot({
          path: path.join(process.cwd(), 'debug', `${this.config.workerId}_after_inputsAndGo.png`)
        })
      } catch (e) {
        console.error(`[${this.config.workerId}] screenshot failed:`, e.message)
      }
    }

    start = Date.now()
    const screenshotBuffer = await this.screenshot()

    this.lastScreenshot = screenshotBuffer

    // Process with OpenCV
    const result = await this.imageProcessor.detectMercenario(screenshotBuffer)
    console.log(
      `[${this.config.workerId}] scanCoordinate:detectMercenario took ${Date.now() - start}ms`
    )

    // if merc found on screeen, move mouse to that position, to capture game coordinates from bottom left,
    // and convert with OCR to coordinates
    if (result.found) {
      await this.page.mouse.move(result.x, result.y)
      await this.page.waitForTimeout(100) // Wait for camera to move

      //TODO: remove this screenshot (2 lines)
      const debugPath = path.join(process.cwd(), 'debug', `${this.config.workerId}_merc_found.png`)
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
