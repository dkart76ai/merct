import workerpool from 'workerpool'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createWorker } from 'tesseract.js'
import { Jimp } from 'jimp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class ImageProcessor {
  constructor() {
    this.pool = null
    this.mercTemplateBuffer = null
    this.mapaButtonTemplateBuffer = null
    this.initialized = false
  }

  async initialize() {
    if (this.initialized) return

    this.pool = workerpool.pool(path.join(__dirname, 'worker2.cjs'), {
      minWorkers: 1,
      maxWorkers: 1,
      workerTerminateTimeout: 30000
    })

    // const mercPath = path.join(process.cwd(), 'assets', 'mercenary.png')
    const mercPath = path.join(process.cwd(), 'assets', 'citadel.png')
    const mapaPath = path.join(process.cwd(), 'assets', 'mapaButton.png')
    const closePath = path.join(process.cwd(), 'assets', 'closeButton.png')
    const loadingPath = path.join(process.cwd(), 'assets', 'loading.png')
    const splashLoadingPath = path.join(process.cwd(), 'assets', 'splashLoading.png')
    const verifyAccountPath = path.join(process.cwd(), 'assets', 'rejectButton.png')
    const zoomInPath = path.join(process.cwd(), 'assets', 'zoomInButton.png')
    const [mercBuf, mapaBuf, closeBuf, loadingBuf, splashLoadingBuf, verifyAccountBuf, zoomInBuf] =
      await Promise.all([
        readFile(mercPath).catch(() => {
          throw new Error('Missing asset: ' + mercPath)
        }),
        readFile(mapaPath).catch(() => {
          throw new Error('Missing asset: ' + mapaPath)
        }),
        readFile(closePath).catch(() => {
          throw new Error('Missing asset: ' + closePath)
        }),
        readFile(loadingPath).catch(() => {
          throw new Error('Missing asset: ' + loadingPath)
        }),
        readFile(splashLoadingPath).catch(() => {
          throw new Error('Missing asset: ' + splashLoadingPath)
        }),
        readFile(verifyAccountPath).catch(() => {
          throw new Error('Missing asset: ' + verifyAccountPath)
        }),
        readFile(zoomInPath).catch(() => {
          throw new Error('Missing asset: ' + zoomInPath)
        })
      ])

    this.mercTemplateBuffer = Array.from(mercBuf)
    this.mapaButtonTemplateBuffer = Array.from(mapaBuf)
    this.closeButtonTemplateBuffer = Array.from(closeBuf)
    this.loadingTemplateBuffer = Array.from(loadingBuf)
    this.splashLoadingTemplateBuffer = Array.from(splashLoadingBuf)
    this.verifyAccountTemplateBuffer = Array.from(verifyAccountBuf)
    this.zoomInTemplateBuffer = Array.from(zoomInBuf)

    this.initialized = true
  }

  async detectZoomIn(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.zoomInTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectVerifyAccount(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.verifyAccountTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectSplashLoading(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.splashLoadingTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectLoading(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.loadingTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectCloseButton(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.closeButtonTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectMapaButton(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.mapaButtonTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async detectMercenario(screenshotBuffer) {
    if (!this.initialized) await this.initialize()
    try {
      const result = await this.pool.exec('detectarElementoUnity', [
        Array.from(screenshotBuffer),
        this.mercTemplateBuffer,
        0.8
      ])
      return {
        found: result.encontrado,
        confidence: result.confianza,
        x: result.x || null,
        y: result.y || null,
        text: ''
      }
    } catch (error) {
      console.error('Error in image processing:', error.message)
      return { found: false, confidence: 0 }
    }
  }

  async runOCROnRegion(imageSrc, rect) {
    const worker = await createWorker('eng')
    try {
      // Crop and save debug image using Jimp

      const img = await Jimp.read(imageSrc)
      const cropped = img.crop({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
      const debugPath = path.join(process.cwd(), 'assets', 'debug_ocr_region.png')
      await cropped.write(debugPath)
      console.log(`[OCR] debug region saved to ${debugPath}`)

      // Conviertes la imagen de Jimp a un Buffer (en formato PNG o JPG)
      const bufferParaTesseract = await cropped.getBuffer('image/png')

      const {
        data: { text }
      } = await worker.recognize(
        bufferParaTesseract
        //   , {
        //   left: rect.left,
        //   top: rect.top,
        //   width: rect.width,
        //   height: rect.height
        // }
      )
      console.log('Text from region:', text)
      return text
    } catch (error) {
      console.error('OCR Error:', error)
    } finally {
      await worker.terminate()
    }
  }

  async detectCoordinates(screenshot, pageSize) {
    //use tesseract to get values from screenshot at 0,bottom-200, 300, bottom
    // const img = await Jimp.read(imageSrc)
    // const width = img.bitmap.width
    // const height = img.bitmap.height
    const region = { left: 12, top: pageSize.height - 30, width: 160, height: 20 }
    return await this.runOCROnRegion(screenshot, region)
  }

  async terminate() {
    if (this.pool) await this.pool.terminate()
  }
}
