const { scanKingdomTask } = require('../../workers/tasks')

//? MUST be async, bullmq handles it
async function scanKingdomHandler(job) {
  const { kingdom, shouldSaveObjects } = job.data

  if (!kingdom) {
    console.log('[scanKingdomHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  try {
    const result = scanKingdomTask({ kingdom, shouldSaveObjects })
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
