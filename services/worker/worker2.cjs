const workerpool = require('workerpool')
const { cv: opencv } = require('opencv-wasm')
const { Jimp } = require('jimp')

async function detectarElementoUnity(screenshotBytes, templateBytes, umbral = 0.8) {
  const [screenshot, template] = await Promise.all([
    Jimp.read(Buffer.from(screenshotBytes)),
    Jimp.read(Buffer.from(templateBytes))
  ])

  const src = opencv.matFromImageData(screenshot.bitmap)
  const templ = opencv.matFromImageData(template.bitmap)
  const dst = new opencv.Mat()
  const mask = new opencv.Mat()

  try {
    opencv.matchTemplate(src, templ, dst, opencv.TM_CCOEFF_NORMED, mask)
    const { maxVal, maxLoc } = opencv.minMaxLoc(dst, mask)

    if (maxVal >= umbral) {
      return {
        encontrado: true,
        x: maxLoc.x + templ.cols / 2,
        y: maxLoc.y + templ.rows / 2,
        confianza: maxVal
      }
    }
    return { encontrado: false, confianza: maxVal }
  } finally {
    src.delete()
    templ.delete()
    dst.delete()
    mask.delete()
  }
}

workerpool.worker({ detectarElementoUnity })
