const {
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments
} = require('../../../message-pack/messagePack.js')
const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../redis')
const { kingdomUrls } = require('../../kingdomUrls.js')

const HEADERS = {
  'Content-Type': 'application/octet-stream',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Referer: 'https://totalbattle.com/'
}

function buildPacketPayload(tiles, tokenBigInt, token2) {
  if (!tokenBigInt || !token2) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [312, randomSeq, [[tokenBigInt], token2], ''],
    [tiles, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [], []]
  ]

  return packetData
}

async function sendPacketHandler(payload) {
  const { kingdom, tiles } = payload

  const redisClient = getRedis()

  const _token1 = await redisClient.get('mysession:token1:BigInt')
  if (!_token1) {
    throw new Error('no session token1')
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    throw new Error('no session token2')
  }

  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    const packetData = buildPacketPayload(tiles, token1, token2)

    // Encode the packet
    const encoded = encodeMsgPack2MultiFragments(packetData)

    // Send to server
    const url = kingdomUrls[kingdom]
    console.log(`[SendPacket] Sending packet to ${url}  `)
    const response = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded
    })

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`)
    }

    // Get response buffer
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const msgPackDataKey = `msgPackData:${Date.now()}:${Math.random().toString(36).substring(7)}`

    // Store raw bytes (Uint8Array), not decoded results
    await redisClient.set(msgPackDataKey, bytes, 'EX', 60 * 10)

    const result = {
      success: true,
      nextJobs: [
        {
          type: JOB_TYPES.EXTRACT_OBJECTS,
          priority: PRIORITY.NORMAL,
          payload: {
            bufferKey: msgPackDataKey,
            kingdom
          }
        }
      ]
    }

    console.log(`[SendPacket] Success  `)

    return result
  } catch (error) {
    console.error(`[SendPacket] Error:`, error.message)

    return {
      success: false,
      kingdom,
      error: error.message,
      timestamp: Date.now()
    }
  }
}

module.exports = {
  sendPacketHandler
}
