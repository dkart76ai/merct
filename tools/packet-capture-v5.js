// Packet Capture Script v5 - Using msgpack-lite library
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

// Extract viewX/viewY from raw bytes (uint16 LE at bytes 10-11 for viewX)
function extractViewCoordsRaw(reqBytes) {
  let viewX = 0,
    viewY = 0
  if (reqBytes.length >= 16) {
    viewX = reqBytes[10] | (reqBytes[11] << 8)
    viewY = reqBytes[14]
  }
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setUint16(0, viewX, false)
  const viewXBE = view.getUint32(0, true)
  view.setUint16(0, viewY, false)
  const viewYBE = view.getUint32(0, true)
  return { viewX, viewY, viewXBE, viewYBE }
}

// Extract viewX/viewY using msgpack library
function extractViewCoordsMsgpack(reqBytes) {
  let viewX = 0,
    viewY = 0
  const msgpackData = reqBytes.slice(8)
  try {
    if (typeof msgpack !== 'undefined' && msgpack.decode) {
      const decoded = msgpack.decode(msgpackData)
      if (Array.isArray(decoded) && decoded.length >= 2) {
        viewX = decoded[0] || 0
        viewY = decoded[1] || 0
      }
    }
  } catch (e) {
    console.log('YO: Msgpack decode error:', e.message)
  }
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setUint16(0, viewX, false)
  const viewXBE = view.getUint32(0, true)
  view.setUint16(0, viewY, false)
  const viewYBE = view.getUint32(0, true)
  return { viewX, viewY, viewXBE, viewYBE }
}

// Decode objects using msgpack library
function decodeObjects(buf) {
  const objects = []

  try {
    // Skip 8-byte header
    const msgpackData = buf.slice(8)

    if (typeof msgpack !== 'undefined' && msgpack.decode) {
      const decoded = msgpack.decode(msgpackData)

      // Search for objects in the decoded structure
      findObjects(decoded, objects)
    }
  } catch (e) {
    console.log('YO: Object decode error:', e.message)
  }

  return objects
}

// Recursively find objects in decoded structure
function findObjects(data, objects, depth = 0) {
  if (depth > 10) return // Prevent infinite recursion

  if (Array.isArray(data)) {
    // Check if this is a 12-element array with coords
    if (data.length === 12) {
      const coords = data[8]
      if (Array.isArray(coords) && coords.length === 3) {
        const [k, x, y] = coords
        if (typeof k === 'number' && k >= 2 && k <= 2000) {
          objects.push({
            k,
            x,
            y,
            staticId: data[1],
            level: data[5],
            name: TILE_NAMES[data[1]] || 'Unknown'
          })
        }
      }
    }

    // Search in array elements
    for (const item of data) {
      if (Array.isArray(item)) {
        findObjects(item, objects, depth + 1)
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    // Search in object values
    for (const key in data) {
      const val = data[key]
      if (Array.isArray(val)) {
        findObjects(val, objects, depth + 1)
      }
    }
  }
}

// Check response for TB: player tag and extract strings
function extractPlayerData(resBytes) {
  const result = {
    hasPlayerTag: false,
    playerTag: null,
    strings: [],
    hasObjects: false
  }
  
  // Search for TB: pattern in raw bytes (player tags like "TB:12345")
  const ascii = String.fromCharCode(...resBytes)
  const tbMatch = ascii.match(/TB:(\d+)/g)
  if (tbMatch) {
    result.hasPlayerTag = true
    result.playerTag = tbMatch
  }
  
  // Extract printable strings (min 3 chars)
  let str = ''
  for (let i = 0; i < resBytes.length; i++) {
    const c = resBytes[i]
    if (c >= 32 && c <= 126) {
      str += String.fromCharCode(c)
    } else {
      if (str.length >= 3 && str.match(/[a-zA-Z]/)) {
        result.strings.push(str)
      }
      str = ''
    }
  }
  if (str.length >= 3 && str.match(/[a-zA-Z]/)) {
    result.strings.push(str)
  }
  
  return result
}

// Extract staticId and token from request using msgpack
function extractStaticIdAndToken(reqBytes) {
  let staticId = 0
  let tokenHex = ''

  if (reqBytes.length >= 40 && typeof msgpack !== 'undefined') {
    try {
      const data = msgpack.decode(reqBytes.slice(8))
      if (Array.isArray(data) && data.length >= 3 && Array.isArray(data[2])) {
        // data[2] is the session array [[staticId], token]
        if (Array.isArray(data[2][0]) && data[2][0].length > 0) {
          staticId = data[2][0][0]
        }
        if (data[2][1] instanceof Uint8Array || (data[2][1] && data[2][1].type === 'Buffer')) {
          const tokenBytes = data[2][1].data || data[2][1]
          tokenHex = Array.from(tokenBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
        }
      }
    } catch (e) {
      console.log('YO: Error decoding staticId/token:', e.message)
    }
  }

  // Fallback: extract token directly from bytes 28-39
  if (!tokenHex && reqBytes.length >= 40) {
    const tokenBytes = reqBytes.slice(28, 40)
    tokenHex = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }

  return { staticId, tokenHex }
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

      // Decode using msgpack library
      const { viewX, viewY, viewXBE, viewYBE } = extractViewCoordsMsgpack(reqBytes)
      const raw = extractViewCoordsRaw(reqBytes)
      const { staticId, tokenHex } = extractStaticIdAndToken(reqBytes)

      const kingdomMatch = reqUrl.match(/rubens-realm(\d+)/)
      const kingdom = kingdomMatch ? parseInt(kingdomMatch[1]) : 0

      const objects = decodeObjects(resBytes)
      const playerData = extractPlayerData(resBytes)

      const capture = {
        url: reqUrl,
        kingdom,
        viewX,
        viewY,
        viewXBE,
        viewYBE,
        viewX_raw: raw.viewX,
        viewY_raw: raw.viewY,
        staticId,
        token: tokenHex,
        requestB64: reqB64,
        responseB64: resB64,
        responseSize: resBytes.length,
        objectCount: objects.length,
        hasObjects: objects.length > 0,
        hasPlayerTag: playerData.hasPlayerTag,
        playerTags: playerData.playerTag,
        strings: playerData.strings.slice(0, 10),
        objects: objects.slice(0, 5),
        timestamp: new Date().toISOString()
      }
      
      const hasFlag = capture.hasObjects ? '📦' : (capture.hasPlayerTag ? '👤' : '')
      console.log(
        `YO: ${hasFlag} k${kingdom} viewX=${raw.viewX} viewY=${raw.viewY} | objs=${objects.length} playerTags=${playerData.hasPlayerTag ? playerData.playerTag.length : 0}`
      )
      
      if (capture.hasObjects || capture.hasPlayerTag) {
        captured.push(capture)
        if (playerData.strings.length > 0) {
          console.log('   Strings:', playerData.strings.slice(0, 5).join(', '))
        }
      }
    } catch (e) {
      console.error('YO: Capture error:', e)
    }

    return response
  }
}

interceptFetch()

console.log('YO: ✅ Packet capture v5 active! (using msgpack-lite library)')
console.log('YO: ')
console.log('YO: IMPORTANT: Load msgpack-lite library first:')
console.log(
  'YO:   <script src="https://cdn.jsdelivr.net/npm/msgpack-lite/dist/msgpack.min.js"></script>'
)
console.log('YO: ')
console.log('YO: Navigate in game - captures show:')
console.log('YO:   [✓/⚠] viewX={msgpack} viewY={msgpack} (raw: {raw})')
console.log('YO: ')
console.log('YO: Commands:')
console.log('YO:   captured                    - All captures with objects/players')
console.log('YO:   capturedUrls               - Unique URLs')
console.log('YO:   exportWithObjects()        - Download captures with objects')
console.log('YO:   exportWithPlayers()         - Download captures with player data')
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

window.exportWithPlayers = function () {
  const withPlayers = captured.filter(c => c.hasPlayerTag)
  const json = JSON.stringify(withPlayers, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'captures-with-players.json'
  a.click()
  URL.revokeObjectURL(url)
  console.log('📥 Downloaded', withPlayers.length, 'captures with player data')
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
