const { scanKingdomWorker } = require('../../lib/workerPool')
//!bullmq llama a piscina
//? MUST be async, bullmq handles it
async function scanKingdomHandler(job) {
  const { kingdom, shouldSaveObjects, checkFlags = false } = job.data

  if (!kingdom) {
    console.log('[scanKingdomHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  try {
    const result = await scanKingdomWorker(kingdom, shouldSaveObjects, checkFlags)
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
