const express = require('express')
const path = require('path')
const fs = require('fs')
const { firefox } = require('playwright')
const { loadEnvFile } = require('node:process')
const { kingdomUrls } = require('./kingdomUrls.js')
const {
  decodeMsgPack,
  decodeMsgPackBase64,
  multiDecodeMsgPackBase64,
  multiDecodeMsgPack2,
  encodeMsgPack2,
  encodeMsgPack2MultiFragments,
  encodeBase64,
  decodeBase64,
  decodeMsgPack2
} = require('../message-pack/messagePack.js')
const {
  initializeJobs,
  getJobQueue,
  getTimerManager,
  shutdownJobs,
  PRIORITY
} = require('./jobs/index.js')
const { staticIdDb, loadStaticDb, saveStaticDb, addOrUpdateStaticId } = require('./staticId.js')

loadEnvFile()

const config = {
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD,
  channelUrl: process.env.CHAT_CHANNEL_URL || '',
  discordWebhook: process.env.DISCORD_WEBHOOK_URL || '',
  chatChannel: process.env.CHAT_CHANNEL_ID || ''
}

const SAVE_DIR = path.join(__dirname, 'captures')
const OPCODES_FILE = path.join(__dirname, 'opcodes.json')
const MYPLAYER_FILE = path.join(__dirname, 'myplayer.json')
const OBJECT_PACKETS_FILE = path.join(__dirname, 'samples', 'objectpackets.json')
const OBJECT_PACKETS312_FILE = path.join(__dirname, 'samples', 'objectpackets312.json')
const PROCESS_STATICID_FILE = path.join(__dirname, 'process-staticid.json')
const CHAT_STATICID_FILE = path.join(__dirname, 'chat-staticid.json')

const PACKET312 = {
  kingdoms: [],
  currentKingdom: null,
  sessionToken: null,
  buff: null
}

function mapToUint8Array(map) {
  if (!map) return null
  if (map instanceof Uint8Array) return map
  const keys = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
  if (keys.length === 0) return null
  const arr = new Uint8Array(keys.length)
  for (const k of keys) {
    arr[k] = map[k]
  }
  return arr
}

let saveFileIndex = 0
const MAX_CAPTURES_PER_FILE = 500

async function fileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function extractObjects(data) {
  const objects = []

  function isValidObject(arr) {
    if (!Array.isArray(arr) || arr.length !== 12) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
    if (typeof arr[11] !== 'boolean') return false
    return true
  }

  function findObjects(arr, depth = 0) {
    if (depth > 200) return
    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          const staticId = item[1]
          const known = staticIdDb.get(String(staticId))
          const obj = {
            objectId: item[0][0],
            staticId: staticId,
            name: known?.name || null,
            entryType: known?.entryType || null,
            unk1: item[2],
            unk2: item[3],
            unk3: item[4],
            level: item[5],
            unk4: item[6],
            unk5: item[7],
            kingdom: item[8][0],
            x: item[8][1],
            y: item[8][2],
            unk6: item[9][0],
            extra: item[10],
            isActive: item[11]
          }
          objects.push(obj)
        } else {
          findObjects(item, depth + 1)
        }
      }
    }
  }

  findObjects(data)
  return objects
}

function getFirstValue(data) {
  for (let item of data) {
    if (typeof item === 'number') return item
    if (Array.isArray(item)) {
      const resultado = getFirstValue(item)
      if (resultado !== undefined) return resultado
    }
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
let autoSave = true
let capturingEnabled = false
let uniqueOpcodes = new Set()
let myPlayerPackets = []

async function saveMyPlayerPackets() {
  if (!myPlayerPackets.length) return
  try {
    const existing = (await fileExists(MYPLAYER_FILE))
      ? JSON.parse(fs.readFileSync(MYPLAYER_FILE, 'utf8'))
      : []
    const merged = [...existing, ...myPlayerPackets].slice(-1000)
    fs.writeFileSync(MYPLAYER_FILE, JSON.stringify(merged, null, 2))
    console.log(`Saved ${myPlayerPackets.length} player packets (total: ${merged.length})`)
    myPlayerPackets = []
  } catch (e) {
    console.error('Save my player packets error:', e.message)
  }
}

async function saveObjectPackets() {
  try {
    const existing = (await fileExists(OBJECT_PACKETS_FILE))
      ? JSON.parse(fs.readFileSync(OBJECT_PACKETS_FILE, 'utf8'))
      : []
    const merged = [...existing, ...objectPackets].slice(-MAX_CAPTURES_PER_FILE)
    fs.writeFileSync(OBJECT_PACKETS_FILE, JSON.stringify(merged, null, 2))
    console.log(`Saved ${objectPackets.length} object packets (total: ${merged.length})`)
    objectPackets = []
  } catch (e) {
    console.error('Save object packets error:', e.message)
  }
}

let objectPackets = []

async function saveCaptures() {
  if (!captures.length) return
  try {
    const savePath = path.join(SAVE_DIR, `captures-${saveFileIndex}.json`)
    fs.writeFileSync(savePath, JSON.stringify(captures, null, 2))
    saveFileIndex++
    console.log(
      `[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to ${savePath}`
    )
    captures = []
  } catch (e) {
    console.error('Save captures error:', e.message)
  }
}

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

function buildPacketPayload(kingdomId, tiles, tokenBigInt) {
  const url = kingdomUrls[kingdomId]
  if (!url) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1

  const buff312 = [
    [312, randomSeq, [[tokenBigInt], mapToUint8Array(PACKET312.buff)], ''],
    [tiles, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [], []]
  ]

  const encoded = encodeMsgPack2MultiFragments(buff312)

  return {
    url,
    data: buff312,
    encoded: Array.from(encoded),
    kingdom: kingdomId,
    seq: randomSeq
  }
}

async function handleScanKingdom(req, res) {
  const { kingdoms, priority = 'HIGH' } = req.body

  console.log(`[API] scanKingdom request - kingdoms: ${kingdoms}, priority: ${priority}`)

  if (!kingdoms || kingdoms.trim() === '') {
    return res.json({ success: false, error: 'enter kingdom' })
  }

  if (!PACKET312.sessionToken) {
    return res.json({ success: false, error: 'no session token' })
  }

  if (!PACKET312.buff) {
    return res.json({ success: false, error: 'no auth buf' })
  }

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }

  // Ensure token is BigInt
  const tokenValue = PACKET312.sessionToken
  const tokenBigInt =
    typeof tokenValue === 'bigint'
      ? tokenValue
      : typeof tokenValue === 'number'
        ? BigInt(tokenValue)
        : typeof tokenValue === 'string' && !isNaN(Number(tokenValue))
          ? BigInt(tokenValue)
          : tokenValue

  const tilesArray = generateArrays()
  const jobQueue = getJobQueue()
  const jobIds = []

  console.log(`[API] Queuing ${tilesArray.length * kingdomList.length} scan jobs`)

  for (const kingdomId of kingdomList) {
    for (const tiles of tilesArray) {
      const payload = buildPacketPayload(kingdomId, tiles, tokenBigInt)

      const jobId =
        priority === 'CRITICAL'
          ? await jobQueue.addCritical('send-packet', {
              url: payload.url,
              data: payload.data,
              kingdom: kingdomId,
              triggeredBy: 'manual',
              notificationConfig: config
            })
          : await jobQueue.addHigh('send-packet', {
              url: payload.url,
              data: payload.data,
              kingdom: kingdomId,
              triggeredBy: 'manual',
              notificationConfig: config
            })

      jobIds.push({ kingdomId, jobId })
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

  if (!PACKET312.sessionToken || !PACKET312.buff) {
    return res.json({ success: false, error: 'missing session token or auth buf' })
  }

  const kingdomList = kingdoms
    .split(',')
    .map(k => parseInt(k.trim()))
    .filter(k => kingdomUrls[k])

  if (kingdomList.length === 0) {
    return res.json({ success: false, error: 'no valid kingdoms' })
  }

  const timerManager = getTimerManager()

  for (const kingdomId of kingdomList) {
    // Ensure token is BigInt
    const tokenValue = PACKET312.sessionToken
    const tokenBigInt =
      typeof tokenValue === 'bigint'
        ? tokenValue
        : typeof tokenValue === 'number'
          ? BigInt(tokenValue)
          : typeof tokenValue === 'string' && !isNaN(Number(tokenValue))
            ? BigInt(tokenValue)
            : tokenValue

    timerManager.scheduleScanKingdom(kingdomId, {
      intervalMs: parseInt(interval),
      payloadBuilder: async kId => {
        const tiles = [9, 59, 109, 159, 209, 259, 309, 359, 409, 459, 509, 559]
        return buildPacketPayload(kId, tiles, tokenBigInt)
      }
    })
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

app.post('/api/scanKingdom', handleScanKingdom)

app.post('/api/timer/start', handleStartTimer)

app.post('/api/timer/stop', handleStopTimer)

app.post('/api/stop', async (req, res) => {
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

app.get('/api/jobs/status', async (req, res) => {
  try {
    const jobQueue = getJobQueue()
    const status = await jobQueue.getStatus()
    res.json({ success: true, ...status })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const jobQueue = getJobQueue()
    const job = await jobQueue.getJob(req.params.jobId)
    if (job) {
      res.json({ success: true, job })
    } else {
      res.status(404).json({ success: false, error: 'Job not found' })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/jobs/cancel', async (req, res) => {
  try {
    const { type, kingdom } = req.body
    const jobQueue = getJobQueue()

    const cancelled = await jobQueue.cancelJobs(job => {
      if (type && job.type !== type) return false
      if (kingdom && job.payload.kingdom !== kingdom) return false
      return true
    })

    res.json({ success: true, cancelled })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/timers', (req, res) => {
  const timerManager = getTimerManager()
  const active = timerManager.getActiveTimers()
  res.json({ success: true, timers: active })
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

app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="captures-${Date.now()}.json"`)
  res.json(captures)
})

app.post('/api/browser/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: false, error: 'Browser already running' })
    }

    browser = await firefox.launch({ headless: true })
    context = await browser.newContext()
    page = await context.newPage()

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

  try {
    capturingEnabled = true

    page.on('request', async request => {
      if (!capturingEnabled) return
      const url = request.url()

      if (url.includes('totalbattle.com')) {
        try {
          const postData = request.postData()
          const headers = request.headers()

          if (postData && headers['content-type'] === 'application/octet-stream') {
            let postDataBuff = null

            try {
              postDataBuff = Buffer.from(postData)
            } catch (e) {}

            const opCode =
              postDataBuff && postDataBuff.length >= 8
                ? new DataView(postDataBuff.buffer).getUint32(0, true)
                : null

            if (opCode) {
              uniqueOpcodes.add(opCode)

              const body = (await request.response().then(r => r?.buffer())) || Buffer.alloc(0)
              const decodedReq = postDataBuff ? decodeMsgPack2(postDataBuff) : null
              const decodedRes = body.length >= 8 ? decodeMsgPack2(Buffer.from(body)) : null

              let objects = []
              if (decodedReq && decodedReq[0] === 312) {
                objects = extractObjects(decodedReq[1])
                objects.forEach(obj => addOrUpdateStaticId(obj.staticId, obj))
              }

              captures.push({
                id: captureIndex++,
                opCode,
                url,
                request: {
                  method: request.method(),
                  headers,
                  bodyB64: postData ? Buffer.from(postData).toString('base64') : null,
                  bodySize: postData ? postData.length : 0,
                  bodyBufferB64: postDataBuff ? Buffer.from(postDataBuff).toString('base64') : null,
                  bodyBufferSize: postDataBuff ? postDataBuff.length : 0
                },
                response: {
                  headers: (await request.response())?.headers() || {},
                  bodyB64: Buffer.from(body).toString('base64'),
                  bodySize: body.length
                },
                decodedRequest: decodedReq,
                decodedResponse: decodedRes,
                objectCount: objects.length,
                objects,
                timestamp: new Date().toISOString()
              })

              if (objects.length > 0) {
                myPlayerPackets.push({
                  id: captureIndex,
                  opCode,
                  objects,
                  timestamp: new Date().toISOString()
                })

                myPlayerPackets.push({
                  id: captureIndex,
                  opCode,
                  request: {
                    method: request.method(),
                    headers,
                    bodyB64: postData ? Buffer.from(postData).toString('base64') : null,
                    bodyBufferB64: postDataBuff
                      ? Buffer.from(postDataBuff).toString('base64')
                      : null
                  },
                  objectCount: objects.length,
                  objects,
                  timestamp: new Date().toISOString()
                })
              }

              if (opCode === 312) {
                console.log(
                  `[${new Date().toLocaleTimeString()}] MY PACKET: ${url} (opcode: ${opCode})`
                )
                if (autoSave) saveMyPlayerPackets()
              }
            }
          }
        } catch (e) {
          console.error('Error capturing packet:', e)
        }
      }
    })

    res.json({ success: true, message: 'Capturing started' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/capturing/stop', async (req, res) => {
  capturingEnabled = false
  if (captures.length > 0) {
    await saveCaptures()
  }
  res.json({ success: true, message: 'Capturing stopped' })
})

app.get('/api/staticids', (req, res) => {
  const data = Object.fromEntries(staticIdDb)
  res.json({ success: true, count: staticIdDb.size, staticIds: data })
})

app.get('/api/opcodes', (req, res) => {
  res.json({ success: true, opcodes: Array.from(uniqueOpcodes).sort((a, b) => a - b) })
})

async function main() {
  console.log('[Main] Starting server...')

  await ensureSaveDir()
  loadStaticDb()

  console.log('[Main] Initializing job system...')
  await initializeJobs({
    maxRetries: 3,
    maxConcurrent: 5,
    pollInterval: 100
  })

  const server = app.listen(PORT, () => {
    console.log(`[Main] Server running on http://localhost:${PORT}`)
    console.log('[Main] API endpoints:')
    console.log('  POST /api/scanKingdom - Queue manual kingdom scan')
    console.log('  POST /api/timer/start - Start periodic scanning')
    console.log('  POST /api/timer/stop - Stop periodic scanning')
    console.log('  GET  /api/jobs/status - Get job queue status')
    console.log('  GET  /api/timers - Get active timers')
    console.log('  POST /api/browser/start - Start browser')
    console.log('  POST /api/capturing/start - Start packet capture')
  })

  process.on('SIGINT', async () => {
    console.log('\n[Main] Shutting down...')
    await shutdownJobs()
    if (browser) await browser.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Main] Shutting down...')
    await shutdownJobs()
    if (browser) await browser.close()
    process.exit(0)
  })
}

main().catch(console.error)
