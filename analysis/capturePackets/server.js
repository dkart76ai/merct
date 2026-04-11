const express = require('express')
const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const SAVE_FILE = path.join(__dirname, 'captures.json')

function readValue(buf, off) {
  if (off >= buf.length) return { val: null, end: buf.length }
  const byte = buf[off++]

  // Positive fixint (0xxxxxxx)
  if ((byte & 0x80) === 0) return { val: byte, end: off }

  // Negative fixint (111xxxxx)
  if ((byte & 0xe0) === 0xe0) return { val: byte - 256, end: off }

  // Fixmap (1000xxxx)
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

  // Fixarray (1001xxxx)
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

  // Fixstr (101xxxxx)
  if ((byte & 0xe0) === 0xa0) {
    const len = byte & 0x1f
    return { val: buf.slice(off, off + len).toString('utf8'), end: off + len }
  }

  // 0xc0 - nil
  if (byte === 0xc0) return { val: null, end: off }

  // 0xc1 - never used

  // 0xc2 - false
  if (byte === 0xc2) return { val: false, end: off }

  // 0xc3 - true
  if (byte === 0xc3) return { val: true, end: off }

  // 0xc4 - bin8
  if (byte === 0xc4) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len }
  }

  // 0xc5 - bin16
  if (byte === 0xc5) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len }
  }

  // 0xc6 - bin32
  if (byte === 0xc6) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len }
  }

  // 0xc7 - ext8, 0xc8 - ext16, 0xc9 - ext32
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

  // 0xca - float32
  if (byte === 0xca) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat32(0), end: off + 4 }
  }

  // 0xcb - float64
  if (byte === 0xcb) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat64(0), end: off + 8 }
  }

  // 0xcc - uint8
  if (byte === 0xcc) return { val: buf[off], end: off + 1 }

  // 0xcd - uint16 (LE)
  if (byte === 0xcd) return { val: buf.readUInt16LE(off), end: off + 2 }

  // 0xce - uint32 (LE)
  if (byte === 0xce) return { val: buf.readUInt32LE(off), end: off + 4 }

  // 0xcf - uint64
  if (byte === 0xcf) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  // 0xd0 - int8
  if (byte === 0xd0) return { val: buf.readInt8(off), end: off + 1 }

  // 0xd1 - int16 (LE)
  if (byte === 0xd1) return { val: buf.readInt16LE(off), end: off + 2 }

  // 0xd2 - int32 (LE)
  if (byte === 0xd2) return { val: buf.readInt32LE(off), end: off + 4 }

  // 0xd3 - int64 (LE)
  if (byte === 0xd3) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  // 0xd4 - fixext1, 0xd5 - fixext2, 0xd6 - fixext4, 0xd7 - fixext8, 0xd8 - fixext16
  if (byte >= 0xd4 && byte <= 0xd8) {
    const sizes = [1, 2, 4, 8, 16]
    const size = sizes[byte - 0xd4]
    return {
      val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) },
      end: off + 1 + size
    }
  }

  // 0xd9 - str8
  if (byte === 0xd9) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len }
  }

  // 0xda - str16
  if (byte === 0xda) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len }
  }

  // 0xdb - str32
  if (byte === 0xdb) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len }
  }

  // 0xdc - array16
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

  // 0xdd - array32
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

  // 0xde - map16
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

  // 0xdf - map32
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

// Decode a full buffer starting from offset 8 (skip 8-byte header)
function decodeFull(buf) {
  const results = []
  let off = 8 // Skip 8-byte header

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

    // First element: array with 1 element
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false

    // 9th element (index 8): array with 3 elements
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false

    // 10th element (index 9): array with 1 element
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false

    // Last element (index 11): boolean
    if (typeof arr[11] !== 'boolean') return false

    return true
  }

  function findObjects(arr, depth = 0) {
    if (depth > 20) return // Prevent infinite recursion

    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          objects.push({
            objectId: item[0][0],
            staticId: item[1],
            // name: TILE_NAMES[staticId],
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
          // Recurse into nested arrays
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

  // recursivelly find the first non array value from data array
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
let page = null
let captures = []
let captureIndex = 0
let autoSave = true

function saveToFile() {
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(captures, null, 2))
    console.log(`[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to file`)
  } catch (e) {
    console.error('Save error:', e.message)
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

    page = await browser.newPage()
    captures = []
    captureIndex = 0

    // Capture responses using Playwright's native interception
    page.on('response', async response => {
      const url = response.url()
      if (!url.includes('rubens-realm')) return

      try {
        const status = response.status()
        const headers = response.headers()
        const body = await response.body()

        // Skip empty responses or non-data responses
        if (!body || body.length === 0) return
        if (headers['content-type']?.includes('text/html')) return

        // Decode response msgpack
        let decodedResponse = decodeFull(Buffer.from(body))

        //scan the array and extract first value from array
        const opCode = getFirstValue(decodedResponse)

        // Find objects and player data in decoded structure
        const objects = extractObjects(decodedResponse)

        captures.push({
          id: ++captureIndex,
          opCode,
          url,
          status,
          headers,
          bodyB64: Buffer.from(body).toString('base64'),
          decodedResponse,
          bodySize: body.length,
          timestamp: new Date().toISOString()
        })

        console.log(`[${new Date().toLocaleTimeString()}] Captured: ${url} (${body.length} bytes)`)
        
        // Auto-save to file
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
      // Re-index captures
      captureIndex = captures.length > 0 ? Math.max(...captures.map(c => c.id)) : 0
      res.json({ success: true, count: captures.length })
    } else {
      res.json({ success: true, count: 0 })
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
