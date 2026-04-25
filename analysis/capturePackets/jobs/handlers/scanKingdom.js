const fs = require('fs')
const path = require('path')
const { multiDecodeMsgPack2, encodeMsgPack2MultiFragments } = require('message-pack')
const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../../lib/redis.js')
const { kingdomUrls } = require('../../kingdomUrls.js')

// TODO: THIS SHOULD NOT SEND PACKET, IT SHOULD START THE WORKER THREAD, SO WORKER DO THE JOB

async function scanKingdomHandler(payload) {
  const { kingdom } = payload

  try {
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
  scanKingdomHandler
}
