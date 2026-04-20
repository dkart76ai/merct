const { saveObjects } = require('../database')
const { JOB_TYPES, PRIORITY } = require('../index')

async function saveObjectsHandler(data) {
  const { objects } = data

  console.log(`[SaveObjects] Saving ${objects?.length || 0} objects`)
  if (objects && objects.length > 0) {
    console.log(
      `[SaveObjects] First object:`,
      JSON.stringify(objects[0], (k, v) => (typeof v === 'bigint' ? v.toString() : v)).substring(
        0,
        200
      )
    )
  }

  try {
    if (!objects || objects.length === 0) {
      return { success: true, saved: 0 }
    }

    const result = saveObjects(objects)

    console.log(
      `[SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
    )

    // Chain to find-objects after saving
    return {
      success: true,
      // saved: result.objects.length,
      // created: result.created,
      // updated: result.updated,
      nextJobs: [
        {
          type: JOB_TYPES.FIND_OBJECTS,
          priority: PRIORITY.IDLE,
          payload: {
            staticId: 400, // Merc static ID
            amount: 20
            // fromSave: true // Indicates this came from a save operation
          }
        }
      ]
    }
  } catch (error) {
    console.error(`[SaveObjects] Error:`, error.message)
    throw error
  }
}

module.exports = {
  saveObjectsHandler
}
