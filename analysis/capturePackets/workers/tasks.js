const { styleText } = require('node:util')

console.log(styleText('green', 'This is green!'))

const { Piscina } = require('piscina')
const path = require('path')

const {
  getRequestHeader,
  multiDecodeMsgPack2,
  decodeMsgPackBase64,
  encodeMsgPack2,
  scanPacket312
} = require('../messagePack.js')
const staticId = require('../staticId.js')
const { getRedis } = require('../lib/redis')
const { saveObjects } = require('../lib/database')

const POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 4

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

// function getFirstValue(data, depth = 0) {
//   if (depth > 100) return null
//   if (!data || !Array.isArray(data)) return null

//   for (let item of data) {
//     if (typeof item === 'number') return item
//     if (Array.isArray(item)) {
//       const resultado = getFirstValue(item, depth + 1)
//       if (resultado !== undefined) return resultado
//     }
//   }

//   return null
// }

//---------------------------------
// Task handlers for Piscina
//---------------------------------

// Decode msgpack from base64
const decode = async base64 => {
  if (!base64) throw new Error('No base64 data provided, decode from task.js')

  try {
    const result = decodeMsgPackBase64(base64)
    return { success: true, data: result.results }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Decode from Uint8Array buffer
const decodeBuffer = async buffer => {
  if (!buffer) throw new Error('No buffer provided')

  try {
    const result = multiDecodeMsgPack2(buffer)
    return { success: true, data: result.results }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Encode to msgpack
const encode = async data => {
  if (!data) throw new Error('No data provided')

  try {
    const encoded = encodeMsgPack2(data)

    return { success: true, data: encoded }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const processPacket = async ({ request, response }) => {
  if (!request || !response) throw new Error('No  data provided')

  try {
    // const bytes = decodeBase64(base64)
    // const { results: decodedRequest } = multiDecodeMsgPack2(request)
    // const { results: decodedResponse } = multiDecodeMsgPack2(response)

    // const opCode = getFirstValue(decodedResponse)
    const { opCode, userId, token } = getRequestHeader(request)
    // console.log('processpacket', opCode, userId, token)

    // let tileIds = []
    // if (opCode === 312) {
    //   tileIds = decodedRequest[1]
    // }
    const redisClient = getRedis()

    // any packets bring those data, but only save on 312, to not saturate redis with requests
    if (opCode === 312) {
      await redisClient.set('myPlayerId:BigInt', userId.toString(), 'EX', 86400)
      await redisClient.set('mysession:token2:Uint8Array', Buffer.from(token), 'EX', 86400)
    }

    if (opCode === 312 || opCode === 408) {
      // const objects = extractObjects(decodedResponse)
      // if (objects && objects.length > 0) {
      //   console.log(`[SaveObjects] Saving ${objects?.length} objects`)
      //   const result = saveObjects(objects)

      //   console.log(
      //     `[SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
      //   )
      // }

      console.log(styleText('red', 'This is not green!'))
      console.log(styleText('green', 'This is green!'))
      const { players42, objects12 } = scanPacket312(response)
      console.log('scanPacket312: players42:', players42.length, players42[0])
      console.log(
        `scanPacket312: found ${objects12.length} objects12: `,

        objects12.map(o => {
          const data = staticId.getStaticIdData(o.staticId)
          return `${o.kingdom},${o.x},${o.y} staticid:${o.staticId}, ${data?.name || 'unknown'} level:${o.level}`
        })
      )

      const result = saveObjects(objects12)

      console.log(
        `[SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
      )

      return {
        success: true
      }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  decode,
  decodeBuffer,
  encode,
  processPacket
}
