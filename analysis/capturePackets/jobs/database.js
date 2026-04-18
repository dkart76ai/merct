const objectsDb = new Map()

const TTL_WARNING_MS = 10 * 60 * 1000 // 10 minutes
const TTL_CLEAN_MS = 20 * 60 * 1000 // 20 minutes

let stats = {
  totalSaved: 0,
  totalCleaned: 0,
  lastSavedAt: null
}
let cleanupInterval = null

function getKey(obj) {
  return `${obj.kingdom}:${obj.x}:${obj.y}`
}

function saveObject(obj) {
  const key = getKey(obj)
  const existing = objectsDb.get(key)

  if (existing) {
    const merged = {
      ...obj,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: Date.now(),
      seenCount: (existing.seenCount || 1) + 1,
      warning: false,
      warningSetAt: null
    }
    objectsDb.set(key, merged)
    return { action: 'updated', key }
  } else {
    const newObj = {
      ...obj,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      seenCount: 1,
      warning: false,
      warningSetAt: null
    }
    objectsDb.set(key, newObj)
    stats.totalSaved++
    stats.lastSavedAt = Date.now()
    return { action: 'created', key }
  }
}

function saveObjects(objects) {
  const results = {
    created: 0,
    updated: 0,
    objects: []
  }

  for (const obj of objects) {
    const result = saveObject(obj)
    if (result.action === 'created') {
      results.created++
    } else {
      results.updated++
    }
    results.objects.push(result.key)
  }

  return results
}

function findObjects(query) {
  const { staticId, level, amount = 10, withWarning = false } = query

  let results = []
  const now = Date.now()

  for (const obj of objectsDb.values()) {
    if (staticId !== undefined && obj.staticId !== staticId) continue
    if (level !== undefined && obj.level !== level) continue
    if (withWarning !== undefined && obj.warning !== withWarning) continue
    results.push(obj)
  }

  results.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  const limited = results.slice(0, amount)

  return {
    total: results.length,
    returned: limited.length,
    objects: limited
  }
}

function getStats() {
  let warningCount = 0
  for (const obj of objectsDb.values()) {
    if (obj.warning) warningCount++
  }
  return {
    ...stats,
    uniqueObjects: objectsDb.size,
    warningCount
  }
}

function clearDb() {
  objectsDb.clear()
  stats = {
    totalSaved: 0,
    totalCleaned: 0,
    lastSavedAt: null
  }
}

function getAllObjects() {
  return Array.from(objectsDb.values())
}

function getObject(key) {
  return objectsDb.get(key)
}

function deleteObject(key) {
  return objectsDb.delete(key)
}

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let warningSet = 0
    let cleaned = 0
    const toDelete = []

    for (const [key, obj] of objectsDb.entries()) {
      const age = now - obj.lastSeenAt

      if (obj.warning) {
        if (age >= TTL_CLEAN_MS) {
          toDelete.push(key)
          cleaned++
        }
      } else if (age >= TTL_WARNING_MS) {
        obj.warning = true
        obj.warningSetAt = now
        warningSet++
      }
    }

    for (const key of toDelete) {
      objectsDb.delete(key)
    }

    if (cleaned > 0) {
      stats.totalCleaned += cleaned
      console.log(`[DB] Cleaned ${cleaned} objects (warning expired), ${warningSet} marked warning`)
    } else if (warningSet > 0) {
      console.log(`[DB] Marked ${warningSet} objects with warning`)
    }
  }, 60000)

  console.log('[DB] Cleanup started (check every 60s)')
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    console.log('[DB] Cleanup stopped')
  }
}

module.exports = {
  saveObject,
  saveObjects,
  findObjects,
  getStats,
  clearDb,
  getAllObjects,
  getObject,
  deleteObject,
  startCleanup,
  stopCleanup
}
