const { findObjects } = require('../../lib/database')
const { JOB_TYPES, PRIORITY } = require('../constants')

async function findObjectsHandler(job) {
  const { staticId, level, amount } = job.data

  console.log(`[FindObjects] Searching: staticId=${staticId}, level=${level}, amount=${amount}`)

  try {
    const result = findObjects({ staticId, level, amount })

    console.log(`[FindObjects] Found ${result.total} objects, returning ${result.returned}`)

    // If we found objects, trigger notification
    if (result.objects.length > 0) {
      console.log(`[FindObjects] Triggering notification for ${result.objects.length} objects`)

      return {
        success: true
      }
    }

    return {
      success: true,
      found: result.total,
      returned: result.returned,
      objects: []
    }
  } catch (error) {
    console.error(`[FindObjects] Error:`, error.message)
    throw error
  }
}

module.exports = {
  findObjectsHandler
}
