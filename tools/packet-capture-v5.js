// Paste in browser console

// var script = document.createElement('script');
// script.src = 'https://cdn.jsdelivr.net/npm/msgpack-lite/dist/msgpack.min.js';
// document.head.appendChild(script);

// Include msgpack-lite from CDN: <script src="https://cdn.jsdelivr.net/npm/msgpack-lite/dist/msgpack.min.js"></script>

const captured = []
const capturedUrls = new Set()

const TILE_NAMES = {
  17: 'Pueblo',
  34: 'Pueblo',
  69: 'Aserradero',
  73: 'Aserradero',
  79: 'Aserradero',
  84: 'Aserradero',
  104: 'Mina',
  109: 'Mina',
  124: 'Cantera',
  211: 'Ruinas de manantial',
  1450: 'Esc.muerto',
  1451: 'Esc.elfo',
  1452: 'Esc.maldito',
  1454: 'Esc.infernal',
  1455: 'Esc.muerto',
  1462: 'Esc.maldito',
  1463: 'Esc.barbaro',
  1465: 'Esc.muerto',
  1467: 'Esc.maldito',
  1468: 'Esc.muerto',
  1470: 'Esc.muerto',
  1473: 'Esc.barbaro',
  1482: 'Esc.maldito',
  1484: 'Esc.infernal',
  1489: 'Esc.infernal',
  1492: 'Esc.maldito',
  1508: 'Esc.barbaro',
  1511: 'Esc.elfo',
  1514: 'Esc.infernal',
  1519: 'Esc.infernal',
  1591: 'Esc.raro.elfo',
  1592: 'Esc.raro.maldito',
  1593: 'Esc.raro.barbaro',
  1595: 'Esc.raro.muerto',
  1598: 'Esc.raro.maldito',
  1600: 'Esc.raro.muerto',
  1604: 'Esc.raro.infernal',
  1606: 'Esc.raro.elfo',
  1615: 'Esc.raro.muerto',
  1617: 'Esc.raro.maldito',
  1639: 'Esc.raro.infernal',
  1644: 'Esc.raro.infernal',
  1658: 'Esc.raro.infernal',
  1659: 'Esc.raro.infernal',
  1668: 'Esc.raro.barbaro',
  1684: 'Esc.raro.barbaro',
  1699: 'Esc.raro.infernal',
  1812: 'Ciudadela.elfa',
  1816: 'Ciudadela.maldita',
  1817: 'Ciudadela.elfa',
  2102: 'Cripta',
  2108: 'Cripta',
  2206: 'Cripta',
  2211: 'Cripta',
  2302: 'Cripta',
  2304: 'Cripta',
  2309: 'Cripta',
  2410: 'Cripta',
  2753: 'Cripta.epica',
  3201: 'Cripta.rara',
  3301: 'Cripta.rara',
  3511: 'Cripta.rara',
  3512: 'Cripta.rara',
  4000: 'Spawn'
}

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
            name: TILE_NAMES[staticId],
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

const origFetch = window.fetch
function uninstall() {
  window.fetch = origFetch
}

function interceptFetch() {
  window.fetch = async function (url, opts = {}) {
    const reqUrl = typeof url === 'string' ? url : url?.url
    if (!reqUrl || !reqUrl.includes('rubens-realm')) {
      return origFetch.apply(this, arguments)
    }

    if (!capturedUrls.has(reqUrl)) {
      capturedUrls.add(reqUrl)
    }

    let reqBytes = new Uint8Array(0)
    try {
      if (opts.body instanceof ArrayBuffer) {
        reqBytes = new Uint8Array(opts.body)
      } else if (opts.body instanceof Uint8Array) {
        reqBytes = opts.body
      } else if (opts.body instanceof Blob) {
        reqBytes = new Uint8Array(await opts.body.arrayBuffer())
      }
    } catch (e) {
      console.error('YO: Capture error: body read failed', e)
    }

    const reqB64 = reqBytes.length > 0 ? btoa(String.fromCharCode(...reqBytes)) : ''

    const response = await origFetch.apply(this, arguments)
    const resClone = response.clone()

    try {
      const resBytes = new Uint8Array(await resClone.arrayBuffer())
      const resB64 = btoa(String.fromCharCode(...resBytes))

      const kingdomMatch = reqUrl.match(/rubens-realm(\d+)/)
      const kingdom = kingdomMatch ? parseInt(kingdomMatch[1]) : 0

      // Decode response msgpack
      let decodedResponse = decodeFull(resBytes)

      //scan the array and extract first value from array
      const opCode = getFirstValue(decodedResponse)

      // Find objects and player data in decoded structure
      const objects = extractObjects(decodedResponse)

      const capture = {
        url: reqUrl,
        kingdom,
        opCode,
        requestB64: reqB64,
        responseB64: resB64,
        responseSize: resBytes.length,
        objectCount: objects.length,
        hasObjects: objects.length > 0,
        objects,
        timestamp: new Date().toISOString()
      }

      captured.push(capture)
    } catch (e) {
      console.error('YO: Capture error:', e)
    }

    return response
  }
}

interceptFetch()

console.log('YO: ✅ Packet capture v5 active!  ')
console.log('YO: ')
console.log('YO: Navigate in game - captures show:')
console.log('YO: ')
console.log('YO: Commands:')
console.log('YO:   captured                    - All captures with objects/players')
console.log('YO:   capturedUrls               - Unique URLs')
console.log('YO:   exportWithObjects()        - Download captures with objects')
console.log('YO:   exportAll()                - Download all captures')
console.log('YO:   exportURL()                - Download sorted URLs')
console.log('YO:   clearCaptures()            - Clear all')

window.exportWithObjects = function () {
  const withObjects = captured.filter(c => c.hasObjects)
  const json = JSON.stringify(withObjects, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'captures-with-objects.json'
  a.click()
  URL.revokeObjectURL(url)
  console.log('📥 Downloaded', withObjects.length, 'captures with objects')
}

window.exportAll = function () {
  const json = JSON.stringify(captured, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'all-captures.json'
  a.click()
  URL.revokeObjectURL(url)
  console.log('📥 Downloaded', captured.length, 'captures')
}

window.exportURL = function () {
  const json = JSON.stringify(
    [...capturedUrls].sort((a, b) => {
      const numA = parseInt(a.match(/realm(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/realm(\d+)/)?.[1] || '0')
      return numA - numB
    }),
    null,
    2
  )
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'all-urls-v5.json'
  a.click()
  URL.revokeObjectURL(url)
  console.log('YO: 📥 Downloaded', capturedUrls.size, 'urls')
}

window.clearCaptures = function () {
  captured.length = 0
  capturedUrls.clear()
  console.log('YO: 🗑️ Cleared')
}
