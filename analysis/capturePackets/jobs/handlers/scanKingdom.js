const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../../lib/redis.js')
const { kingdomUrls } = require('../../kingdomUrls.js')
const { scanKingdom } = require('../../lib/workerPool.js')

async function scanKingdomHandler(payload) {
  const { kingdom, shouldSaveObjects } = payload

  try {
    const result = scanKingdom(kingdom, shouldSaveObjects)
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
