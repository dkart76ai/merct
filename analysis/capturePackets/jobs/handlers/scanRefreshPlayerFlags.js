const { scanRefreshPlayerFlagsWorker } = require('../../lib/workerPool')

//? MUST be async, bullmq handles it
async function scanRefreshPlayerFlagsHandler(job) {
  const { kingdom } = job.data

  if (!kingdom) {
    console.log('[scanRefreshPlayerFlagsHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  try {
    const result = await scanRefreshPlayerFlagsWorker(kingdom)
    return result
  } catch (error) {
    console.error(`[scanRefreshPlayerFlagsHandler] Error:`, error.message)

    return {
      success: false,
      kingdom,
      error: error.message,
      timestamp: Date.now()
    }
  }
}

module.exports = {
  scanRefreshPlayerFlagsHandler
}
