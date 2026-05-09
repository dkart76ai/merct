const { scanRefreshPlayerInfoTask } = require('../../workers/tasks')

//? MUST be async, bullmq handles it
async function scanRefreshPlayerInfoHandler(job) {
  const { kingdom } = job.data

  if (!kingdom) {
    console.log('[scanRefreshPlayerInfoHandler] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  try {
    const result = scanRefreshPlayerInfoTask({ kingdom })
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
