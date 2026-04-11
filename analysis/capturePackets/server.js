const express = require('express')
const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const SAVE_FILE = path.join(__dirname, 'captures.json')
const OPCODES_FILE = path.join(__dirname, 'opcodes.json')
const MYPLAYER_FILE = path.join(__dirname, 'myplayer.json')
const PROCESS_STATICID_FILE = path.join(__dirname, 'process-staticid.json')
const CHAT_STATICID_FILE = path.join(__dirname, 'chat-staticid.json')
const STATIC_DB_FILE = path.join(__dirname, 'staticId-db.json')

let staticIdDb = new Map()

function loadStaticDb() {
  try {
    if (fs.existsSync(STATIC_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_DB_FILE, 'utf8'))
      staticIdDb = new Map(Object.entries(data))
      console.log(`[${new Date().toLocaleTimeString()}] Loaded ${staticIdDb.size} static IDs from database`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] No staticId-db.json found, starting fresh`)
    }
  } catch (e) {
    console.error('Error loading staticId-db:', e.message)
  }
}

function saveStaticDb() {
  try {
    const data = Object.fromEntries(staticIdDb)
    fs.writeFileSync(STATIC_DB_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error saving staticId-db:', e.message)
  }
}

function addOrUpdateStaticId(staticId, data) {
  const id = String(staticId)
  let updated = false
  
  if (!staticIdDb.has(id)) {
    staticIdDb.set(id, { staticId: parseInt(id), ...data })
    console.log(`[${new Date().toLocaleTimeString()}] New staticId: ${staticId} (${data.name || data.entryType || 'unknown'})`)
    updated = true
  } else {
    const existing = staticIdDb.get(id)
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && existing[key] === undefined) {
        existing[key] = value
        updated = true
      }
    }
  }
  
  if (updated) {
    saveStaticDb()
  }
}

function readValue(buf, off) {
  if (off >= buf.length) return { val: null, end: buf.length }
  const byte = buf[off++]

  if ((byte & 0x80) === 0) return { val: byte, end: off }
  if ((byte & 0xe0) === 0xe0) return { val: byte - 256, end: off }

  if ((byte & 0xf0) === 0x80) {
    const size = byte & 0x0f
    const obj = {}
    let o = off
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  if ((byte & 0xf0) === 0x90) {
    const size = byte & 0x0f
    const arr = []
    let o = off
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if ((byte & 0xe0) === 0xa0) {
    const len = byte & 0x1f
    return { val: buf.slice(off, off + len).toString('utf8'), end: off + len }
  }

  if (byte === 0xc0) return { val: null, end: off }
  if (byte === 0xc2) return { val: false, end: off }
  if (byte === 0xc3) return { val: true, end: off }

  if (byte === 0xc4) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len }
  }
  if (byte === 0xc5) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len }
  }
  if (byte === 0xc6) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len }
  }

  if (byte >= 0xc7 && byte <= 0xc9) {
    let len, dataOff
    if (byte === 0xc7) {
      len = buf[off]
      dataOff = off + 2
    } else if (byte === 0xc8) {
      len = buf.readUInt16BE(off)
      dataOff = off + 3
    } else {
      len = buf.readUInt32BE(off)
      dataOff = off + 5
    }
    const type = buf[dataOff]
    const data = buf.slice(dataOff + 1, dataOff + 1 + len - 1)
    return { val: { type, data }, end: dataOff + len }
  }

  if (byte === 0xca) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat32(0), end: off + 4 }
  }
  if (byte === 0xcb) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat64(0), end: off + 8 }
  }

  if (byte === 0xcc) return { val: buf[off], end: off + 1 }
  if (byte === 0xcd) return { val: buf.readUInt16LE(off), end: off + 2 }
  if (byte === 0xce) return { val: buf.readUInt32LE(off), end: off + 4 }
  if (byte === 0xcf) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  if (byte === 0xd0) return { val: buf.readInt8(off), end: off + 1 }
  if (byte === 0xd1) return { val: buf.readInt16LE(off), end: off + 2 }
  if (byte === 0xd2) return { val: buf.readInt32LE(off), end: off + 4 }
  if (byte === 0xd3) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  if (byte >= 0xd4 && byte <= 0xd8) {
    const sizes = [1, 2, 4, 8, 16]
    const size = sizes[byte - 0xd4]
    return { val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) }, end: off + 1 + size }
  }

  if (byte === 0xd9) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len }
  }
  if (byte === 0xda) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len }
  }
  if (byte === 0xdb) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len }
  }

  if (byte === 0xdc) {
    const size = buf.readUInt16BE(off)
    const arr = []
    let o = off + 2
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if (byte === 0xdd) {
    const size = buf.readUInt32BE(off)
    const arr = []
    let o = off + 4
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if (byte === 0xde) {
    const size = buf.readUInt16BE(off)
    const obj = {}
    let o = off + 2
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  if (byte === 0xdf) {
    const size = buf.readUInt32BE(off)
    const obj = {}
    let o = off + 4
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  return { val: null, end: off + 1 }
}

function decodeFull(buf) {
  const results = []
  let off = 8
  while (off < buf.length) {
    try {
      const result = readValue(buf, off)
      if (result.val !== null) {
        results.push(result.val)
        off = result.end
      } else {
        off++
      }
    } catch (e) {
      off++
    }
  }
  return results
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
    if (depth > 20) return
    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          const staticId = item[1]
          const known = staticIdDb.get(String(staticId))
          objects.push({
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
          })
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
  if (!data || data.length < 1) return null
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (Array.isArray(item)) {
      const found = getFirstValue(item)
      if (found !== null) return found
    } else {
      return item
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
let internalPlayerId = null
let unknownStaticIds = new Map()
let chatStaticIds = new Map()

const myPlayerInfo = {
  name: 'Maedve',
  coords: { k: 277, x: 91, y: 53 },
  cityLevel: 9,
  heroLevel: 6,
  playerId: 'tb:68568818',
  might: 7045,
  clan: 'LOW'
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
                console.log(`[${new Date().toLocaleTimeString()}] Chat staticId: ${sub.staticId} (${sub.entryType}) - ${sub.name || 'Unknown'}`)
              }
              addOrUpdateStaticId(sub.staticId, {
                entryType: sub.entryType,
                name: sub.name || null
              })
              unknownStaticIds.delete(sub.staticId)
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function saveChatStaticIds() {
  try {
    const entries = [...chatStaticIds.values()]
    fs.writeFileSync(CHAT_STATICID_FILE, JSON.stringify(entries, null, 2))
    console.log(`[${new Date().toLocaleTimeString()}] Saved ${entries.length} chat static IDs`)
  } catch (e) {
    console.error('Save chat staticids error:', e.message)
  }
}

function saveOpcodes() {
  try {
    const opcodes = [...uniqueOpcodes].sort((a, b) => a - b)
    fs.writeFileSync(OPCODES_FILE, JSON.stringify(opcodes, null, 2))
    console.log(`[${new Date().toLocaleTimeString()}] Saved ${opcodes.length} unique opcodes`)
  } catch (e) {
    console.error('Save opcodes error:', e.message)
  }
}

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
      internalPlayerId: internalPlayerId,
      packets: myPlayerPackets
    }
    fs.writeFileSync(MYPLAYER_FILE, JSON.stringify(data, null, 2))
    console.log(`[${new Date().toLocaleTimeString()}] Saved ${myPlayerPackets.length} my player packets`)
  } catch (e) {
    console.error('Save my player packets error:', e.message)
  }
}

function saveToFile() {
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(captures, null, 2))
    console.log(`[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to file`)
  } catch (e) {
    console.error('Save error:', e.message)
  }
}

function trackUnknownStaticId(obj) {
  const staticId = obj.staticId
  const level = obj.level
  
  if (!unknownStaticIds.has(staticId)) {
    unknownStaticIds.add(staticId)
    console.log(`[${new Date().toLocaleTimeString()}] New unknown staticId: ${staticId}`)
  }
  
  addOrUpdateStaticId(staticId, { level })
}

function saveUnknownStaticIds() {
  try {
    const entries = [...unknownStaticIds].map(id => ({ staticId: id }))
    fs.writeFileSync(PROCESS_STATICID_FILE, JSON.stringify(entries, null, 2))
  } catch (e) {
    console.error('Save unknown staticids error:', e.message)
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/api/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ success: true, message: 'Browser already running' })
    }

    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    })
    context = await browser.newContext({
      screen: { width: 1360, height: 1024 },
      viewport: { width: 1360, height: 1024 },
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    })
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
              console.log(`[WS] MESG received: ${text.substring(0, 200)}...`)
              extractChatStaticIds(text)
              if (autoSave) saveChatStaticIds()
            }
          } catch (e) {}
        }
      })
      
      ws.on('close', () => {
        console.log(`[${new Date().toLocaleTimeString()}] WebSocket closed`)
      })
    })

    page.on('response', async response => {
      if (!capturingEnabled) return

      const url = response.url()
      if (!url.includes('rubens-realm')) return

      try {
        const status = response.status()
        const headers = response.headers()
        const body = await response.body()

        if (!body || body.length === 0) return
        if (headers['content-type']?.includes('text/html')) return

        const request = response.request()
        const postData = request.postData()

        const requestData = {
          method: request.method(),
          headers: request.headers(),
          bodyB64: postData ? Buffer.from(postData).toString('base64') : null,
          bodySize: postData ? postData.length : 0,
          decodedRequest: postData ? decodeFull(Buffer.from(postData)) : null
        }

        let decodedResponse = decodeFull(Buffer.from(body))
        const opCode = getFirstValue(decodedResponse)

        if (opCode !== null) {
          uniqueOpcodes.add(opCode)
        }

        if (opCode === 402 && !internalPlayerId) {
          const extractedId = extractInternalIdFrom402(decodedResponse)
          if (extractedId) {
            internalPlayerId = extractedId
            console.log(`[${new Date().toLocaleTimeString()}] Found internal player ID: ${internalPlayerId}`)
          }
        }

        const isMyPacket = containsPlayerId(decodedResponse, myPlayerInfo.playerId, internalPlayerId)
        const objects = extractObjects(decodedResponse)
        
        objects.forEach(obj => trackUnknownStaticId(obj))

        captures.push({
          id: ++captureIndex,
          opCode,
          url,
          status,
          request: requestData,
          response: {
            headers,
            bodyB64: Buffer.from(body).toString('base64'),
            bodySize: body.length,
            decodedResponse
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
            decodedResponse,
            objectCount: objects.length,
            objects,
            timestamp: new Date().toISOString()
          })
          console.log(`[${new Date().toLocaleTimeString()}] MY PACKET: ${url} (opcode: ${opCode})`)
          if (autoSave) saveMyPlayerPackets()
        }

        console.log(`[${new Date().toLocaleTimeString()}] Captured: ${url} (${body.length} bytes)`)

        if (autoSave) saveToFile()
      } catch (e) {
        console.error('Capture error:', e.message)
      }
    })

    await page.goto(`https://totalbattle.com/es`)

    res.json({ success: true, message: 'Browser started, capturing responses...' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
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
  res.json({ success: true, captures, count: captures.length })
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
  res.setHeader('Content-Disposition', 'attachment; filename=captures.json')
  res.json(captures)
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

app.get('/api/opcodes', (req, res) => {
  res.json({
    success: true,
    opcodes: [...uniqueOpcodes].sort((a, b) => a - b),
    count: uniqueOpcodes.size
  })
})

app.post('/api/save-opcodes', (req, res) => {
  saveOpcodes()
  res.json({ success: true, count: uniqueOpcodes.size })
})

app.get('/api/myplayer', (req, res) => {
  res.json({
    success: true,
    playerId: myPlayerInfo.playerId,
    internalPlayerId: internalPlayerId,
    packets: myPlayerPackets,
    count: myPlayerPackets.length
  })
})

app.get('/api/myplayer/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const packet = myPlayerPackets.find(p => p.id === id)
  if (packet) {
    res.json({ success: true, packet })
  } else {
    res.status(404).json({ success: false, error: 'Not found' })
  }
})

app.get('/api/export-myplayer', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename=myplayer.json')
  res.json({
    playerId: myPlayerInfo.playerId,
    internalPlayerId: internalPlayerId,
    packets: myPlayerPackets
  })
})

app.post('/api/clear-myplayer', (req, res) => {
  myPlayerPackets = []
  myPlayerPacketIndex = 0
  res.json({ success: true })
})

app.post('/api/clear-all', (req, res) => {
  captures = []
  captureIndex = 0
  myPlayerPackets = []
  myPlayerPacketIndex = 0
  internalPlayerId = null
  uniqueOpcodes.clear()
  chatStaticIds.clear()
  res.json({ success: true })
})

app.get('/api/unknown-staticids', (req, res) => {
  const entries = [...unknownStaticIds].map(id => ({ staticId: id }))
  res.json({ success: true, items: entries, count: unknownStaticIds.size })
})

app.get('/api/export-unknown-staticids', (req, res) => {
  const entries = [...unknownStaticIds].map(id => ({ staticId: id }))
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename=process-staticid.json')
  res.json(entries)
})

app.get('/api/chat-staticids', (req, res) => {
  const entries = [...chatStaticIds.values()]
  res.json({ success: true, items: entries, count: chatStaticIds.size })
})

app.get('/api/export-chat-staticids', (req, res) => {
  const entries = [...chatStaticIds.values()]
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename=chat-staticid.json')
  res.json(entries)
})

app.get('/api/static-db', (req, res) => {
  const entries = [...staticIdDb.values()]
  res.json({ success: true, items: entries, count: staticIdDb.size })
})

app.get('/api/static-db/:id', (req, res) => {
  const id = req.params.id
  if (staticIdDb.has(id)) {
    res.json({ success: true, item: staticIdDb.get(id) })
  } else {
    res.status(404).json({ success: false, error: 'StaticId not found' })
  }
})

app.post('/api/static-db', (req, res) => {
  const { staticId, name, entryType, level } = req.body
  if (staticId === undefined) {
    return res.status(400).json({ success: false, error: 'staticId required' })
  }
  addOrUpdateStaticId(staticId, { name, entryType, level })
  res.json({ success: true, item: staticIdDb.get(String(staticId)) })
})

app.delete('/api/static-db/:id', (req, res) => {
  const id = req.params.id
  if (staticIdDb.has(id)) {
    staticIdDb.delete(id)
    saveStaticDb()
    res.json({ success: true })
  } else {
    res.status(404).json({ success: false, error: 'StaticId not found' })
  }
})

app.get('/api/export-static-db', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', 'attachment; filename=staticId-db.json')
  const data = Object.fromEntries(staticIdDb)
  res.json(data)
})

loadStaticDb()

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
