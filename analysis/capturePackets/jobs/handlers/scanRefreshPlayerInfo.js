const { scanRefreshPlayerInfoWorker } = require('../../lib/workerPool')

//? MUST be async, bullmq handles it
async function scanRefreshPlayerInfoHandler(job) {
  const { kingdom, checkFlags } = job.data

  if (!kingdom) {
    console.log('[scanRefreshPlayerInfoHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  try {
    const result = await scanRefreshPlayerInfoWorker(kingdom, checkFlags)
    return result
  } catch (error) {
    console.error(`[scanRefreshPlayerInfoHandler] Error:`, error.message)

    return {
      success: false,
      kingdom,
      error: error.message,
      timestamp: Date.now()
    }
  }
}

module.exports = {
  scanRefreshPlayerInfoHandler
}
