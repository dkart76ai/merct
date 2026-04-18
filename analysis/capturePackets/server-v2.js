const express = require('express')
const path = require('path')
const fs = require('fs')
const { firefox } = require('playwright')
const { loadEnvFile } = require('node:process')
const { kingdomUrls } = require('./kingdomUrls.js')
const { multiDecodeMsgPack2 } = require('../message-pack/messagePack.js')
const {
  addJob,
  addCritical,
  addHigh,
  addLow,
  addJobAndWait,
  getTimerManager,
  startWorker,
  stopWorker,
  getQueueStatus,
  getJob,
  closeQueue,
  JOB_TYPES,
  PRIORITY
} = require('./jobs/index.js')
const staticId = require('./staticId.js')
const { setChatPage, sendMessage, notifyDiscord } = require('./jobs/chatSender')
const {
  sendPacketHandler,
  extractObjectsHandler,
  saveObjectsHandler,
  findObjectsHandler,
  notificationHandler,
  processPacketHandler
} = require('./jobs/handlers')
const { findObjects, getStats, getAllObjects } = require('./jobs/database')
const { getRedis } = require('./jobs/redis')
loadEnvFile()

const config = {
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD
}
// const authPath = path.join(__dirname, 'auth', 'user.json')

const SAVE_DIR = path.join(__dirname, 'captures')
// const OPCODES_FILE = path.join(__dirname, 'opcodes.json')
// const MYPLAYER_FILE = path.join(__dirname, 'myplayer.json')
// const OBJECT_PACKETS_FILE = path.join(__dirname, 'samples', 'objectpackets.json')
// const OBJECT_PACKETS312_FILE = path.join(__dirname, 'samples', 'objectpackets312.json')
// const PROCESS_STATICID_FILE = path.join(__dirname, 'process-staticid.json')
// const CHAT_STATICID_FILE = path.join(__dirname, 'chat-staticid.json')
let unknownStaticIds = new Map() // staticId -> { coords: Set of "k,x,y" }

// const PACKET312 = {
//   kingdoms: [],
//   currentKingdom: null,
//   sessionToken: null,
//   buff: null
// }

// function mapToUint8Array(map) {
//   if (!map) return null
//   if (map instanceof Uint8Array) return map
//   const keys = Object.keys(map)
//     .map(Number)
//     .sort((a, b) => a - b)
//   if (keys.length === 0) return null
//   const arr = new Uint8Array(keys.length)
//   for (const k of keys) {
//     arr[k] = map[k]
//   }
//   return arr
// }

// let saveFileIndex = 0
// const MAX_CAPTURES_PER_FILE = 500

// async function fileExists(filePath) {
//   try {
//     await fs.access(filePath, fs.constants.F_OK)
//     return true
//   } catch {
//     return false
//   }
// }

// function extractObjects(data) {
//   const objects = []

//   function isValidObject(arr) {
//     if (!Array.isArray(arr) || arr.length !== 12) return false
//     if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
//     if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
//     if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
//     if (typeof arr[11] !== 'boolean') return false
//     return true
//   }

//   function findObjects(arr, depth = 0) {
//     if (depth > 200) return
//     for (const item of arr) {
//       if (Array.isArray(item)) {
//         if (isValidObject(item)) {
//           const staticId = item[1]
//           const known = staticId.getStaticIdData(staticId)
//           const obj = {
//             objectId: item[0][0],
//             staticId: staticId,
//             name: known?.name || null,
//             entryType: known?.entryType || null,
//             unk1: item[2],
//             unk2: item[3],
//             unk3: item[4],
//             level: item[5],
//             unk4: item[6],
//             unk5: item[7],
//             kingdom: item[8][0],
//             x: item[8][1],
//             y: item[8][2],
//             unk6: item[9][0],
//             extra: item[10],
//             isActive: item[11]
//           }
//           objects.push(obj)
//         } else {
//           findObjects(item, depth + 1)
//         }
//       }
//     }
//   }

//   findObjects(data)
//   return objects
// }

function getFirstValue(data) {
  if (!data || !Array.isArray(data)) return null

  try {
    for (let item of data) {
      if (typeof item === 'number') return item
      if (Array.isArray(item)) {
        const resultado = getFirstValue(item)
        if (resultado !== undefined) return resultado
      }
    }
  } catch (e) {
    console.error('[getFirstValue] ', e.message)
  }
  return null
}

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'public')))

let browser = null
let context = null
let page = null
let captures = []
let captureIndex = 0
// let autoSave = true
let capturingEnabled = true
// let uniqueOpcodes = new Set()
// let myPlayerPackets = []
// let objectPackets = []

// async function saveMyPlayerPackets() {
//   if (!myPlayerPackets.length) return
//   try {
//     const existing = (await fileExists(MYPLAYER_FILE))
//       ? JSON.parse(fs.readFileSync(MYPLAYER_FILE, 'utf8'))
//       : []
//     const merged = [...existing, ...myPlayerPackets].slice(-1000)
//     fs.writeFileSync(MYPLAYER_FILE, JSON.stringify(merged, null, 2))
//     console.log(`Saved ${myPlayerPackets.length} player packets (total: ${merged.length})`)
//     myPlayerPackets = []
//   } catch (e) {
//     console.error('Save my player packets error:', e.message)
//   }
// }

// async function saveObjectPackets() {
//   try {
//     const existing = (await fileExists(OBJECT_PACKETS_FILE))
//       ? JSON.parse(fs.readFileSync(OBJECT_PACKETS_FILE, 'utf8'))
//       : []
//     const merged = [...existing, ...objectPackets].slice(-MAX_CAPTURES_PER_FILE)
//     fs.writeFileSync(OBJECT_PACKETS_FILE, JSON.stringify(merged, null, 2))
//     console.log(`Saved ${objectPackets.length} object packets (total: ${merged.length})`)
//     objectPackets = []
//   } catch (e) {
//     console.error('Save object packets error:', e.message)
//   }
// }

// async function saveCaptures() {
//   if (!captures.length) return
//   try {
//     const savePath = path.join(SAVE_DIR, `captures-${saveFileIndex}.json`)
//     fs.writeFileSync(savePath, JSON.stringify(captures, null, 2))
//     saveFileIndex++
//     console.log(
//       `[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to ${savePath}`
//     )
//     captures = []
//   } catch (e) {
//     console.error('Save captures error:', e.message)
//   }
// }

async function ensureSaveDir() {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true })
    }
  } catch (e) {
    console.error('Ensure save dir error:', e.message)
  }
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

async function handleScanKingdom(req, res) {
  const { kingdoms, priority = 'HIGH' } = req.body

  console.log(`[API] scanKingdom request - kingdoms: ${kingdoms}, priority: ${priority}`)

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

  // // Ensure token is BigInt
  // const tokenValue = PACKET312.sessionToken
  // const tokenBigInt =
  //   typeof tokenValue === 'bigint'
  //     ? tokenValue
  //     : typeof tokenValue === 'number'
  //       ? BigInt(tokenValue)
  //       : typeof tokenValue === 'string' && !isNaN(Number(tokenValue))
  //         ? BigInt(tokenValue)
  //         : tokenValue

  const tilesArray = generateArrays()
  const jobIds = []

  console.log(`[API] Queuing ${tilesArray.length * kingdomList.length} scan jobs`)

  for (const kingdomId of kingdomList) {
    for (const tiles of tilesArray) {
      // const payload = buildPacketPayload(kingdomId, tiles, token1, token2)
      const payload = {
        kingdomId,
        tiles
      }
      const job =
        priority === 'CRITICAL'
          ? await addCritical(JOB_TYPES.SEND_PACKET, {
              ...payload,
              triggeredBy: 'manual'
            })
          : await addHigh(JOB_TYPES.SEND_PACKET, {
              ...payload,
              triggeredBy: 'manual'
            })

      jobIds.push({ kingdomId, jobId: job.id })
    }
  }

  res.json({
    success: true,
    message: `Queued ${jobIds.length} scan jobs`,
    jobIds
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
  const tilesArray = generateArrays()
  const timerManager = getTimerManager()

  for (const kingdomId of kingdomList) {
    timerManager.stopScan(kingdomId)

    for (const tiles of tilesArray) {
      timerManager.scheduleScanKingdom(kingdomId, {
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
    for (const kingdomId of kingdomList) {
      timerManager.stopScan(kingdomId)
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
            staticId.addOrUpdateStaticId(sub.staticId, {
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

function updateCapturesForClient(
  id,
  url,

  responseBody
) {
  let decodedResponse = multiDecodeMsgPack2(Buffer.from(responseBody))
  const opCode = getFirstValue(decodedResponse)

  captures.push({ id, url, opCode, response: { size: responseBody.length } })
}

function setupPacketCaptureListener() {
  if (!page) return

  page.on('response', async response => {
    if (!capturingEnabled) return

    const url = response.url()
    if (!url.includes('rubens-realm')) return

    try {
      const status = response.status()
      const responseHeaders = response.headers()
      const responseBody = await response.body()

      if (!responseBody || responseBody.length === 0) return
      if (responseHeaders['content-type']?.includes('text/html')) return

      const request = response.request()
      // const postData = request.postData()
      const postDataBuff = request.postDataBuffer()

      const requestKey = `request_data:${Date.now()}:${Math.random().toString(36).substring(7)}`
      const responseKey = `response_data:${Date.now()}:${Math.random().toString(36).substring(7)}`

      // 1. Guardar el binario directamente (Redis maneja Buffers de forma nativa)
      // Ponemos un TTL de 5min ('EX', 300) para no llenar la RAM si el worker falla
      const redisClient = getRedis()
      await redisClient.set(requestKey, postDataBuff, 'EX', 60 * 5)
      await redisClient.set(responseKey, responseBody, 'EX', 300)

      const payload = {
        url,
        status,
        requestKey,
        responseKey,
        requestMethod: request.method(),
        requestHeaders: request.headers(),
        responseHeaders
      }

      await addJob(JOB_TYPES.PROCESS_PACKET, payload, {
        priority: PRIORITY.CRITICAL
      })

      updateCapturesForClient(
        ++captureIndex,
        url,

        responseBody
      )
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

  // if (await fileExists(authPath)) {
  //   options.storageState = authPath
  // }

  context = await browser.newContext(options)
  page = await context.newPage()

  // Set chat page for notification handler
  setChatPage(page)
}

async function browserLoadUrlAndLogin() {
  if (!page) return

  await page.goto('https://totalbattle.com/es', { timeout: 70000 })
  await page.waitForTimeout(10000)

  // Login if needed
  const loginInput = page.getByRole('textbox', { name: 'E-mail' })
  if (await loginInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  Logging in...`)
    const loginButton = page.locator('#registration').getByText('Iniciar sesión')
    if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginButton.click()
      await page.waitForTimeout(500)
    }
    await loginInput.fill(config.accountUser)
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(config.accountPwd)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
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
  const count = staticId.getStaticIdSize()
  const limit = parseInt(req.query.limit) || 100
  const offset = parseInt(req.query.offset) || 0
  const allEntries = staticId.getStaticIdValues()
  const entries = allEntries.slice(offset, offset + limit)
  console.log('Sending staticId Db', offset, '-', offset + entries.length, 'of', count)
  res.json({ success: true, items: entries, count, offset, limit })
})

// Objects database endpoints
// app.get('/api/objects', (req, res) => {
//   const objects = getAllObjects()
//   res.json({ success: true, count: objects.length, objects })
// })

// app.get('/api/objects/stats', (req, res) => {
//   const stats = getStats()
//   res.json({ success: true, ...stats })
// })

// app.post('/api/objects/find', async (req, res) => {
//   const { staticId, level, amount = 10 } = req.body

//   const result = findObjects({ staticId, level, amount })
//   res.json({ success: true, ...result })
// })

app.post('/api/objects/find-and-notify', async (req, res) => {
  const { staticId, level, amount = 10, notificationConfig } = req.body

  const result = findObjects({ staticId, level, amount })

  if (result.objects.length > 0) {
    await addJob(JOB_TYPES.NOTIFICATION, {
      type: 'objects-found',
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
    amount: 20,
    triggeredBy: 'timer-mercs'
  }

  await timerManager.scheduleCustom(timerKey, parseInt(interval), JOB_TYPES.FIND_OBJECTS, jobData)

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
      objects: result.objects,
      searchCriteria: { staticId: 400, level, amount }
    })
    res.json({ success: true, found: result.returned, total: result.total, notified: true })
  } else {
    res.json({ success: true, found: 0, notified: false })
  }
})

app.get('/api/captures', (req, res) => {
  res.json({ success: true, captures: captures.slice(-50), count: captures.length })
})

app.get('/api/captures/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const capture = captures.find(c => c.id === id)
  if (capture) {
    res.json({ success: true, capture })
  } else {
    res.status(404).json({ success: false, error: 'Not found' })
  }
})

app.post('/api/browser/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: false, error: 'Browser already running' })
    }

    await browserInitialize()

    setupWebsocketListener()
    patchSendbird()
    setupPacketCaptureListener()

    await browserLoadUrlAndLogin()

    res.json({ success: true, message: 'Browser started' })
  } catch (error) {
    console.error('Browser start error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/browser/status', (req, res) => {
  res.json({
    success: true,
    running: !!browser,
    capturing: capturingEnabled
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

// app.get('/api/opcodes', (req, res) => {
//   res.json({ success: true, opcodes: Array.from(uniqueOpcodes).sort((a, b) => a - b) })
// })

async function main() {
  console.log('[Main] Starting server...')

  await ensureSaveDir()
  staticId.loadStaticDb()

  console.log('[Main] Starting BullMQ worker...')

  const handlers = {
    [JOB_TYPES.SEND_PACKET]: sendPacketHandler,
    [JOB_TYPES.EXTRACT_OBJECTS]: extractObjectsHandler,
    [JOB_TYPES.SAVE_OBJECTS]: saveObjectsHandler,
    [JOB_TYPES.FIND_OBJECTS]: findObjectsHandler,
    [JOB_TYPES.NOTIFICATION]: notificationHandler,
    [JOB_TYPES.PROCESS_PACKET]: processPacketHandler
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

    notifyDiscord('٩(̾●̮̮̃̾•̃̾)۶') //┌∩┐(◣_◢)┌∩┐
    sendMessage('٩(̾●̮̮̃̾•̃̾)۶') // ۜ\(סּںסּَ` )/ۜ
  })

  process.on('SIGINT', async () => {
    console.log('\n[Main] Shutting down...')
    await stopWorker()
    await closeQueue()
    if (browser) await browser.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Main] Shutting down...')
    await stopWorker()
    await closeQueue()
    if (browser) await browser.close()
    process.exit(0)
  })
}

main().catch(console.error)
