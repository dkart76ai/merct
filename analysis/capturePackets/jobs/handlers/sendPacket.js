const fs = require('fs')
const path = require('path')
const { multiDecodeMsgPack2, encodeMsgPack2MultiFragments } = require('message-pack')
const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../../lib/redis.js')
const { kingdomUrls } = require('../../kingdomUrls.js')

const HEADERS = {
  'Content-Type': 'application/octet-stream',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Referer: 'https://totalbattle.com/'
}

let captureIndex = 0
let saveFileIndex = 0
let captures = []

const SAVE_DIR = path.join(__dirname, '../../packetSender')

function savePacketToFile(opcode, url, tiles, request, response) {
  captures.push({
    id: ++captureIndex,
    opcode,
    url,
    status: 200,
    tileIds: tiles,
    timestamp: Date.now(),
    request: {
      method: 'POST',
      bodyB64: Buffer.from(request).toString('base64')
    },
    response: {
      bodyB64: Buffer.from(response).toString('base64')
    }
  })

  if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true })
  }

  const saveFile = path.join(SAVE_DIR, `pktsend-${String(saveFileIndex).padStart(3, '0')}.json`)
  //save packet to analyze
  fs.writeFileSync(
    saveFile,
    JSON.stringify(captures, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
  )

  if (captures.length >= 30) {
    captures = []
    captureIndex = 0
    saveFileIndex++
    console.log(
      `[${new Date().toLocaleTimeString()}] Rotation: switched to pktsend-${String(saveFileIndex).padStart(3, '0')}.json`
    )
  }
}

function buildPacket311Payload(tiles, tokenBigInt, token2) {
  if (!tokenBigInt || !token2) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[311, randomSeq, [[tokenBigInt], token2], ''], [[tiles]]]

  return packetData
}

function buildPacket312Payload(tiles, tokenBigInt, token2) {
  if (!tokenBigInt || !token2) return null

  const zeros = new Array(tiles.length).fill(0)
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [312, randomSeq, [[tokenBigInt], token2], ''],
    [tiles, zeros, [], []]
  ]

  return packetData
}

async function sendPacketHandler(payload) {
  const { kingdom, tiles } = payload

  const redisClient = getRedis()

  const _token1 = await redisClient.get('myPlayerId:BigInt')
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
    const url = kingdomUrls[kingdom]
    console.log(`[SendPacket] Sending packets to ${url}  `)

    //---------- send packet 311
    const packetData311 = buildPacket311Payload(tiles, token1, token2)

    // Encode the packet
    const encoded311 = encodeMsgPack2MultiFragments(packetData311)

    // Send to server
    console.log(`[SendPacket] Sending packet311 to ${url}  `)
    const response311 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded311
    })

    if (!response311.ok) {
      throw new Error(`Server returned ${response311.status}: ${response311.statusText}`)
    }

    // Get response buffer
    const buffer311 = await response311.arrayBuffer()
    const bytes311 = new Uint8Array(buffer311)

    savePacketToFile(311, url, tiles, encoded311, bytes311)

    //------ send packet 312
    const packetData312 = buildPacket312Payload(tiles, token1, token2)

    // Encode the packet
    const encoded312 = encodeMsgPack2MultiFragments(packetData312)

    // Send to server
    console.log(`[SendPacket] Sending packet312 to ${url}  `)
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

    savePacketToFile(312, url, tiles, encoded312, bytes312)

    //-----

    const msgPackDataKey = `msgPackData:${Date.now()}:${Math.random().toString(36).substring(7)}`

    // Store raw bytes (Uint8Array), not decoded results
    await redisClient.set(msgPackDataKey, bytes312, 'EX', 60 * 10)

    const result = {
      success: true,
      nextJobs: [
        {
          type: JOB_TYPES.EXTRACT_OBJECTS,
          priority: PRIORITY.CRITICAL,
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
