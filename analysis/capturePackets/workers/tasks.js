const { styleText } = require('node:util')

console.log(styleText('green', 'This is green!'))

const { Piscina } = require('piscina')
const path = require('path')

const {
  getRequestHeader,
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
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

const generateArrays = (start = 9, end = 2396, step = 50, groupSize = 12) => {
  const allNumbers = []
  const used = new Set()

  for (let i = start; i <= end; i++) {
    if (used.has(i)) continue
    for (let j = 0; j < 4; j++) {
      let num = i + j * step
      if (num <= end && !used.has(num)) {
        allNumbers.push(num)
        used.add(num)
      }
    }
  }

  const result = []
  for (let i = 0; i < allNumbers.length; i += groupSize) {
    result.push(allNumbers.slice(i, i + groupSize))
  }

  return result
}

const processPacket = async ({ request, response, shouldSaveObjects }) => {
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

      if (shouldSaveObjects) {
        const result = saveObjects(objects12)
        console.log(
          `[SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
        )
      }

      return {
        success: true
      }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// scan kingdom -----
function buildPacket312Payload(tiles, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const zeros = new Array(tiles.length).fill(0)
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [312, randomSeq, [[tokenBigInt], token], ''],
    [tiles, zeros, [], []]
  ]

  return packetData
}

function buildPacket313Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[313, randomSeq, [[tokenBigInt], token], ''], []]

  return packetData
}

function buildPacket22Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [22, randomSeq, [[tokenBigInt], token], ''],
    [1, 1]
  ]

  return packetData
}

async function scanKingdom(kingdom, shouldSaveObjects) {
  const redisClient = getRedis()

  const _token1 = await redisClient.get('myPlayerId:BigInt')
  if (!_token1) {
    throw new Error('no session token1')
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    throw new Error('no session token2')
  }

  const url = kingdomUrls[kingdom]
  if (!url) {
    throw new Error('invalid kingdom')
  }

  console.log(`[ScanKingdom] Sending packets to ${url}  `)

  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    //---------- send packet 313
    const packetData313 = buildPacket313Payload(token1, token2)

    // Encode the packet
    const encoded313 = encodeMsgPack2MultiFragments(packetData313)

    const HEADERS = {
      'Content-Type': 'application/octet-stream',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      Referer: 'https://totalbattle.com/'
    }
    // Send to server
    console.log(`[ScanKingdom] Sending packet313 to ${url}  `)
    const response313 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded313
    })

    if (!response313.ok) {
      throw new Error(`packet313: Server returned ${response313.status}: ${response313.statusText}`)
    }

    //---------- send packet 22
    const packetData22 = buildPacket22Payload(token1, token2)

    // Encode the packet
    const encoded22 = encodeMsgPack2MultiFragments(packetData22)

    // Send to server
    console.log(`[ScanKingdom] Sending packet22 to ${url}  `)
    const response22 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded22
    })

    if (!response22.ok) {
      throw new Error(`packet22: Server returned ${response22.status}: ${response22.statusText}`)
    }

    // Get response buffer
    // const buffer313 = await response313.arrayBuffer()
    // const bytes313 = new Uint8Array(buffer313)

    //------ send packet 312

    const tilesArray = generateArrays(9, 2396, 50, 12)

    for (const tiles of tilesArray) {
      const packetData312 = buildPacket312Payload(tiles, token1, token2)

      // Encode the packet
      const encoded312 = encodeMsgPack2MultiFragments(packetData312)

      // Send to server
      console.log(`[ScanKingdom] Sending packet312 to ${url}  `)
      const response312 = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: encoded312
      })

      if (!response312.ok) {
        throw new Error(`Server returned ${response312.status}: ${response312.statusText}`)
      }

      // Get response buffer
      const buffer312 = await response312.arrayBuffer()
      const bytes312 = new Uint8Array(buffer312)

      const payload = {
        request: encoded312,
        response: bytes312,
        shouldSaveObjects
      }
      const result = await processPacket(payload)
    }

    console.log(`[ScanKingdom] Success  `)
  } catch (error) {
    console.error(`[ScanKingdom] Error:`, error.message)
  }
}

module.exports = {
  processPacket,
  scanKingdom
}
