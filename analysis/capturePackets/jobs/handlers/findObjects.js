const { findObjects } = require('../database')
const { addJob, JOB_TYPES, PRIORITY } = require('../index')

async function findObjectsHandler(data) {
  const { staticId, level, amount, triggeredBy, notificationConfig } = data

  console.log(`[FindObjects] Searching: staticId=${staticId}, level=${level}, amount=${amount}`)

  try {
    const result = findObjects({ staticId, level, amount })

    console.log(`[FindObjects] Found ${result.total} objects, returning ${result.returned}`)

    // If we found objects, trigger notification
    if (result.objects.length > 0) {
      console.log(`[FindObjects] Triggering notification for ${result.objects.length} objects`)

      return {
        success: true,
        found: result.total,
        returned: result.returned,
        objects: result.objects,
        nextJobs: [
          {
            type: JOB_TYPES.NOTIFICATION,
            priority: PRIORITY.HIGH,
            payload: {
              objects: result.objects,
              searchCriteria: { staticId, level, amount },
              triggeredBy
            }
          }
        ]
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
