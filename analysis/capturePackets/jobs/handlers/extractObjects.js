const fs = require('fs')
const path = require('path')

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
        } else {
          findObjects(item, depth + 1)
        }
      }
    }
  }

  findObjects(data)
  return objects
}

async function loadStaticIdDb() {
  const dbPath = path.join(__dirname, '../../staticId-db.json')
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
      return new Map(Object.entries(data))
    }
  } catch (e) {
    console.error('[ExtractObjects] Error loading staticId-db:', e.message)
  }
  return new Map()
}

async function extractObjectsHandler(payload) {
  const { packetData, kingdom, triggeredBy, saveToDb = true } = payload

  console.log(`[ExtractObjects] Processing ${packetData.length} data items`)

  try {
    const objects = extractObjects(packetData)
    
    console.log(`[ExtractObjects] Found ${objects.length} objects`)

    if (objects.length === 0) {
      return { success: true, count: 0, objects: [], nextJobs: [] }
    }

    // Enrich with static ID data
    const staticIdDb = await loadStaticIdDb()
    const enrichedObjects = objects.map(obj => {
      const known = staticIdDb.get(String(obj.staticId))
      return {
        ...obj,
        name: known?.name || null,
        entryType: known?.entryType || null
      }
    })

    // Filter objects that might need notifications
    const notifyObjects = enrichedObjects.filter(obj => 
      obj.name && obj.isActive
    )

    const nextJobs = []

    // Check for notification-worthy objects
    if (notifyObjects.length > 0) {
      console.log(`[ExtractObjects] ${notifyObjects.length} objects eligible for notification`)
      nextJobs.push({
        type: 'notification',
        priority: 'HIGH',
        payload: {
          type: 'objects-spotted',
          objects: notifyObjects,
          triggeredBy
        }
      })
    }

    const result = {
      success: true,
      count: objects.length,
      objects: enrichedObjects,
      notificationCount: notifyObjects.length,
      triggeredBy,
      timestamp: Date.now(),
      nextJobs
    }

    return result

  } catch (error) {
    console.error(`[ExtractObjects] Error:`, error.message)
    
    return {
      success: false,
      count: 0,
      objects: [],
      error: error.message,
      timestamp: Date.now(),
      nextJobs: []
    }
  }
}

module.exports = {
  extractObjectsHandler,
  extractObjects,
  loadStaticIdDb
}
