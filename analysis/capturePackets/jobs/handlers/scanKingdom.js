const { scanKingdom } = require('../../lib/workerPool.js')

async function scanKingdomHandler(payload) {
  const { kingdom, shouldSaveObjects } = payload

  try {
    const result = scanKingdom(kingdom, shouldSaveObjects)
    return result
  } catch (error) {
    console.error(`[scanKingdomHandler] Error:`, error.message)

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
