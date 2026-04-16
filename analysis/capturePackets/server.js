const express = require('express')
const path = require('path')
const fs = require('fs')
// const { chromium } = require('playwright')
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
  getStaticIdValues,
  getStaticIdData,
  getStaticIdSize,
  loadStaticDb,
  saveStaticDb,
  addOrUpdateStaticId
} = require('./staticId.js')

loadEnvFile() // Defaults to loading './.env'

const config = {
  accountUser: process.env.CHAT_ACCOUNT_USER,
  accountPwd: process.env.CHAT_ACCOUNT_PWD,
  channelUrl: process.env.CHAT_CHANNEL_URL || ''
}

const SAVE_DIR = path.join(__dirname, 'captures')
const MYPLAYER_FILE = path.join(__dirname, 'myplayer.json')
const OBJECT_PACKETS_FILE = path.join(__dirname, 'samples', 'objectpackets.json')
const OBJECT_PACKETS312_FILE = path.join(__dirname, 'samples', 'objectpackets312.json')
// const PROCESS_STATICID_FILE = path.join(__dirname, 'process-staticid.json')
// const CHAT_STATICID_FILE = path.join(__dirname, 'chat-staticid.json')
const PACKET312 = {
  kingdom: 100,
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
    console.log('findobjects: depth', depth)
    if (depth > 200) return
    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          const staticId = item[1]
          const known = getStaticIdData(staticId)
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
          console.log('objeto encontrado:', obj.staticId, obj.name)
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
const PORT = 3000

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
let myPlayerPacketIndex = 0
let objectPackets = []
let packets312analyze = []

let unknownStaticIds = new Map() // staticId -> { coords: Set of "k,x,y" }
let chatStaticIds = new Map()

let sessionSaved = false
const authPath = path.join(__dirname, 'auth', 'user.json')

const myPlayerInfo = {
  name: 'Maedve',
  coords: { k: 277, x: 91, y: 53 },
  cityLevel: 9,
  heroLevel: 6,
  playerId: 'tb:68568818',
  might: 7045,
  clan: 'LOW',
  sessionToken: null,
  internalPlayerId: null
}

function extractChatStaticIds(message) {
  if (!message || typeof message !== 'string') return
  if (!message.startsWith('MESG')) return

  try {
    const jsonMatch = message.match(/MESG(\{.*\})/)
    if (!jsonMatch) return

    const msgData = JSON.parse(jsonMatch[1])
    if (msgData.data) {
      try {
        const data = JSON.parse(msgData.data)
        if (data.subs) {
          for (const key in data.subs) {
            const sub = data.subs[key]
            if (sub.staticId && sub.entryType) {
              const id = `${sub.staticId}_${sub.entryType}`
              if (!chatStaticIds.has(id)) {
                chatStaticIds.set(id, {
                  staticId: sub.staticId,
                  entryType: sub.entryType,
                  name: sub.name || 'Unknown'
                })
                console.log(
                  `[${new Date().toLocaleTimeString()}] Chat staticId: ${sub.staticId} (${sub.entryType}) - ${sub.name || 'Unknown'}`
                )
              }
              addOrUpdateStaticId(sub.staticId, {
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
      } catch (e) {}
    }
  } catch (e) {}
}

// function saveChatStaticIds() {
//   try {
//     const entries = [...chatStaticIds.values()]
//     fs.writeFileSync(CHAT_STATICID_FILE, JSON.stringify(entries, null, 2))
//     // console.log(`[${new Date().toLocaleTimeString()}] Saved ${entries.length} chat static IDs`)
//   } catch (e) {
//     console.error('Save chat staticids error:', e.message)
//   }
// }

function extractInternalIdFrom402(data) {
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (Array.isArray(item) && item.length > 0) {
      if (Array.isArray(item[0]) && item[0].length === 1) {
        const id = item[0][0]
        if (typeof id === 'number' && id > 1000000000000) {
          return id
        }
      }
    }
  }
  return null
}

function extractSessionToken(data) {
  for (let item of data) {
    // Si es un objeto literal (y no null ni otro array)
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      if (item.type === 'Buffer') {
        return Buffer.from(item.data)
      }
    }
    // Si es un array, buscamos dentro de él
    if (Array.isArray(item)) {
      const resultado = extractSessionToken(item)
      if (resultado !== undefined) return resultado
    }
  }
  return null
}

function containsPlayerId(data, playerId, internalId) {
  if (!data) return false
  const str = JSON.stringify(data)
  if (playerId && str.includes(playerId)) return true
  if (internalId && str.includes(String(internalId))) return true
  return false
}

function saveMyPlayerPackets() {
  try {
    const data = {
      playerId: myPlayerInfo.playerId,
      internalPlayerId: myPlayerInfo.internalPlayerId,
      packets: myPlayerPackets
    }
    fs.writeFileSync(MYPLAYER_FILE, JSON.stringify(data, null, 2))
    console.log(
      `[${new Date().toLocaleTimeString()}] Saved ${myPlayerPackets.length} my player packets`
    )
  } catch (e) {
    console.error('Save my player packets error:', e.message)
  }
}

function saveObjectPackets() {
  try {
    fs.writeFileSync(OBJECT_PACKETS_FILE, JSON.stringify(objectPackets, null, 2))
    // console.log(`[${new Date().toLocaleTimeString()}] Saved ${objectPackets.length} object packets`)
  } catch (e) {
    console.error('Save OBJECT packets error:', e.message)
  }
}
function saveObjectPackets312() {
  try {
    fs.writeFileSync(OBJECT_PACKETS312_FILE, JSON.stringify(packets312analyze, null, 2))
    // console.log(
    //   `[${new Date().toLocaleTimeString()}] Saved ${packets312analyze.length} object packets`
    // )
  } catch (e) {
    console.error('Save OBJECT packets error:', e.message)
  }
}

function saveToFile() {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true })
    }

    const saveFile = path.join(SAVE_DIR, `captures-${String(saveFileIndex).padStart(3, '0')}.json`)
    fs.writeFileSync(saveFile, JSON.stringify(captures, null, 2))
    // console.log(
    //   `[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to ${path.basename(saveFile)}`
    // )

    if (captures.length >= MAX_CAPTURES_PER_FILE) {
      captures = []
      captureIndex = 0
      saveFileIndex++
      console.log(
        `[${new Date().toLocaleTimeString()}] Rotation: switched to captures-${String(saveFileIndex).padStart(3, '0')}.json`
      )
    }
  } catch (e) {
    console.error('Save error:', e.message)
  }
}

async function trackUnknownStaticId(obj) {
  const { staticId, level, kingdom, x, y } = obj
  const dbEntry = getStaticIdData(staticId)

  const isComplete =
    dbEntry && dbEntry.name && dbEntry.entryType && dbEntry.level != null && dbEntry.level >= 0

  if (!isComplete) {
    unknownStaticIds.set(staticId, { kingdom, x, y, timestamp: Date.now() })
    if (!unknownStaticIds.has(staticId)) {
      console.log(`[${new Date().toLocaleTimeString()}] New incomplete staticId: ${staticId}`)
    }

    await sendMessage('', { k: kingdom, x, y }, staticId, dbEntry?.entryType || 'poi')
  }

  addOrUpdateStaticId(staticId, { level })
}

async function sendMessage(msg = '', coord = null, staticId = 400, entryType = 'poi') {
  if (!config.channelUrl) {
    console.log(`⚠️ No channel URL configured`)
    return
  }

  let data = ''
  let message = msg
  if (!!coord) {
    data = JSON.stringify({
      subs: {
        '/%0%/': {
          type: 'coord',
          entryType,
          x: coord?.x ?? 0,
          y: coord?.y ?? 0,
          realmId: coord?.k ?? 0,
          staticId,
          name: '',
          v: 1
        }
      }
    })
    message = '/%0%/'
  }

  const result = await page.evaluate(
    async ({ channelUrl, data, message }) => {
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

        // find channel in existing list or fetch it
        let channel = window.SendBirdHelper.channelsList.find(c => c.url === channelUrl)
        if (!channel) {
          channel = await window.SendBirdHelper.sb.groupChannel.getChannel(channelUrl)
        }
        const msg = await channel.sendUserMessage({
          message,
          customType: 'user',
          data
        })
        return { success: true, messageId: msg.messageId }
      } catch (e) {
        return { success: false, error: e.message }
      }
    },
    { channelUrl: config.channelUrl, data, message }
  )
}

// function saveUnknownStaticIds() {
//   try {
//     const entries = [...unknownStaticIds].map(id => ({ staticId: id }))
//     fs.writeFileSync(PROCESS_STATICID_FILE, JSON.stringify(entries, null, 2))
//   } catch (e) {
//     console.error('Save unknown staticids error:', e.message)
//   }
// }

const generateArrays = (start = 9, end = 2396, step = 50, groupSize = 12) => {
  const allNumbers = []
  const used = new Set()

  for (let i = start; i <= end; i++) {
    // Si el número ya se usó en un salto anterior, lo saltamos
    if (used.has(i)) continue

    // Generamos el bloque basado en tu patrón (n, n+50, n+100, n+150...)
    // Usamos 4 saltos como en tu ejemplo: [9, 59, 109, 159]
    for (let j = 0; j < 4; j++) {
      let num = i + j * step
      if (num <= end && !used.has(num)) {
        allNumbers.push(num)
        used.add(num)
      }
    }
  }

  // Dividimos el resultado en arreglos de 12 elementos
  const result = []
  for (let i = 0; i < allNumbers.length; i += groupSize) {
    result.push(allNumbers.slice(i, i + groupSize))
  }

  return result
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/api/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: true, message: 'Browser already running' })
    }

    browser = await firefox.launch({
      // browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    })

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

    if (await fileExists(authPath)) {
      options.storageState = authPath
    }

    context = await browser.newContext(options)

    page = await context.newPage()
    captures = []
    captureIndex = 0

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

    // await page.route('**/rubens-realm**', async route => {
    //   const request = route.request()
    //   const buffer = request.postDataBuffer() // Aquí es mucho más probable que sí tenga datos

    //   if (buffer) {
    //     console.log('¡Payload capturado!', buffer.length)
    //     // fs.writeFileSync('captura.bin', buffer);
    //   }

    //   await route.continue() // No olvides continuar la petición
    // })

    page.on('response', async response => {
      if (!capturingEnabled) return

      const url = response.url()
      if (!url.includes('rubens-realm')) return

      if (captureIndex == 100 && !sessionSaved) {
        //save session
        sessionSaved = true
        await context.storageState({ path: authPath })
      }

      try {
        const status = response.status()
        const headers = response.headers()
        const body = await response.body()

        if (!body || body.length === 0) return
        if (headers['content-type']?.includes('text/html')) return

        const request = response.request()
        const postData = request.postData()
        const postDataBuff = request.postDataBuffer()
        // if (postDataBuff) {
        //   console.log(`Recibidos ${postDataBuff.length} bytes de datos binarios.`)
        //   // Aquí puedes procesar el Buffer, por ejemplo, guardarlo como archivo
        // }

        const decodedReq = decodeMsgPack2(Buffer.from(postDataBuff))

        let decodedResponse = decodeMsgPack2(Buffer.from(body))
        const opCode = getFirstValue(decodedResponse)

        if (opCode !== null) {
          uniqueOpcodes.add(opCode)
        }

        if (opCode === 402 && !myPlayerInfo.internalPlayerId) {
          const extractedId = extractInternalIdFrom402(decodedResponse)
          if (extractedId) {
            myPlayerInfo.internalPlayerId = extractedId
            console.log(
              `[${new Date().toLocaleTimeString()}] Found internal player ID: ${myPlayerInfo.internalPlayerId}`
            )
          }
        }

        if (opCode === 203) {
          if (!myPlayerInfo.internalPlayerId) {
            const id = decodedResponse[1]?.[0]?.[0]
            if (typeof id === 'number' && id > 1000000000000) {
              myPlayerInfo.internalPlayerId = id
              console.log(`Found internal player ID: ${myPlayerInfo.internalPlayerId}`)
            }
          }

          if (!myPlayerInfo.sessionToken) {
            myPlayerInfo.sessionToken = extractSessionToken(decodedResponse)

            console.log(`Found session token: ${myPlayerInfo.sessionToken}`)
          }
        }

        const isMyPacket = containsPlayerId(
          decodedResponse,
          myPlayerInfo.playerId,
          myPlayerInfo.internalPlayerId
        )

        let objects = []
        if (opCode === 312 || opCode === 408) {
          extractObjects(decodedResponse)

          objects.forEach(obj => trackUnknownStaticId(obj))
        }

        captures.push({
          id: ++captureIndex,
          opCode,
          url,
          status,
          request: {
            method: request.method(),
            headers: request.headers(),
            bodyB64: postData ? Buffer.from(postData).toString('base64') : null,
            bodySize: postData ? postData.length : 0,
            bodyBufferB64: postDataBuff ? Buffer.from(postDataBuff).toString('base64') : null,
            bodyBufferSize: postDataBuff ? postDataBuff.length : 0
            // decodedRequest: postData ? decodeFull(Buffer.from(postData)) : null
          },
          response: {
            headers,
            bodyB64: Buffer.from(body).toString('base64'),
            bodySize: body.length
            // decodedResponse
          },
          objectCount: objects.length,
          objects,
          isMyPacket
        })

        if (isMyPacket) {
          myPlayerPackets.push({
            id: ++myPlayerPacketIndex,
            opCode,
            url,
            status,
            request: requestData,
            bodyB64: Buffer.from(body).toString('base64'),
            bodySize: body.length,
            bodyBufferB64: postDataBuff ? Buffer.from(postDataBuff).toString('base64') : null,
            bodyBufferSize: postDataBuff ? postDataBuff.length : 0,
            // decodedResponse,
            objectCount: objects.length,
            objects,
            timestamp: new Date().toISOString()
          })
          console.log(`[${new Date().toLocaleTimeString()}] MY PACKET: ${url} (opcode: ${opCode})`)
          if (autoSave) saveMyPlayerPackets()
        }

        if (opCode === 312 || opCode === 408) {
          objectPackets.push({
            opCode,
            url,
            request: {
              method: request.method(),
              headers: request.headers(),
              bodyB64: postData ? Buffer.from(postData).toString('base64') : null,
              bodySize: postData ? postData.length : 0,
              bodyBufferB64: postDataBuff ? Buffer.from(postDataBuff).toString('base64') : null,
              bodyBufferSize: postDataBuff ? postDataBuff.length : 0
              // decodedRequest: postData ? decodeFull(Buffer.from(postData)) : null
            },
            response: {
              headers,
              bodyB64: Buffer.from(body).toString('base64'),
              bodySize: body.length
              // decodedResponse
            },
            objectCount: objects.length,
            objects
          })

          if (autoSave) saveObjectPackets()
        }

        if (opCode === 312) {
          console.log(
            '312 packet getting tokens',
            JSON.stringify(decodedReq, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
            )
          )
          //request:          [312,284,[["1309965043442"],{"0":105,"1":223,"2":166,"3":213,"4":171,"5":90,"6":183,"7":199,"8":35,"9":86,"10":245,"11":99}],""]

          if (!PACKET312.sessionToken) {
            const rawToken = decodedReq[2]?.[0]?.[0]
            PACKET312.sessionToken =
              typeof rawToken === 'bigint'
                ? rawToken
                : typeof rawToken === 'number'
                  ? BigInt(rawToken)
                  : rawToken
            PACKET312.buff = decodedReq[2]?.[1] // auth token?

            console.log(
              '312 packet decodedReq[0][2]',
              JSON.stringify(decodedReq[2], (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
              )
            )
            console.log(
              'PACKET312.sessionToken type:',
              typeof PACKET312.sessionToken,
              'value:',
              PACKET312.sessionToken
            )
          }
        }

        if (opCode === 312 && objects.length > 0) {
          const tileIds = decodedReq[1]

          const allCoordX = objects.map(o => o.x)
          const allCoordY = objects.map(o => o.y)
          const minX = Math.min(...allCoordX)
          const maxX = Math.max(...allCoordX)
          const minY = Math.min(...allCoordY)
          const maxY = Math.max(...allCoordY)
          const kingdom = objects[0].kingdom

          /*
[
 [ 312, "sequence ie:2242", [["sessionToken?"], "212bytesAuth?"], ""],
 [ ["tileId1", "tileId2"],["0's as many tilesId" ],[],[] ]

]


*/

          packets312analyze.push({
            opCode,
            url,
            requestBodyB64: postDataBuff ? Buffer.from(postDataBuff).toString('base64') : null,
            responseBodyB64: Buffer.from(body).toString('base64'),
            kingdom,
            tileIds: JSON.stringify(tileIds),
            range: `xy1=${minX}-${minY}, xy2=${maxX}-${maxY}`,
            objectCount: objects.length
          })

          if (autoSave) saveObjectPackets312()
        }

        // console.log(`[${new Date().toLocaleTimeString()}] Captured: ${url} (${body.length} bytes)`)

        if (autoSave) saveToFile()
      } catch (e) {
        console.error('Capture error:', e.message)
      }
    })

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

    res.json({ success: true, message: 'Browser started, capturing responses...' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }

  // await page.waitForTimeout(20000)

  // if (await page.locator('canvas').waitFor({ state: 'visible', timeout: 90000 }).catch(() => false)) {
  // }
})

app.post('/api/scanKingdom', async (req, res) => {
  console.log('scanning kingdom')

  const kingdoms = req.body.kingdoms || ''
  if (kingdoms.trim() === '') {
    console.log('no kingdom')
    return res.json({ success: false, error: 'enter kingdom' })
  }

  if (!PACKET312.sessionToken) {
    console.log('no session token  ')
    return res.json({ success: false, error: 'no session token' })
  }
  if (!PACKET312.buff) {
    console.log('no  auth buf')
    return res.json({ success: false, error: 'no  auth buf' })
  }
  // const default='https://game-us17.totalbattle.com/rubens-realm146'
  PACKET312.kingdoms = kingdoms.split(',').map(parseInt)
  const currentKingdom = PACKET312.kingdoms[0]
  const url = kingdomUrls[currentKingdom]
  if (!url) {
    console.log('invalid kingdom')
    return res.json({ success: false, error: 'invalid kingdom' })
  }

  const randomSeq = Math.floor(Math.random() * 32000) + 1

  const tilesArray = generateArrays()
  console.log('tiles', tilesArray)
  console.log(
    'PACKET312.sessionToken type:',
    typeof PACKET312.sessionToken,
    'value:',
    PACKET312.sessionToken
  )

  // Ensure token is BigInt (in case it was stored as string)
  const tokenValue = PACKET312.sessionToken
  const tokenBigInt =
    typeof tokenValue === 'bigint'
      ? tokenValue
      : typeof tokenValue === 'number'
        ? BigInt(tokenValue)
        : typeof tokenValue === 'string' && !isNaN(Number(tokenValue))
          ? BigInt(tokenValue)
          : tokenValue

  // Create all payloads in node
  const payloads = tilesArray.map(tiles => {
    const buff312 = [
      [312, randomSeq, [[tokenBigInt], mapToUint8Array(PACKET312.buff)], ''],
      [tiles, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [], []]
    ]
    const payload = encodeMsgPack2MultiFragments(buff312)
    console.log('sending packet 312 to ', url, payload)
    console.log('payload b64', encodeBase64(payload))
    return Array.from(payload)
  })

  // 2. Ejecutarlas en paralelo
  try {
    const data = await page.evaluate(
      async ({ url, payloads, headers }) => {
        const results = await Promise.all(
          payloads.map(async payloadBytes => {
            try {
              const res = await fetch(url, {
                headers: headers,
                body: new Uint8Array(payloadBytes),
                referrer: 'https://totalbattle.com/',
                method: 'POST'
              })

              const buffer = await res.arrayBuffer()
              const bytes = new Uint8Array(buffer)

              // Convert Uint8Array to regular array for JSON serialization
              return { success: true, buffer: Array.from(bytes) }
            } catch (err) {
              return { success: false, error: err.message }
            }
          })
        )
        return JSON.stringify(results, (k, v) => (typeof v === 'bigint' ? v.toString() : v))
      },
      {
        url,
        payloads,
        headers: {
          'Content-Type': 'application/octet-stream',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
          Referer: 'https://totalbattle.com/'
        }
      }
    ) // pass data from node scope to playwright scope

    //llega a node
    const finalData = JSON.parse(data)
    console.log('finalData', finalData[0])
    if (finalData.length > 0 && finalData[0].success && finalData[0].buffer) {
      // Convert regular array back to Uint8Array
      const bytes = new Uint8Array(finalData[0].buffer)
      console.log('Response buffer length:', bytes.length)
      const decoded = multiDecodeMsgPack2(bytes)
      const o = extractObjects(decoded.results)
      console.log('found ', o.length, 'objects')
      //enviamos a react
      res.json({
        success: true,
        kingdom: PACKET312.kingdom
      })
    } else {
      console.log('error sending packet', finalData)
      res.status(200).json({ success: false, error: 'failed to get data' })
    }
  } catch (e) {
    console.log('error sending packet', e)
    res.status(500).json({ success: false, error: e.message })
  }
})

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

app.post('/api/clear', (req, res) => {
  captures = []
  captureIndex = 0
  res.json({ success: true })
})

app.post('/api/save', (req, res) => {
  saveToFile()
  res.json({ success: true, count: captures.length })
})

app.post('/api/autosave', (req, res) => {
  autoSave = req.body.enabled !== false
  res.json({ success: true, autoSave })
})

app.post('/api/load', (req, res) => {
  try {
    if (fs.existsSync(SAVE_FILE)) {
      const data = fs.readFileSync(SAVE_FILE, 'utf8')
      captures = JSON.parse(data)
      captureIndex = captures.length > 0 ? Math.max(...captures.map(c => c.id)) : 0
      res.json({ success: true, count: captures.length })
    } else {
      res.json({ success: true, count: 0 })
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/capturing', (req, res) => {
  capturingEnabled = req.body.enabled === true
  res.json({ success: true, capturing: capturingEnabled })
})

// app.get('/api/opcodes', (req, res) => {
//   res.json({
//     success: true,
//     opcodes: [...uniqueOpcodes].sort((a, b) => a - b),
//     count: uniqueOpcodes.size
//   })
// })

// app.get('/api/myplayer', (req, res) => {
//   res.json({
//     success: true,
//     playerId: myPlayerInfo.playerId,
//     internalPlayerId: myPlayerInfo.internalPlayerId,
//     packets: myPlayerPackets,
//     count: myPlayerPackets.length
//   })
// })

// app.get('/api/myplayer/:id', (req, res) => {
//   const id = parseInt(req.params.id)
//   const packet = myPlayerPackets.find(p => p.id === id)
//   if (packet) {
//     res.json({ success: true, packet })
//   } else {
//     res.status(404).json({ success: false, error: 'Not found' })
//   }
// })

// app.post('/api/clear-myplayer', (req, res) => {
//   myPlayerPackets = []
//   myPlayerPacketIndex = 0
//   res.json({ success: true })
// })

app.post('/api/clear-all', (req, res) => {
  objectPackets = []
  packets312analyze = []
  captures = []
  captureIndex = 0
  myPlayerPackets = []
  myPlayerPacketIndex = 0
  // myPlayerInfo.internalPlayerId = null
  uniqueOpcodes.clear()
  chatStaticIds.clear()
  res.json({ success: true })
})

app.get('/api/unknown-staticids', (req, res) => {
  const entries = [...unknownStaticIds.entries()].map(([id, data]) => ({
    staticId: parseInt(id),
    kingdom: data.kingdom,
    x: data.x,
    y: data.y,
    timestamp: parseInt(data.timestamp)
  }))
  res.json({ success: true, items: entries, count: unknownStaticIds.size })
})

// app.get('/api/chat-staticids', (req, res) => {
//   const entries = [...chatStaticIds.values()]
//   res.json({ success: true, items: entries, count: chatStaticIds.size })
// })

app.get('/api/static-db', (req, res) => {
  console.log('Sending staticId Db with', getStaticIdSize(), 'entries')
  const entries = getStaticIdValues()
  res.json({ success: true, items: entries, count: getStaticIdSize() })
})

loadStaticDb()

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
