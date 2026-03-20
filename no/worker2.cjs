const workerpool = require('workerpool')
const { cv: opencv } = require('opencv-wasm')
const fs = require('node:fs')

async function detectarElementoUnity(screenshot, template, umbral = 0.8) {
  const src = opencv.matFromImageData(screenshot)

  const templ = opencv.matFromImageData(template)
  const dst = new opencv.Mat()
  const mask = new opencv.Mat()

  try {
    // 4. Ejecutar Template Matching
    // cv.TM_CCOEFF_NORMED es común para obtener un valor de confianza entre 0 y 1
    opencv.matchTemplate(src, templ, dst, opencv.TM_CCOEFF_NORMED, mask)

    // 5. Encontrar la mejor coincidencia
    const result = opencv.minMaxLoc(dst, mask)
    const { maxVal, maxLoc } = result
    //console.log('datos obtenidos en worker', maxVal, umbral)
    if (maxVal >= umbral) {
      const centroX = maxLoc.x + templ.cols / 2
      const centroY = maxLoc.y + templ.rows / 2

      return { encontrado: true, x: centroX, y: centroY, confianza: maxVal }
    }

    return { encontrado: false, confianza: maxVal }
  } finally {
    // 7. LIMPIEZA OBLIGATORIA (Wasm no tiene Garbage Collector para Mats)
    src.delete()
    templ.delete()
    dst.delete()
    mask.delete()
  }
}

workerpool.worker({ detectarElementoUnity })
