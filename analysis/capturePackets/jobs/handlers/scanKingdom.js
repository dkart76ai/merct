const { scanKingdom } = require('../../workers/tasks')

async function scanKingdomHandler(job) {
  const { kingdom, shouldSaveObjects } = job.data

  if (!kingdom) {
    console.log('[scanKingdomHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

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
