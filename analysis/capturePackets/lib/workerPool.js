const path = require('path')
const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  encodeBase64,
  decodeBase64
} = require('message-pack')

const {
  decode: decodeSync,
  decodeBuffer: decodeBufferSync,
  encode: encodeSync,
  processPacket: processPacketSync
} = require('../workers/tasks')

// Toggle for fallback
const USE_WORKERS = process.env.USE_WORKERS !== 'false'
const WORKER_POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 4

let pool = null
let piscina = null

// Try to load piscina lazily
function loadPiscina() {
  if (piscina) return piscina
  try {
    piscina = require('piscina')
  } catch (e) {
    console.warn('[Worker Pool] Piscina not available:', e.message)
  }
  return piscina
}

function getPool() {
  if (!pool && USE_WORKERS) {
    const Piscina = loadPiscina()
    if (Piscina) {
      try {
        pool = new Piscina({
          filename: path.join(__dirname, '..', 'workers', 'tasks.js'),
          maxThreads: WORKER_POOL_SIZE,
          name: 'packet-worker'
        })
        console.log(`[Worker Pool] Initialized with ${WORKER_POOL_SIZE} threads`)
      } catch (e) {
        console.warn('[Worker Pool] Failed:', e.message)
      }
    }
  }
  return pool
}

// Sync fallback (direct call without worker)

// function isValidObject(arr) {
//   if (!Array.isArray(arr) || arr.length !== 12) return false
//   if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
//   if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
//   if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
//   if (typeof arr[11] !== 'boolean') return false
//   return true
// }

// function extractObjects(data) {
//   const objects = []
//   function findObjectsRecursive(arr, depth = 0) {
//     if (depth > 200) return
//     for (const item of arr) {
//       if (Array.isArray(item)) {
//         if (isValidObject(item)) {
//           objects.push({
//             objectId: item[0][0],
//             staticId: item[1],
//             level: item[5],
//             kingdom: item[8][0],
//             x: item[8][1],
//             y: item[8][2]
//           })
//         } else {
//           findObjectsRecursive(item, depth + 1)
//         }
//       }
//     }
//   }
//   findObjectsRecursive(data)
//   return objects
// }

// function decodeSync(base64) {
//   if (!base64) throw new Error('No base64 data provided')

//   const bytes = decodeBase64(base64)
//   const result = multiDecodeMsgPack2(bytes)
//   return result.results
// }

// function decodeBufferSync(buffer) {
//   if (!buffer) throw new Error('No buffer provided')

//   const bytes = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer
//   const result = multiDecodeMsgPack2(bytes)
//   return result.results
// }

// function encodeSync(data) {
//   if (!data) throw new Error('No data provided')

//   const encoded = encodeMsgPack2MultiFragments(data)
//   return encodeBase64(encoded)
// }

// Wrapper functions with fallback
async function decode(base64) {
  if (!base64) throw new Error('No base64 data provided, decode from workerpool.js')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    const result = decodeSync(base64)
    return result.results
  }
  try {
    const result = await p.run(base64, { name: 'decode' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    console.warn('[Worker Pool] Falling back to sync:', e.message)
    const result = decodeSync(base64)
    return result.results
  }
}

async function decodeBuffer(buffer) {
  if (!buffer) throw new Error('No buffer provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    return decodeBufferSync(buffer)
  }
  try {
    const result = await p.run(buffer, { name: 'decodeBuffer' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    return decodeBufferSync(buffer)
  }
}

async function encode(data) {
  if (!data) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    return encodeSync(data)
  }
  try {
    const result = await p.run(data, { name: 'encode' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    return encodeSync(data)
  }
}

// async function extract(decodedData) {
//   if (!decodedData) throw new Error('No data provided')

//   const p = getPool()
//   if (!p || !USE_WORKERS) {
//     return { count: extractObjects(decodedData).length, objects: extractObjects(decodedData) }
//   }
//   try {
//     const result = await p.run(decodedData, { name: 'extract' })
//     if (!result.success) throw new Error(result.error)
//     return { count: result.count, objects: result.objects }
//   } catch (e) {
//     return { count: extractObjects(decodedData).length, objects: extractObjects(decodedData) }
//   }
// }

// async function decodeAndExtract(base64) {
//   if (!base64) throw new Error('No base64 data provided')

//   const p = getPool()
//   if (!p || !USE_WORKERS) {
//     const decoded = decode(base64)
//     const objects = extractObjects(decoded)
//     return { decoded, count: objects.length, objects }
//   }
//   try {
//     const result = await p.run(base64, { name: 'decodeAndExtract' })
//     if (!result.success) throw new Error(result.error)
//     return {
//       decoded: result.decoded,
//       count: result.count,
//       objects: result.objects
//     }
//   } catch (e) {
//     const decoded = decode(base64)
//     const objects = extractObjects(decoded)
//     return { decoded, count: objects.length, objects }
//   }
// }

async function processPacket({ request, response }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    processPacketSync({ request, response })
    return { success: false, error: 'Workers disabled' }
  }

  try {
    const result = await p.run({ request, response }, { name: 'processPacket' })
    if (!result.success) throw new Error(result.error)
    return result
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  getPool,
  decode,
  decodeBuffer,
  encode,
  // extract,
  // decodeAndExtract,
  processPacket
  // decodeSync,
  // decodeBufferSync,
  // encodeSync,
  // USE_WORKERS
}
