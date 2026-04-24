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
const staticIdDB = require('../staticId.js')
const { getRedis } = require('../lib/redis')
const { saveObjects } = require('../lib/database')

const POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 4

//---------------------------------
// Task handlers for Piscina
//---------------------------------
staticIdDB.loadStaticDb()
// console.log('staticid', Object.keys(staticIdDB))
// console.log(
//   'test staticid getter',
//   staticIdDB.getStaticIdData(1531),
//   'Escuadrón común de elfos lvl30'
// )

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

    if (opCode === 312) {
      console.log(styleText('red', 'This is not green!'))
      console.log(styleText('green', 'opcode', opCode))
      const { players42, objects12 } = scanPacket312(response)
      console.log('scanPacket312: players42:', players42.length)
      console.log('scanPacket312: objects12:', objects12.length)

      // console.log(
      //   styleText('green'),
      //   players42
      //     .slice(0, 5)
      //     .map(
      //       player =>
      //         `${player.sourceKingdom}:${player.sourceX}:${player.sourceY} lvl:${player.level} shield = ${String(player.isShieldActive)}`
      //     )
      // )

      // objects12.slice(0, 5).forEach(o => {
      //   const data = staticIdDB.getStaticIdData(o.staticId)
      //   console.log(
      //     `scanPacket312: found ${objects12.length} objects12: `,

      //     `${o.kingdom},${o.x},${o.y} staticid:${o.staticId}, lvl:${data?.level}-${data?.name || 'unknown'} level:${o.level}`
      //   )
      // })

      objects12.forEach(o => {
        const data = staticIdDB.getStaticIdData(o.staticId)

        // NOTE : dont delete static id updater
        if (!data.level) {
          staticIdDB.addOrUpdateStaticId(sub.staticId, {
            level: o.level
          })
        }
        // END NOTE

        if (!data?.name || !data?.level) {
          console.log(
            `scanPacket312: found ${objects12.length} objects12: `,

            `${o.kingdom},${o.x},${o.y} staticid:${o.staticId}, lvl:${data?.level}-${data?.name || 'unknown'} level:${o.level}`
          )
        }
      })

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
