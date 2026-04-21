const { styleText } = require('node:util')

const { Piscina } = require('piscina')
const path = require('path')
const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  encodeBase64,
  decodeBase64
} = require('message-pack')
const { getRedis } = require('../lib/redis')
const { saveObjects } = require('../lib/database')

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

function getFirstValue(data, depth = 0) {
  if (depth > 100) return null
  if (!data || !Array.isArray(data)) return null

  for (let item of data) {
    if (typeof item === 'number') return item
    if (Array.isArray(item)) {
      const resultado = getFirstValue(item, depth + 1)
      if (resultado !== undefined) return resultado
    }
  }

  return null
}

// function containsPlayerId(data, playerId, internalId) {
//   if (!data) return false
//   const str = JSON.stringify(data, (key, value) =>
//     typeof value === 'bigint' ? value.toString() : value
//   )
//   if (playerId && str.includes(playerId)) return true
//   if (internalId && str.includes(String(internalId))) return true
//   return false
// }

async function extractMySessionTokens(decodedReq) {
  console.log(
    '312 packet getting tokens',
    JSON.stringify(decodedReq, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  )
  // 312 packet getting tokens [[312,2807,[["1309965043442"],{"0":105,"1":227,"2":98,"3":249,"4":171,"5":90,"6":183,"7":199,"8":35,"9":185,"10":113,"11":96}],""],[[2284],[45713],[],[]],
  //request:  [312,284,[["1309965043442"],{"0":105,"1":223,"2":166,"3":213,"4":171,"5":90,"6":183,"7":199,"8":35,"9":86,"10":245,"11":99}],""]

  const myPlayerId = decodedReq[0]?.[2]?.[0]?.[0] || null
  // mySessionToken =
  //   typeof rawToken === 'bigint'
  //     ? rawToken
  //     : typeof rawToken === 'number'
  //       ? BigInt(rawToken)
  //       : rawToken
  const token2 = decodedReq[0]?.[2]?.[1] || null // auth token?
  const mySessionToken2 = mapToUint8Array(token2)

  await redisClient.set('myPlayerId:BigInt', myPlayerId.toString(), 'EX', 86400)
  await redisClient.set('mysession:token2:Uint8Array', Buffer.from(mySessionToken2), 'EX', 86400)

  //    const val = await redisClient.get('mysession:token1');

  // if (val !== null) {
  //   const recoveredBigInt = BigInt(val);

  //   // Ahora puedes hacer operaciones matemáticas de BigInt
  //   console.log(recoveredBigInt + 1n);
  // }

  //    const data = await redisClient.getBuffer('mi_clave_binaria');

  // if (data) {
  //   const recuperado = new Uint8Array(data);
  //   console.log(recuperado); // Uint8Array [10, 20, 30, 40]
  // }
}

//---------------------------------
// Task handlers for Piscina
//---------------------------------

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
    // const base64 = encodeBase64(encoded)
    return { success: true, data: encoded }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Extract objects from decoded data
// const extract = async decodedData => {
//   if (!decodedData) throw new Error('No data provided')

//   try {
//     const objects = extractObjects(decodedData)
//     return { success: true, count: objects.length, objects }
//   } catch (e) {
//     return { success: false, error: e.message }
//   }
// }

// Combined decode + extract
// const decodeAndExtract = async base64 => {
//   if (!base64) throw new Error('No base64 data provided')

//   try {
//     const bytes = decodeBase64(base64)
//     const decoded = multiDecodeMsgPack2(bytes)
//     const objects = extractObjects(decoded.results)
//     return {
//       success: true,
//       decoded: decoded.results,
//       count: objects.length,
//       objects
//     }
//   } catch (e) {
//     return { success: false, error: e.message }
//   }
// }

const processPacket = async ({ request, response }) => {
  if (!request || !response) throw new Error('No  data provided')

  try {
    // const bytes = decodeBase64(base64)
    const { results: decodedRequest } = multiDecodeMsgPack2(request)
    const { results: decodedResponse } = multiDecodeMsgPack2(response)

    const opCode = getFirstValue(decodedResponse)

    // let isMyPacket = false
    // const internalPlayerId = await redisClient.get('myPlayerId:bigint')
    // if (internalPlayerId !== null) {
    // isMyPacket = containsPlayerId(
    //   decodedResponse,
    //   myPlayerInfo.playerId,
    //   BigInt(internalPlayerId)
    // )
    // }

    // let tileIds = []
    // if (opCode === 312) {
    //   tileIds = decodedRequest[1]
    // }

    if (opCode === 312) {
      extractMySessionTokens(decodedRequest)
    }

    if (opCode === 312 || opCode === 408) {
      // pass rawBytes (encoded)to extract_objects as they are smaller
      // const msgPackDataKey = `msgPackData:${Date.now()}:${Math.random().toString(36).substring(7)}`
      // await redisClient.set(msgPackDataKey, Buffer.from(responseData), 'EX', 60 * 10)

      // const payload = {
      //   bufferKey: msgPackDataKey
      // }

      const objects = extractObjects(decodedResponse)
      if (objects && objects.length > 0) {
        console.log(`[SaveObjects] Saving ${objects?.length || 0} objects`)
        const result = saveObjects(objects)

        console.log(
          `[SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
        )
      }

      console.log(styleText('green', 'This is green!'))

      return {
        success: true
        //   decoded: decoded.results,
        //   count: objects.length,
        //   objects
      }
      // objects.forEach(obj => trackUnknownStaticId(obj))
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
  // extract,
  // decodeAndExtract,
  processPacket
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
