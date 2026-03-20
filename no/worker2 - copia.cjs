const workerpool = require('workerpool')
const { cv: opencv } = require('opencv-wasm')
const fs = require('node:fs')
// import {Jimp} from 'jimp'
// function waitForOpenCV() {
//   return new Promise(resolve => {
//     // Si ya está inicializado, resolvemos de inmediato
//     if (cv.Mat) {
//       resolve(cv)
//     } else {
//       // El callback de Emscripten
//       cv.onRuntimeInitialized = () => {
//         console.log('cv.js listo')
//         resolve(cv)
//       }
//     }
//   })
// }
// Cargamos el template una sola vez fuera de la función para optimizar
// let templateMat = null;
async function detectarElementoUnity(screenshot, template, umbral = 0.8) {
  // console.log('hola desde el worker')
  // const opencv = await waitForOpenCV()
  // 1. Asegurarse de que OpenCV está cargado (Wasm es asíncrono)
  // if (!cv.Mat) await new Promise(resolve => (cv.onRuntimeInitialized = resolve))
  // console.log('hola 2 desde el worker')
  //    // 1. Capturar pantalla como Buffer (en memoria)
  // const screenshotBuffer = await page.screenshot()

  // // 2. Decodificar Buffer a datos de imagen usando Jimp
  // const screenshot = await Jimp.read(screenshotBuffer)
  // const template = await Jimp.read('template.png')

  // 3. Convertir a matrices de OpenCV (Mat)
  // const src = cv.matFromImageData(screenshot.bitmap)
  // const templ = cv.matFromImageData(template.bitmap)
  // Extraemos solo las propiedades necesarias para evitar el error de clonación
  const src = opencv.matFromImageData(screenshot)

  const templ = opencv.matFromImageData(template)
  const dst = new opencv.Mat()
  const mask = new opencv.Mat()
  // console.log('intentando matchtemplate')
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
