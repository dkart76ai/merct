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

  return {
    packetData,

    notificationConfig: config
  }
}

async function sendPacketHandler(payload) {
  const { kingdomId, tiles, triggeredBy = 'manual', notificationConfig = {} } = payload

  const redisClient = getRedis()

  const _token1 = await redisClient.get('mysession:token1:BigInt')
  if (!_token1) {
    return res.json({ success: false, error: 'no session token1' })
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    return res.json({ success: false, error: 'no session token2' })
  }
  const token1 = BigInt(_token1)
  const token2 = new Uint8Array(_token2)

  try {
    const packetData = buildPacketPayload(tiles, token1, token2)
    // Encode the packet
    const encoded = encodeMsgPack2MultiFragments(packetData)

    // Send to server
    const url = kingdomUrls[kingdomId]
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

    console.log(`[SendPacket] Received ${bytes.length} bytes from server`)

    if (bytes.length < 8) {
      throw new Error(`Response too small: ${bytes.length} bytes`)
    }

    // Decode response
    const decoded = multiDecodeMsgPack2(bytes)

    if (!decoded.results || decoded.results.length === 0) {
      throw new Error('No results in decoded response')
    }

    const result = {
      success: true,
      triggeredBy,
      kingdom,
      responseLength: bytes.length,
      decoded: decoded.results,
      timestamp: Date.now(),
      nextJobs: [
        {
          type: JOB_TYPES.EXTRACT_OBJECTS,
          priority: PRIORITY.NORMAL,
          payload: {
            buffer: Buffer.from(decoded.results).toString('base64'),
            // packetData: decoded.results,
            kingdom,
            triggeredBy,
            notificationConfig
          }
        }
      ]
    }

    console.log(`[SendPacket] Success - ${decoded.results.length} objects in response`)

    return result
  } catch (error) {
    console.error(`[SendPacket] Error:`, error.message)

    return {
      success: false,
      triggeredBy,
      kingdom,
      error: error.message,
      timestamp: Date.now()
    }
  }
}

module.exports = {
  sendPacketHandler
}
