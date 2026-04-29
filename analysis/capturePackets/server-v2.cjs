const express = require('express')
const path = require('path')
const fs = require('fs')
const { firefox } = require('playwright')
const { loadEnvFile } = require('node:process')
const { createStream } = require('rotating-file-stream')
const msgpack = require('@msgpack/msgpack')

const { kingdomUrls } = require('./lib/kingdomUrls.js')
const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  getRequestHeader,
  getMsgPack2ndBlockRequest,
  scanPacket312
} = require('./lib/messagePack.js')
const { addGameNotificationJob } = require('./jobs/index')

const { addJob, initializeWorkers, stopWorkers } = require('./jobs/index.js')
const { getTimerManager, cleanOldJobs, getQueueStatus, closeQueue } = require('./jobs/queues.js')
const { JOB_TYPES, PRIORITY } = require('./jobs/constants.js')
const { getPool, processPacket, scanKingdom } = require('./lib/workerPool.js')

const staticIdRedis = require('./lib/staticIdRedis.js')
const chatChannels = require('./lib/chatChannels.js')
const { setChatPage, getChatPage, sendMessage, notifyDiscord } = require('./jobs/chatSender.js')

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
const CHAT_CHANNEL_URL = process.env.CHAT_CHANNEL_URL || ''

const config = {
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD
}

/***SENDBIRD KEY CONSTANTS FOR GAME */
const DEFAULT_KINGDOM = 'CONFIG:DEFAULT_KINGDOM'
const ACTIVE_CHAT_CHANNEL = 'CONFIG:ACTIVE_CHAT_CHANNEL'
const SCAN_OTHER_KINGDOMS_KEY = 'TIMERS:SCAN_OTHER_KINGDOMS_KEY'

// const SAVE_DIR = path.join(__dirname, 'captures')
// const SAVE_DIR2 = path.join(__dirname, 'packetSender')
const LOGS_DIR = path.join(__dirname, 'logs')
const LOGS_DIR2 = path.join(__dirname, 'decoded-logs')
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
const PORT = process.env.PORT || 4000

app.use(express.json({ limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'public')))

let browser = null
let context = null
let page = null
let gameLoaded = false
let websocketHooked = false
let captureHooked = false
let sendBirdHooked = false
// let captures = []
// let captureIndex = 0
let capturingEnabled = false
const redisClient = getRedis()

async function ensureSaveDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true })
    }

    if (!fs.existsSync(PACKET_SAMPLE_DIR)) {
      fs.mkdirSync(PACKET_SAMPLE_DIR, { recursive: true })
    }
  } catch (e) {
    console.error('Ensure save dir error:', e.message)
  }
}

// async function extractChatStaticIds(msgData) {
//   try {
//     const data = JSON.parse(msgData)
//     if (data.subs) {
//       for (const key in data.subs) {
//         const sub = data.subs[key]
//         if (sub.staticId && sub.entryType) {
//           const known = staticIdRedis.getStaticIdData(sub.staticId)

//           if (!known.entryType || !known.name) {
//             await staticIdRedis.addOrUpdateStaticId(sub.staticId, {
//               // entryType: sub.entryType,
//               name: sub.name || null
//             })
//             console.log('updating ', sub.staticId, sub.name)
//           }
//         }
//       }
//     }
//   } catch (e) {
//     console.error('[extractChatStaticIds] Error: parsing data', e.message)
//   }
// }

function setupWebsocketListener() {
  if (!page) return
  if (websocketHooked) return

  page.on('websocket', async ws => {
    console.log(`[${new Date().toLocaleTimeString()}] WebSocket opened: ${ws.url()}`)

    ws.on('framesent', data => {})

    ws.on('framereceived', async data => {
      try {
        const text = data.payload.toString('utf8')
        if (text.startsWith('MESG')) {
          try {
            const jsonMatch = text.match(/MESG(\{.*\})/)
            if (!jsonMatch) return

            const msgData = JSON.parse(jsonMatch[1])
            const channelUrl = msgData.channel_url
            const channelType = msgData.channel_type
            const message = msgData.message
            // if (msgData.data) {
            //   extractChatStaticIds(msgData.data)
            // }
            const activeChatChannel = await redisClient.get(ACTIVE_CHAT_CHANNEL)
            const validChannels = [activeChatChannel, CHAT_CHANNEL_URL].filter(Boolean)
            if (validChannels.includes(channelUrl)) {
              // message from chat channel registered
              console.log(`📨 Chat message from ${channelUrl}: ${message}`)
              if (message.startsWith('mmfind')) {
                // const pattern = /(\d+)\s+(.+)\s+(?:level|lvl)\s+(\d+)/
                const pattern = /^mmfind\s+(\d+)\s+(.+)\s+(?:level|lvl)\s*(\d+)/i
                const match = message.match(pattern)

                if (match) {
                  const [fullMatch, _amount, _name, _level] = match
                  // mmfind 2 crypts level 20

                  if (_name !== '' && _level !== '') {
                    const level = parseInt(_level) || 0
                    const amount = Math.max(parseInt(_amount) || 10, 10)
                    const name = _name

                    const results = findObjects({ name, level, amount })

                    /*

 {
  total: 2,
  returned: 2,
  objects: [
    {
      id: 62085,      key: '146:642:932',      objectId: '627373445560',
      staticId: 2407, name: 'Crypt', level: 20, kingdom: 146, x: 642, y: 932,
      timestamp: 0,      firstSeenAt: 1777471009216,      lastSeenAt: 1777471009216,
      seenCount: 1,      warning: 0,      warningSetAt: null,
      data: '{"objectId":627373445560,"staticId":2407,"level":20,"kingdom":146,"x":642,"y":932,"timestamp":0,"isUnlocked":false,"name":"Crypt"}'
    },
]}
                    */

                    if (results.total > 0) {
                      for (obj of results.objects) {
                        await addGameNotificationJob({
                          object: {
                            k: obj.kingdom,
                            x: obj.x,
                            y: obj.y,
                            staticId: obj.staticId
                          },
                          message: obj.name,
                          toMainChannel: true
                        })
                      }
                    }
                    console.log('[BOT] mmfind', amount, name, level, 'results', results)
                  }
                }
              }
            }
          } catch (e) {
            console.error('[websocket] Error: parsing data', e.message)
          }
        }
      } catch (e) {}
    })

    ws.on('close', () => {
      console.log(`[${new Date().toLocaleTimeString()}] WebSocket closed`)
    })
  })

  websocketHooked = true
}

async function updateValidChannels(newChannel) {
  if (!page) return

  const newChannels = [newChannel, CHAT_CHANNEL_URL].filter(Boolean)

  // Inyectamos el nuevo valor directamente en la memoria del navegador
  await page.evaluate(channels => {
    if (window.BOT_VALID_CHANNELS) {
      window.BOT_VALID_CHANNELS = channels
      console.log('Canales de bot actualizados:', channels)
    }
  }, newChannels)
}

async function getGameChatChannels() {
  if (!page) return { success: false, error: 'no page is set' }

  const result = await page.evaluate(
    (/*{ param }*/) => {
      try {
        // use game's own SendBirdHelper — no new connection needed
        if (!window.SendBirdHelper?.sb) {
          return { success: false, error: 'SendBirdHelper not ready' }
        }
        const state = window.SendBirdHelper?.sb.connectionState
        if (state !== 'OPEN') {
          console.log('chat not connected')
          return { success: false, error: 'SendBirdHelper not ready', state }
        }

        return { success: true, channels: window.SendBirdHelper.channelsList }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
    // { param }
  )

  return result
}

async function patchSendbird() {
  if (!page) return
  if (sendBirdHooked) return

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

  // 1. Exponer función para que el Worker de BullMQ pueda enviar mensajes
  // await page.exposeFunction('sendChatMessage', async (channelUrl, message, data) => {
  // codigo contenido, ejm page.evaluate(...)
  // })

  // eso crea un window.sendChatMessage(channelUrl, message, data) encapsula codigo contenido
  // pa que quede mejor organizado
  //luego en otra parte, para acceder al objeto window y al metodo sendChatMessage
  //await globalPage.sendChatMessage(url,'msg',{a:1})
  // const activeChatChannel = await redisClient.get(ACTIVE_CHAT_CHANNEL)
  // const validChannels = [activeChatChannel, CHAT_CHANNEL_URL].filter(Boolean)

  await page.addInitScript(() => {
    window.log = console.log
  })

  // await page.addInitScript(channels => {
  //   console.log('valid channels setted', channels)
  //   window.BOT_VALID_CHANNELS = channels
  // }, validChannels)

  // Escuchar cuando el script inyectado detecta un @find
  await page.exposeFunction('onCommandFound', ({ channel, message }) => {
    // const [, amount, objectType, level] = message.split(' ')
    console.log('bot message', channel, message)

    // if (!validChannels.includes(channel.url)) return

    // if (message.message?.startsWith('@find')) {
    //   // findQueue.add('FIND_OBJECT', { ...data, amount, objectType, level })
    // }
  })

  sendBirdHooked = true
}

function setupPacketCaptureListener() {
  if (!page) return
  if (captureHooked) return

  page.on('response', async response => {
    const url = response.url()
    if (!url.includes('rubens-realm')) return

    const _kingdom = url.split('rubens-realm')[1]
    // const kingdom = parseInt(_kingdom)

    gameLoaded = true //update here, got packets, so we are in-game

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

      if (capturingEnabled) {
        const ignoreOpcodes = [318]
        if (!ignoreOpcodes.includes(opCode)) {
          saveTrafficPair(url, postDataBuff, responseBody, opCode)
        }
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
      }
      const payload = {
        request: postDataBuff,
        response: responseBody,
        shouldSaveObjects: false // manual scrolling
      }
      const result = await processPacket(payload)
    } catch (e) {
      console.error('Capture error:', e.message)
    }
  })

  captureHooked = true
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

async function handleScanKingdom(req, res) {
  // manual scan default kingdoms, use worker_threads, no jobs
  const kingdom = await redisClient.get(DEFAULT_KINGDOM)
  if (!kingdom) {
    return res.json({ success: false, error: 'no default kingdom is set' })
  }

  try {
    //llama directo al worker thread
    await scanKingdom(kingdom, true /* save objects */)
  } catch (error) {
    console.log('error', error.message)
    return res.json({ success: false, error: error.message })
  }

  res.json({
    success: true,
    message: `kingdom ${kingdom} scanned`
  })
}

async function handleStartTimer(req, res) {
  const { interval = 60000, priority = 'LOW' } = req.body

  const kingdom = await redisClient.get(DEFAULT_KINGDOM)
  if (!kingdom) {
    return res.json({ success: false, error: 'no default kingdom is set' })
  }

  console.log(`[API] startTimer - kingdom: ${kingdom}, interval: ${interval}ms`)

  const timerManager = await getTimerManager()

  //crea un queue, periodico, para llamar a  scanKingdom con worker_threads
  timerManager.scheduleScanKingdom(kingdom, {
    intervalMs: parseInt(interval),
    shouldSaveObjects: true
  })

  res.json({
    success: true,
    message: `Started timer for ${kingdom} kingdom`
  })
}

async function handleStopTimer(req, res) {
  const kingdom = await redisClient.get(DEFAULT_KINGDOM)
  if (!kingdom) {
    return res.json({ success: false, error: 'no default kingdom is set' })
  }

  const timerManager = await getTimerManager()

  timerManager.stopScan(kingdom)
  res.json({ success: true, message: `Stopped timers for ${kingdom} kingdom` })
}

// Scan for other kingdoms timer
app.post('/api/timer/scan-other-kingdoms', async (req, res) => {
  const { interval = 60000, kingdoms, key } = req.body
  console.log('kingdom', req.body)

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

  await redisClient.set(SCAN_OTHER_KINGDOMS_KEY + key, kingdoms)

  const timerManager = await getTimerManager()

  try {
    for (const kingdom of kingdomList) {
      const payload = {
        kingdom,
        shouldSaveObjects: false
      }
      const timerKey = `kingdom:${kingdom}`
      await timerManager.scheduleCustom(
        timerKey,
        parseInt(interval),
        JOB_TYPES.SCAN_KINGDOM,
        payload,
        {
          priority: PRIORITY.NORMAL
        }
      )
    }
    res.json({
      success: true,
      message: `kingdom ${kingdoms} scanner started every ${interval}ms`,
      interval
    })
  } catch (error) {
    console.log('error', error.message)
    return res.json({ success: false, error: error.message })
  }
})

app.post('/api/timer/stop-scan-other-kingdoms', async (req, res) => {
  const { key } = req.body
  const kingdoms = await redisClient.get(SCAN_OTHER_KINGDOMS_KEY + key)
  if (!kingdoms) {
    return res.json({ success: false, error: 'no kingdoms, already stoped' })
  }

  const timerManager = await getTimerManager()

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }

  try {
    for (const kingdom of kingdomList) {
      const timerKey = `kingdom:${kingdom}`
      await timerManager.stopByKey(timerKey)
    }

    await redisClient.del(SCAN_OTHER_KINGDOMS_KEY + key)
    res.json({ success: true, message: `${kingdoms} Kingdoms scanner stopped` })
  } catch (error) {
    console.log('error', error.message)
    return res.json({ success: false, error: error.message })
  }
})

// Manual find and queue notification
async function handleScanOtherKingdom(req, res) {
  // manual scan any kingdoms, use worker_threads, no jobs
  const { kingdoms } = req.body

  console.log('kingsomd', req.body)
  if (!kingdoms || kingdoms.trim() === '') {
    return res.json({ success: false, error: 'enter kingdom' })
  }
  console.log(`[API] scan other Kingdom request - kingdoms: ${kingdoms} `)

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }

  try {
    for (const kingdom of kingdomList) {
      await scanKingdom(kingdom, false /* dont save objects */)
    }
  } catch (error) {
    console.log('error', error.message)
    return res.json({ success: false, error: error.message })
  }

  res.json({
    success: true,
    message: `kingdom ${kingdoms} scanned`
  })
}

app.post('/api/scan-other-kingdoms-now', handleScanOtherKingdom)

app.get('/api/gameChatChannels', async (req, res) => {
  try {
    const result = await getGameChatChannels()

    const activeChatChannel = await redisClient.get(ACTIVE_CHAT_CHANNEL)

    if (result.success) {
      console.log('chat channels ', result?.channels.length)
    } else {
      console.log('chat channel', result?.error)
    }
    if (result.success) {
      res.json({ success: true, channels: result.channels, activeChatChannel })
    } else {
      res.json({ success: true, channels: [] })
    }
  } catch (error) {
    console.error('Error fetching chat channels:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/gameChatChannels', async (req, res) => {
  try {
    const { channel } = req.body
    console.log('setting chat channel', channel)
    await redisClient.set(ACTIVE_CHAT_CHANNEL, channel)

    updateValidChannels(channel)

    res.json({ success: true, message: `chat channel set to ${channel}`, channel })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/kingdom', async (req, res) => {
  try {
    const { kingdom } = req.body
    console.log('back kingdm', kingdom)
    const k = parseInt(kingdom)
    if (!kingdomUrls[k]) {
      return res.json({ success: false, error: 'Invalid kingdom' })
    }

    await redisClient.set(DEFAULT_KINGDOM, k)

    res.json({ success: true, message: `Default kingdom set to ${kingdom}`, kingdom })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/scanKingdom', handleScanKingdom)

app.post('/api/timer/start', handleStartTimer)

app.post('/api/timer/stop', handleStopTimer)

// Health check endpoint for Docker

// Debug endpoint to check memory and DB stats
// app.get('/api/debug', (req, res) => {
//   const used = process.memoryUsage()
//   const dbStats = getStats()
//   res.json({
//     memory: {
//       heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
//       heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
//       rss: Math.round(used.rss / 1024 / 1024) + ' MB',
//       external: Math.round(used.external / 1024 / 1024) + ' MB'
//     },
//     database: dbStats,
//     uptime: process.uptime()
//   })
// })

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

    res.json({ success: true, status })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/timer/stop-all', async (req, res) => {
  const timerManager = await getTimerManager()

  await timerManager.stopAll()
  res.json({ success: true, message: 'All timers stopped' })
})

app.get('/api/timers', async (req, res) => {
  try {
    const timerManager = await getTimerManager()
    const active = await timerManager.getActiveTimers()
    res.json({ success: true, timers: active })
  } catch (error) {
    console.error('[API] /api/timers error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/objects/find-and-notify', async (req, res) => {
  const { staticId, level, amount = 10 } = req.body

  const nStaticId = parseInt(staticId)
  const nLevel = parseInt(level)
  const nAmount = parseInt(amount)

  const result = findObjects({ staticId: nStaticId, level: nLevel, amount: nAmount })

  if (result.objects.length > 0) {
    await addJob(JOB_TYPES.NOTIFICATION, {
      type: 'objects-found',
      priority: PRIORITY.LOW,
      objects: result.objects,
      searchCriteria: { staticId, level, amount }
    })
    res.json({ success: true, ...result, notified: result.objects.length > 0 })
  } else {
    res.json({ success: true, found: 0, notified: false })
  }
})

// async (req, res) => {
// const { kingdoms } = req.body

// const result = findObjects({ staticId: 400, level, amount })

// if (result.objects.length > 0) {
//   await addJob(JOB_TYPES.NOTIFICATION, {
//     type: 'mercs-found',
//     priority: PRIORITY.LOW,
//     objects: result.objects,
//     searchCriteria: { staticId: 400, level, amount }
//   })
//   res.json({ success: true, found: result.returned, total: result.total, notified: true })
// } else {
//   res.json({ success: true, found: 0, notified: false })
// }
// })

// app.get('/api/captures', (req, res) => {
//   res.json({ success: true, captures: [], count: 0 })
// })

// app.get('/api/captures/:id', (req, res) => {
//   // const id = parseInt(req.params.id)
//   // const capture = captures.find(c => c.id === id)
//   // if (capture) {
//   //   res.json({ success: true, capture:[] })
//   // } else {
//   res.status(404).json({ success: false, error: 'Not found' })
//   // }
// })

app.post('/api/browser/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: false, error: 'Browser already running' })
    }

    await browserInitialize()

    // setupWebsocketListener()
    await patchSendbird()

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
  const kingdom = await redisClient.get(DEFAULT_KINGDOM)

  const activeChatChannel = await redisClient.get(ACTIVE_CHAT_CHANNEL)

  res.json({
    success: true,
    running: !!browser,
    capturing: capturingEnabled,
    gameLoaded,
    kingdom,
    activeChatChannel,
    token1,
    token2
  })
})

app.post('/api/browser/stop', async (req, res) => {
  try {
    if (browser) {
      await browser.close()
      browser = null
      page = null
      context = null
      websocketHooked = false
      captureHooked = false
      sendBirdHooked = false
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// Chat Channels API
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await chatChannels.getChannels()
    res.json({ success: true, channels })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/channels', async (req, res) => {
  try {
    const { name, channelUrl } = req.body
    if (!name || !channelUrl) {
      return res.status(400).json({ success: false, error: 'name and channelUrl required' })
    }
    const channels = await chatChannels.addChannel({ name, channelUrl })
    res.json({ success: true, channels })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.delete('/api/channels/:index', async (req, res) => {
  try {
    const { index } = req.params
    const channels = await chatChannels.removeChannel(index)
    res.json({ success: true, channels })
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

  // Wait for Redis to be ready first
  console.log('[Main] Waiting for Redis...')
  try {
    await staticIdRedis.getRedis().ping()
    console.log('[Main] Redis connected')
  } catch (e) {
    console.error('[Main] Redis not available:', e.message)
  }

  await ensureSaveDir()
  initDb()

  // Initialize Redis operations sequentially (only after Redis is ready)
  try {
    await staticIdRedis.setupIndex()
    console.log('[Main] StaticId Redis index ready')
  } catch (e) {
    console.error('[Main] setupIndex error:', e.message)
  }

  try {
    await staticIdRedis.init()
    console.log('[Main] StaticId Redis data loaded')
  } catch (e) {
    console.error('[Main] init error:', e.message)
  }

  startCleanup()

  // Test static ID lookup (non-blocking)
  staticIdRedis
    .getStaticIdData(1531)
    .then(data => {
      console.log('[Main] StaticId lookup test:', data)
    })
    .catch(e => {
      console.error('[Main] StaticId lookup error:', e.message)
    })

  // Initialize worker pool (non-blocking CPU tasks)
  getPool() //worker_threads

  console.log('[Main] Starting BullMQ worker...')

  initializeWorkers() // bullmq

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
    console.log('  GET  /api/channels - Get chat channels')
    console.log('  POST /api/channels - Add chat channel')
    console.log('  DELETE /api/channels/:index - Remove chat channel')

    // notifyDiscord('٩(̾●̮̮̃̾•̃̾)۶') //┌∩┐(◣_◢)┌∩┐
    // sendMessage(CHAT_CHANNEL_URL,'٩(̾●̮̮̃̾•̃̾)۶') // ۜ\(סּںסּَ` )/ۜ
  })

  process.on('SIGINT', async () => {
    console.log('\n[Main] Shutting down...')
    // await staticIdRedis.dump()
    //await staticIdRedis.close()
    await stopWorkers()
    await cleanOldJobs()
    console.log('[Main] Cleaning Redis...')
    await closeQueue()
    closeDb()
    if (browser) await browser.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Main] Shutting down...')
    // await staticIdRedis.dump()
    //await staticIdRedis.close()
    await stopWorkers()
    await cleanOldJobs()
    console.log('[Main] Cleaning Redis...')
    await closeQueue()
    closeDb()
    if (browser) await browser.close()
    process.exit(0)
  })
}

main().catch(console.error)
