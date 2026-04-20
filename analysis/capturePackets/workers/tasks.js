const { Piscina } = require('piscina')
const path = require('path')
const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  encodeBase64,
  decodeBase64
} = require('message-pack')

const POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 4

// Object extraction logic (moved from handlers/extractObjects.js)
function isValidObject(arr) {
  if (!Array.isArray(arr) || arr.length !== 12) return false
  if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
  if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
  if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
  if (typeof arr[11] !== 'boolean') return false
  return true
}

function extractObjects(data) {
  const objects = []

  function findObjectsRecursive(arr, depth = 0) {
    if (depth > 200) return

    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          const obj = {
            objectId: item[0][0],
            staticId: item[1],
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
          findObjectsRecursive(item, depth + 1)
        }
      }
    }
  }

  findObjectsRecursive(data)
  return objects
}

// Task handlers for Piscina

// Decode msgpack from base64
const decode = async base64 => {
  if (!base64) throw new Error('No base64 data provided, decode from task.js')

  try {
    const bytes = decodeBase64(base64)
    const result = multiDecodeMsgPack2(bytes)
    return { success: true, data: result.results }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Decode from Uint8Array buffer
const decodeBuffer = async buffer => {
  if (!buffer) throw new Error('No buffer provided')

  try {
    const bytes = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer
    const result = multiDecodeMsgPack2(bytes)
    return { success: true, data: result.results }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Encode to msgpack base64
const encode = async data => {
  if (!data) throw new Error('No data provided')

  try {
    const encoded = encodeMsgPack2MultiFragments(data)
    const base64 = encodeBase64(encoded)
    return { success: true, data: base64 }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Extract objects from decoded data
const extract = async decodedData => {
  if (!decodedData) throw new Error('No data provided')

  try {
    const objects = extractObjects(decodedData)
    return { success: true, count: objects.length, objects }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Combined decode + extract
const decodeAndExtract = async base64 => {
  if (!base64) throw new Error('No base64 data provided')

  try {
    const bytes = decodeBase64(base64)
    const decoded = multiDecodeMsgPack2(bytes)
    const objects = extractObjects(decoded.results)
    return {
      success: true,
      decoded: decoded.results,
      count: objects.length,
      objects
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Run task from string name
async function runTask(taskName, args) {
  const task = tasks[taskName]
  if (!task) {
    throw new Error(`Unknown task: ${taskName}`)
  }
  return task(args)
}

// Export for direct use
// module.exports = { tasks, runTask }
module.exports = {
  decode,
  decodeBuffer,
  encode,
  extract,
  decodeAndExtract
}

// // If run directly with task
// if (require.main === module) {
//   const piscina = new Piscina({
//     filename: __filename,
//     maxThreads: POOL_SIZE
//   })

//   console.log(`[Worker Pool] Starting with ${POOL_SIZE} threads`)

//   // Handle messages from main process
//   process.on('message', async ({ task, args, id }) => {
//     try {
//       const result = await runTask(task, args)
//       process.send({ id, success: true, result })
//     } catch (e) {
//       process.send({ id, success: false, error: e.message })
//     }
//   })
// }
