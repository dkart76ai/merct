const express = require('express')
const path = require('path')
const fs = require('fs')
const { firefox } = require('playwright')
const { loadEnvFile } = require('node:process')
const { kingdomUrls } = require('./kingdomUrls.js')
const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  getRequestHeader,
  getMsgPack2ndBlockRequest,
  scanPacket312
} = require('./messagePack.js')
const { createStream } = require('rotating-file-stream')
const msgpack = require('@msgpack/msgpack')
const {
  addJob,
  addCritical,
  addHigh,
  addNormal,
  addLow,
  addJobAndWait,
  getTimerManager,
  startWorker,
  stopWorker,
  cleanOldJobs,
  getQueueStatus,
  getJob,
  closeQueue,
  JOB_TYPES,
  PRIORITY
} = require('./jobs/index.js')
const { getPool, processPacket } = require('./lib/workerPool')

const staticIdDB = require('./staticId.js')
const { setChatPage, sendMessage, notifyDiscord } = require('./jobs/chatSender')
const {
  sendPacketHandler,
  extractObjectsHandler,
  saveObjectsHandler,
  findObjectsHandler,
  notificationHandler,
  processPacketHandler
} = require('./jobs/handlers')
const {
  initDb,
  findObjects,
  getStats,
  getAllObjects,
  startCleanup,
  closeDb
} = require('./lib/database.js')
const { getRedis } = require('./lib/redis.js')
loadEnvFile()

const config = {
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD
}

// const SAVE_DIR = path.join(__dirname, 'captures')
// const SAVE_DIR2 = path.join(__dirname, 'packetSender')
const LOGS_DIR = path.join(__dirname, 'logs')
const LOGS_DIR2 = path.join(__dirname, 'decoded-logs')
const PACKET311312_DIR = path.join(__dirname, 'P311312')
const PACKET_SAMPLE_DIR = path.join(__dirname, 'packet-sample')
const packetSample = new Map()

// 1. Configurar el stream de escritura (Binario y Rotativo)
const logStream = createStream('traffic.bin', {
  size: '2M', // Rota cada 10MB para que sean fáciles de descargar
  interval: '30m', // O cada día
  path: LOGS_DIR
})

const logStream2 = createStream('traffic.bin', {
  size: '2M', // Rota cada 10MB para que sean fáciles de descargar
  interval: '30m', // O cada día
  path: LOGS_DIR2
})

const packet31xStream = createStream('packet311_312.bin', {
  size: '2M', // Rota cada 10MB para que sean fáciles de descargar
  interval: '30m', // O cada día
  path: PACKET311312_DIR
})

/**
 * Procesa y guarda el paquete basado en su opCode
 * @param {number} opCode - El opCode ya extraído
 * @param {Buffer} packetBuffer - El buffer completo del paquete
 */
// Almacén de streams activos por opCode
const opcodeStreams = new Map()

function savePacketByOpcode(opCode, packetBuffer) {
  let stream = opcodeStreams.get(opCode)

  // Si no existe el stream para este opCode, lo creamos
  if (!stream) {
    stream = createStream(`${opCode}.bin`, {
      size: '2M', // Rotar al llegar a 2MB
      path: PACKET_SAMPLE_DIR,
      maxFiles: 1 // Mantener solo la muestra actual de 2MB
    })

    stream.on('rotated', filename => {
      console.log(`Muestra de 2MB completada para Opcode ${opCode}: ${filename}`)
      // Opcional: Cerrar el stream si ya no quieres capturar más de este opCode
      // stream.end();
      // opcodeStreams.delete(opCode);
    })

    opcodeStreams.set(opCode, stream)
  }

  // Escribir el buffer directamente (binario)
  const encoded = JSON.stringify(
    packetBuffer,
    (k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2
  )
  stream.write(encoded)
}

// Función para guardar el par (Llamada desde tu lógica de red)
function saveTrafficPair(url, reqBuffer, resBuffer, opCode) {
  const pair = {
    ts: Date.now(),
    url,
    opCode,
    req: reqBuffer, // Buffer original de MessagePack
    res: resBuffer // Buffer original de MessagePack
  }

  // Serializamos el par completo
  const encoded = msgpack.encode(pair)
  logStream.write(encoded)

  // // try again !! save decoded data
  // const { results: decodedRequest } = multiDecodeMsgPack2(reqBuffer, true)
  // const { results: decodedResponse } = multiDecodeMsgPack2(resBuffer)
  // const pair2 = {
  //   ts: Date.now(),
  //   url,
  //   opCode,
  //   req: decodedRequest, // Buffer original de MessagePack
  //   res: decodedResponse // Buffer original de MessagePack
  // }
  // logStream2.write(const encoded = JSON.stringify(
  //   pair2,
  //   (k, v) => (typeof v === 'bigint' ? v.toString() : v),
  //   2
  // ))
}

// function getFirstValue(data, depth = 0) {
//   if (depth > 10) return null // Prevent stack overflow on circular/deep structures
//   if (!data || !Array.isArray(data)) return null

//   try {
//     for (let item of data) {
//       if (typeof item === 'number') return item
//       if (Array.isArray(item)) {
//         const resultado = getFirstValue(item, depth + 1)
//         if (resultado !== undefined) return resultado
//       }
//     }
//   } catch (e) {
//     console.error('[getFirstValue] ', e.message)
//   }
//   return null
// }

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'public')))

let browser = null
let context = null
let page = null
// let captures = []
// let captureIndex = 0
let capturingEnabled = true
let unknownStaticIds = new Map() // staticId -> { coords: Set of "k,x,y" }
const redisClient = getRedis()

async function ensureSaveDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true })
    }
    if (!fs.existsSync(PACKET311312_DIR)) {
      fs.mkdirSync(PACKET311312_DIR, { recursive: true })
    }
    if (!fs.existsSync(PACKET_SAMPLE_DIR)) {
      fs.mkdirSync(PACKET_SAMPLE_DIR, { recursive: true })
    }
  } catch (e) {
    console.error('Ensure save dir error:', e.message)
  }
}

function savePackets311_312(data) {
  packet31xStream.write(JSON.stringify(data) + '\n')
}

const generateArrays = (start = 9, end = 2396, step = 50, groupSize = 12) => {
  const allNumbers = []
  const used = new Set()

  for (let i = start; i <= end; i++) {
    if (used.has(i)) continue
    for (let j = 0; j < 4; j++) {
      let num = i + j * step
      if (num <= end && !used.has(num)) {
        allNumbers.push(num)
        used.add(num)
      }
    }
  }

  const result = []
  for (let i = 0; i < allNumbers.length; i += groupSize) {
    result.push(allNumbers.slice(i, i + groupSize))
  }

  return result
}

function buildPacket311Payload(tiles, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[311, randomSeq, [[tokenBigInt], token], ''], [[tiles]]]

  return packetData
}

function buildPacket312Payload(tiles, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const zeros = new Array(tiles.length).fill(0)
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [312, randomSeq, [[tokenBigInt], token], ''],
    [tiles, zeros, [], []]
  ]

  return packetData
}

function buildPacket313Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[313, randomSeq, [[tokenBigInt], token], ''], []]

  return packetData
}

function buildPacket22Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [22, randomSeq, [[tokenBigInt], token], ''],
    [1, 1]
  ]

  return packetData
}

async function sendPacket(kingdom) {
  const redisClient = getRedis()

  const _token1 = await redisClient.get('myPlayerId:BigInt')
  if (!_token1) {
    throw new Error('no session token1')
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    throw new Error('no session token2')
  }

  const url = kingdomUrls[kingdom]
  if (!url) {
    throw new Error('invalid kingdom')
  }

  console.log(`[SendPacket] Sending packets to ${url}  `)

  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    //---------- send packet 313
    const packetData313 = buildPacket313Payload(token1, token2)

    // Encode the packet
    const encoded313 = encodeMsgPack2MultiFragments(packetData313)

    const HEADERS = {
      'Content-Type': 'application/octet-stream',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      Referer: 'https://totalbattle.com/'
    }
    // Send to server
    console.log(`[SendPacket] Sending packet313 to ${url}  `)
    const response313 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded313
    })

    if (!response313.ok) {
      throw new Error(`packet313: Server returned ${response313.status}: ${response313.statusText}`)
    }

    //---------- send packet 22
    const packetData22 = buildPacket22Payload(token1, token2)

    // Encode the packet
    const encoded22 = encodeMsgPack2MultiFragments(packetData22)

    // Send to server
    console.log(`[SendPacket] Sending packet22 to ${url}  `)
    const response22 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded22
    })

    if (!response22.ok) {
      throw new Error(`packet22: Server returned ${response22.status}: ${response22.statusText}`)
    }

    // Get response buffer
    // const buffer313 = await response313.arrayBuffer()
    // const bytes313 = new Uint8Array(buffer313)

    //------ send packet 312

    const tilesArray = generateArrays(9, 2396, 50, 12)

    for (const tiles of tilesArray) {
      const packetData312 = buildPacket312Payload(tiles, token1, token2)

      // Encode the packet
      const encoded312 = encodeMsgPack2MultiFragments(packetData312)

      // Send to server
      console.log(`[SendPacket] Sending packet312 to ${url}  `)
      const response312 = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: encoded312
      })

      if (!response312.ok) {
        throw new Error(`Server returned ${response312.status}: ${response312.statusText}`)
      }

      // Get response buffer
      const buffer312 = await response312.arrayBuffer()
      const bytes312 = new Uint8Array(buffer312)

      const payload = {
        request: encoded312,
        response: bytes312
      }
      const result = await processPacket(payload)
      // extract objects
      //save objects
      // const { players42, objects12 } = scanPacket312(bytes312)

      // console.log('results after kingdom scan', { kingdom, players42, objects12 })
    }

    console.log(`[SendPacket] Success  `)
  } catch (error) {
    console.error(`[SendPacket] Error:`, error.message)
  }
}

async function handleScanKingdom(req, res) {
  const { kingdoms } = req.body

  console.log(`[API] scanKingdom request - kingdoms: ${kingdoms} `)

  if (!kingdoms || kingdoms.trim() === '') {
    return res.json({ success: false, error: 'enter kingdom' })
  }

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }

  try {
    for (const kingdom of kingdomList) {
      await sendPacket(kingdom)
    }
  } catch (error) {
    console.log('error', error.message)
    return res.json({ success: false, error: error.message })
  }

  res.json({
    success: true
  })
}

async function handleStartTimer(req, res) {
  const { kingdoms, interval = 60000, priority = 'LOW' } = req.body

  console.log(`[API] startTimer - kingdoms: ${kingdoms}, interval: ${interval}ms`)

  if (!kingdoms || kingdoms.trim() === '') {
    return res.json({ success: false, error: 'enter kingdom' })
  }

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }
  const tilesArray = generateArrays(9, 2396, 50, 1)
  const timerManager = getTimerManager()

  for (const kingdom of kingdomList) {
    timerManager.stopScan(kingdom)

    for (const tiles of tilesArray) {
      timerManager.scheduleScanKingdom(kingdom, {
        intervalMs: parseInt(interval),
        tiles
      })
    }
  }

  res.json({
    success: true,
    message: `Started timer for ${kingdomList.length} kingdoms`,
    kingdoms: kingdomList,
    interval
  })
}

async function handleStopTimer(req, res) {
  const { kingdoms } = req.body

  const timerManager = getTimerManager()

  if (kingdoms) {
    const kingdomList = kingdoms.split(',').map(k => parseInt(k.trim()))
    for (const kingdom of kingdomList) {
      timerManager.stopScan(kingdom)
    }
    res.json({ success: true, message: `Stopped timers for ${kingdomList.length} kingdoms` })
  } else {
    timerManager.stopAll()
    res.json({ success: true, message: 'Stopped all timers' })
  }
}

function extractChatStaticIds(message) {
  if (!message || typeof message !== 'string') return
  if (!message.startsWith('MESG')) return

  try {
    const jsonMatch = message.match(/MESG(\{.*\})/)
    if (!jsonMatch) return

    const msgData = JSON.parse(jsonMatch[1])
    if (msgData.data) {
      const data = JSON.parse(msgData.data)
      if (data.subs) {
        for (const key in data.subs) {
          const sub = data.subs[key]
          if (sub.staticId && sub.entryType) {
            staticIdDB.addOrUpdateStaticId(sub.staticId, {
              entryType: sub.entryType,
              name: sub.name || null
            })

            const unknown = unknownStaticIds.get(String(sub.staticId))

            const isComplete =
              unknown &&
              unknown.name &&
              unknown.entryType &&
              unknown.level != null &&
              unknown.level >= 0

            if (isComplete) {
              unknownStaticIds.delete(sub.staticId)
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[extractChatStaticIds] Error: parsing data', e.message)
  }
}

function setupWebsocketListener() {
  if (!page) return

  page.on('websocket', async ws => {
    console.log(`[${new Date().toLocaleTimeString()}] WebSocket opened: ${ws.url()}`)

    ws.on('framesent', data => {})

    ws.on('framereceived', data => {
      if (capturingEnabled) {
        try {
          const text = data.payload.toString('utf8')
          if (text.startsWith('MESG')) {
            // console.log(`[WS] MESG received: ${text.substring(0, 200)}...`)
            extractChatStaticIds(text)
            // if (autoSave) saveChatStaticIds()
          }
        } catch (e) {}
      }
    })

    ws.on('close', () => {
      console.log(`[${new Date().toLocaleTimeString()}] WebSocket closed`)
    })
  })
}

async function patchSendbird() {
  if (!page) return
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
      console.log(`  🔧 Triumph.framework.js patched`)
    } catch (e) {
      console.error(`  Failed to patch framework:`, e.message)
      await route.continue()
    }
  })
}

async function setupBlockPacketsSentToServer() {
  await page.route('**/rubens-realm**', async route => {
    const request = route.request()

    // 1. Obtener el contenido del body (como string o JSON)
    const postDataBuff = request.postDataBuffer()
    const { opCode: opCode } = getRequestHeader(postDataBuff)

    /*
    311 something with tile id's, si esta bloqueado no pinta el tile, y se cuelga el juego
    318 ping or get time , it return a timestamp
    */
    if ([318].includes(opCode)) {
      // console.log('Bloqueando packet with opcode ', opCode)
      await route.abort()
    } else {
      // Si todo está bien, la petición sigue su curso
      await route.continue()
    }
  })
}

function setupPacketCaptureListener() {
  if (!page) return

  page.on('response', async response => {
    if (!capturingEnabled) return

    const url = response.url()
    if (!url.includes('rubens-realm')) return

    const _kingdom = url.split('rubens-realm')[1]
    // const kingdom = parseInt(_kingdom)

    try {
      const status = response.status()
      const responseHeaders = response.headers()
      const responseBody = await response.body()

      if (!responseBody || responseBody.length === 0) return
      if (responseHeaders['content-type']?.includes('text/html')) return

      const request = response.request()
      // const postData = request.postData()
      const postDataBuff = request.postDataBuffer()

      const { opCode: opCode } = getRequestHeader(postDataBuff)

      // const ignoreOpcodes = [318]
      // if (!ignoreOpcodes.includes(opCode)) {
      //   saveTrafficPair(url, postDataBuff, responseBody, opCode)
      // }

      // if ([311, 312].includes(opCode)) {
      //   const tiles = getMsgPack2ndBlockRequest(postDataBuff)
      //   savePackets311_312({ url, opCode, tiles })
      // }

      //  save 20 packet sample of each  opCode
      // let packetSampleCounter = packetSample.get(opCode) || 0
      // if (packetSampleCounter < 20) {
      //   packetSample.set(opCode, packetSampleCounter + 1)

      //   const { results: decodedRequest } = multiDecodeMsgPack2(postDataBuff, true)
      //   const { results: decodedResponse } = multiDecodeMsgPack2(responseBody)
      //   savePacketByOpcode(opCode, {
      //     opCode,
      //     url,
      //     request: decodedRequest,
      //     response: decodedResponse
      //   })
      // }

      const payload = {
        request: postDataBuff,
        response: responseBody
      }
      const result = await processPacket(payload)
    } catch (e) {
      console.error('Capture error:', e.message)
    }
  })
}

async function browserInitialize() {
  browser = await firefox.launch({ headless: false })
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

  context = await browser.newContext(options)
  page = await context.newPage()

  // Set chat page for notification handler
  setChatPage(page)
}

// async function browserLoadUrlAndLogin() {
//   if (!page) return

//   // 1. Ve a la página y espera lo mínimo necesario
//   await page.goto('https://totalbattle.com/es', { waitUntil: 'domcontentloaded' })

//   // 2. Define los locadores (sin ejecutarlos aún)
//   const loginInput = page.getByRole('textbox', { name: 'E-mail' })
//   const loginButtonTab = page.locator('span[data-id="login"]')
//   const passwordInput = page.getByRole('textbox', { name: 'Contraseña' })
//   const loginButton = page.getByRole('button', { name: 'Iniciar sesión' })

//   for (let i = 0; i < 2; i++) {
//     // 3. Lógica de Login con esperas explícitas
//     try {
//       // Esperamos a que el botón de la pestaña o el input aparezcan (lo que ocurra primero)
//       await loginButtonTab.waitFor({ state: 'visible', timeout: 10000 })

//       if (await loginButtonTab.isVisible()) {
//         console.log('Abriendo pestaña de login...')
//         await loginButtonTab.click()
//       }
//       break
//     } catch (error) {
//       console.error('El formulario de login no apareció o tardó demasiado', error)
//     }
//   }
//   await page.waitForTimeout(1000)

//   try {
//     // Llenar datos (Playwright esperará automáticamente a que sean editables)
//     console.log('Ingresando credenciales...')
//     await loginInput.fill(config.accountUser)
//     await page.waitForTimeout(500)
//     await passwordInput.fill(config.accountPwd)
//   } catch (error) {
//     console.error('El formulario de login no apareció o tardó demasiado', error)
//   }

//   await page.waitForTimeout(1000)

//   console.log('clickeando el boton...')
//   for (let i = 0; i < 2; i++) {
//     try {
//       await loginButton.waitFor({ state: 'visible', timeout: 10000 })
//       if (await loginButton.isVisible()) {
//         await loginButton.click()
//       }
//       break
//     } catch (error) {
//       console.error('el boton login no apareció o tardó demasiado', error)
//     }
//   }

//   console.log('Login exitoso')
// }
async function browserLoadUrlAndLogin() {
  if (!page) return

  await page.goto('https://totalbattle.com/es', { waitUntil: 'domcontentloaded' })

  const loginInput = page.getByRole('textbox', { name: 'E-mail' })
  const loginButtonTab = page.locator('span[data-id="login"]')
  const passwordInput = page.getByRole('textbox', { name: 'Contraseña' })
  const loginButton = page.getByRole('button', { name: 'Iniciar sesión' })

  try {
    // 1. Abrir pestaña de login (si es necesario)
    // Usamos click directamente, Playwright esperará hasta 30s por defecto
    await loginButtonTab.click().catch(() => console.log('Pestaña ya abierta'))

    // 2. Llenar credenciales
    // fill() espera automáticamente a que el elemento sea visible y accionable
    console.log('Ingresando credenciales...')
    await loginInput.click()
    await loginInput.pressSequentially(config.accountUser, { delay: 20 })
    await passwordInput.click()
    await passwordInput.pressSequentially(config.accountPwd, { delay: 20 })

    // 3. Click en el botón de login
    console.log('Clickeando el botón...')

    // Forzamos el click si hay elementos flotantes que estorben,
    // o simplemente esperamos a que esté habilitado
    await loginButton.click()

    // 4. Verificación post-login
    // En lugar de un console.log inmediato, espera a que algo cambie (ej. desaparezca el input)
    await loginInput.waitFor({ state: 'hidden', timeout: 5000 })
    console.log('Login exitoso')
  } catch (error) {
    console.error('Error durante el proceso de login:', error)
  }
}

app.post('/api/scanKingdom', handleScanKingdom)

app.post('/api/timer/start', handleStartTimer)

app.post('/api/timer/stop', handleStopTimer)

app.post('/api/browser/stop', async (req, res) => {
  try {
    if (browser) {
      await browser.close()
      browser = null
      page = null
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Health check endpoint for Docker
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  })
})

// Debug endpoint to check memory and DB stats
app.get('/api/debug', (req, res) => {
  const used = process.memoryUsage()
  const dbStats = getStats()
  res.json({
    memory: {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(used.rss / 1024 / 1024) + ' MB',
      external: Math.round(used.external / 1024 / 1024) + ' MB'
    },
    database: dbStats,
    uptime: process.uptime()
  })
})

// app.get('/api/db/check', (req, res) => {
//   const { findObjects } = require('./jobs/database')
//   const objs = findObjects({ staticId: 400, level: 10, amount: 5 })
//   res.json({
//     found: objs.objects.length,
//     total: objs.total,
//     objects: objs.objects.slice(0, 3).map(o => `${o.kingdom}:${o.x}:${o.y} L${o.level}`)
//   })
// })

app.get('/api/jobs/status', async (req, res) => {
  try {
    const status = await getQueueStatus()
    res.json({ success: true, ...status })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const job = await getJob(req.params.jobId)
    if (job) {
      const state = await job.getState()
      res.json({
        success: true,
        job: {
          id: job.id,
          name: job.name,
          data: job.data,
          state,
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          finishedOn: job.finishedOn,
          processedOn: job.processedOn
        }
      })
    } else {
      res.status(404).json({ success: false, error: 'Job not found' })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/timers', (req, res) => {
  const timerManager = getTimerManager()
  const active = timerManager.getActiveTimers()
  res.json({ success: true, timers: active })
})

app.get('/api/unknown-staticids', (req, res) => {
  // do nothing, its for frontend not to crash
  res.json({ success: true, items: [], count: 0 })
})

app.get('/api/static-db', (req, res) => {
  const count = staticIdDB.getStaticIdSize()
  const limit = parseInt(req.query.limit) || 100
  const offset = parseInt(req.query.offset) || 0
  const allEntries = staticIdDB.getStaticIdValues()
  const entries = allEntries.slice(offset, offset + limit)
  console.log('Sending staticId Db', offset, '-', offset + entries.length, 'of', count)
  res.json({ success: true, items: entries, count, offset, limit })
})

app.post('/api/objects/find-and-notify', async (req, res) => {
  const { staticId, level, amount = 10, notificationConfig } = req.body

  const result = findObjects({ staticId, level, amount })

  if (result.objects.length > 0) {
    await addJob(JOB_TYPES.NOTIFICATION, {
      type: 'objects-found',
      priority: PRIORITY.LOW,
      objects: result.objects,
      searchCriteria: { staticId, level, amount }
    })
  }

  res.json({ success: true, ...result, notified: result.objects.length > 0 })
})

// Scan for merc timer
app.post('/api/timer/scan-mercs', async (req, res) => {
  const { interval = 60000 } = req.body

  const timerManager = getTimerManager()

  const timerKey = 'merc-scanner'

  // Build payload for find-objects job
  const jobData = {
    staticId: 400, // Merc static ID
    amount: 20
  }

  await timerManager.scheduleCustom(timerKey, parseInt(interval), JOB_TYPES.FIND_OBJECTS, jobData, {
    priority: PRIORITY.LOW
  })

  res.json({ success: true, message: `Merc scanner started every ${interval}ms`, interval })
})

app.post('/api/timer/stop-mercs', async (req, res) => {
  const timerManager = getTimerManager()
  await timerManager.stopNamedTimer('merc-scanner')
  res.json({ success: true, message: 'Merc scanner stopped' })
})

// Manual find and queue notification
app.post('/api/scan-mercs-now', async (req, res) => {
  const { level, amount = 20 } = req.body

  const result = findObjects({ staticId: 400, level, amount })

  if (result.objects.length > 0) {
    await addJob(JOB_TYPES.NOTIFICATION, {
      type: 'mercs-found',
      priority: PRIORITY.LOW,
      objects: result.objects,
      searchCriteria: { staticId: 400, level, amount }
    })
    res.json({ success: true, found: result.returned, total: result.total, notified: true })
  } else {
    res.json({ success: true, found: 0, notified: false })
  }
})

app.get('/api/captures', (req, res) => {
  res.json({ success: true, captures: [], count: 0 })
})

app.get('/api/captures/:id', (req, res) => {
  // const id = parseInt(req.params.id)
  // const capture = captures.find(c => c.id === id)
  // if (capture) {
  //   res.json({ success: true, capture:[] })
  // } else {
  res.status(404).json({ success: false, error: 'Not found' })
  // }
})

app.post('/api/browser/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: false, error: 'Browser already running' })
    }

    await browserInitialize()

    setupWebsocketListener()
    patchSendbird()

    // setupBlockPacketsSentToServer()

    setupPacketCaptureListener()

    await browserLoadUrlAndLogin()

    res.json({ success: true, message: 'Browser started' })
  } catch (error) {
    console.error('Browser start error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/browser/status', async (req, res) => {
  const token1 = await redisClient.get('myPlayerId:BigInt')
  const token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')

  let memoryUsage = 0
  if (page) memoryUsage = await page.evaluate(() => performance.memory)

  res.json({
    success: true,
    running: !!browser,
    capturing: capturingEnabled,
    token1,
    token2,
    memoryUsage
  })
})

app.post('/api/browser/stop', async (req, res) => {
  try {
    if (browser) {
      await browser.close()
      browser = null
      page = null
      context = null
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/capturing/start', async (req, res) => {
  if (!browser || !page) {
    return res.status(400).json({ success: false, error: 'Browser not running' })
  }

  capturingEnabled = true
  res.json({ success: true, message: 'Capturing started', capturing: true })
})

app.post('/api/capturing/stop', async (req, res) => {
  capturingEnabled = false

  res.json({ success: true, message: 'Capturing stopped', capturing: false })
})

async function main() {
  console.log('[Main] Starting server...')

  await ensureSaveDir()
  initDb()
  staticIdDB.loadStaticDb()
  //startCleanup()

  // console.log('staticid', Object.keys(staticIdDB))
  // console.log(
  //   'test staticid getter',
  //   staticIdDB.getStaticIdData(1531),
  //   'Escuadrón común de elfos lvl30'
  // )

  // Initialize worker pool (non-blocking CPU tasks)
  getPool()

  console.log('[Main] Starting BullMQ worker...')

  const handlers = {
    // [JOB_TYPES.SEND_PACKET]: sendPacketHandler,
    // [JOB_TYPES.EXTRACT_OBJECTS]: extractObjectsHandler,
    // [JOB_TYPES.SAVE_OBJECTS]: saveObjectsHandler,
    [JOB_TYPES.FIND_OBJECTS]: findObjectsHandler,
    [JOB_TYPES.NOTIFICATION]: notificationHandler
    // [JOB_TYPES.PROCESS_PACKET]: processPacketHandler
  }

  await startWorker(handlers)

  const server = app.listen(PORT, () => {
    console.log(`[Main] Server running on http://localhost:${PORT}`)
    console.log('[Main] BullMQ Worker started')
    console.log('[Main] API endpoints:')
    console.log('  GET  /api/health - Health check')
    console.log('  POST /api/scanKingdom - Queue kingdom scan')
    console.log('  POST /api/timer/start - Start periodic scanning')
    console.log('  POST /api/timer/stop - Stop periodic scanning')
    console.log('  GET  /api/jobs/status - Get job queue status')
    console.log('  GET  /api/timers - Get active timers')
    console.log('  POST /api/browser/start - Start browser')
    console.log('  POST /api/browser/stop - Stop browser')
    console.log('  POST /api/capturing/start - Start packet capture')

    // notifyDiscord('٩(̾●̮̮̃̾•̃̾)۶') //┌∩┐(◣_◢)┌∩┐
    // sendMessage('٩(̾●̮̮̃̾•̃̾)۶') // ۜ\(סּںסּَ` )/ۜ
  })

  process.on('SIGINT', async () => {
    console.log('\n[Main] Shutting down...')
    await stopWorker()
    await cleanOldJobs()
    console.log('[Main] Cleaning Redis...')
    await closeQueue()
    closeDb()
    if (browser) await browser.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Main] Shutting down...')
    await stopWorker()
    await cleanOldJobs()
    console.log('[Main] Cleaning Redis...')
    await closeQueue()
    closeDb()
    if (browser) await browser.close()
    process.exit(0)
  })
}

main().catch(console.error)
