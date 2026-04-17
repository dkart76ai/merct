const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const staticIdDB = require('../../staticId.js')

function extractObjects(data) {
  const objects = []

  function isValidObject(arr) {
    if (!Array.isArray(arr) || arr.length !== 12) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
    if (typeof arr[11] !== 'boolean') return false
    return true
  }

  function findObjects(arr, depth = 0) {
    if (depth > 200) return
    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          const staticId = item[1]
          objects.push({
            objectId: item[0][0],
            staticId: staticId,
            unk1: item[2],
            unk2: item[3],
            unk3: item[4],
            level: item[5],
            unk4: item[6],
            unk5: item[7],
            kingdom: item[8][0],
            x: item[8][1],
            y: item[8][2],
            unk6: item[9][0],
            extra: item[10],
            isActive: item[11]
          })

          // track unknown static id
          const dbEntry = staticIdDB.getStaticIdData(staticId)
          const isComplete =
            dbEntry &&
            dbEntry.name &&
            dbEntry.entryType &&
            dbEntry.level != null &&
            dbEntry.level >= 0
          if (!isComplete) {
            // await sendMessage('', { k: kingdom, x, y }, staticId, dbEntry?.entryType || 'poi')
          }
        } else {
          findObjects(item, depth + 1)
        }
      }
    }
  }

  findObjects(data)
  return objects
}

async function extractObjectsHandler(data) {
  const { buffer, triggeredBy } = data

  const _buffer = Buffer.from(buffer, 'base64')
  const packetData = new Uint8Array(_buffer)

  console.log(`[ExtractObjects] Processing data`)

  try {
    const objects = extractObjects(packetData)

    console.log(`[ExtractObjects] Found ${objects.length} objects`)

    if (objects.length === 0) {
      return { success: true, count: 0, objects: [] }
    }

    // Chain: Save objects first, then find-objects will trigger notification
    return {
      success: true,
      count: objects.length,
      objects,
      triggeredBy,
      nextJobs: [
        {
          type: JOB_TYPES.SAVE_OBJECTS,
          priority: PRIORITY.NORMAL,
          payload: {
            objects,
            triggeredBy
          }
        }
      ]
    }
  } catch (error) {
    console.error(`[ExtractObjects] Error:`, error.message)
    throw error
  }
}

module.exports = {
  extractObjectsHandler,
  extractObjects
}
