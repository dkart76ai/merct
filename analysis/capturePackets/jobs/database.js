const objectsDb = new Map()

let stats = {
  totalSaved: 0,
  lastSavedAt: null
}

function saveObject(obj) {
  const key = `${obj.kingdom}-${obj.x}-${obj.x}`
  const existing = objectsDb.get(key)

  if (existing) {
    // Update existing, keep earliest data
    const merged = {
      ...obj,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: Date.now(),
      seenCount: (existing.seenCount || 1) + 1
    }
    objectsDb.set(key, merged)
    return { action: 'updated', key }
  } else {
    // New object
    const newObj = {
      ...obj,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      seenCount: 1
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
  const { staticId, level, amount = 10 } = query

  let results = []

  for (const obj of objectsDb.values()) {
    // Match staticId (required)
    if (staticId !== undefined && obj.staticId !== staticId) {
      continue
    }

    // Match level if specified
    if (level !== undefined && obj.level !== level) {
      continue
    }

    results.push(obj)
  }

  // Sort by lastSeenAt (most recent first)
  results.sort((a, b) => b.lastSeenAt - a.lastSeenAt)

  // Limit amount
  const limited = results.slice(0, amount)

  return {
    total: results.length,
    returned: limited.length,
    objects: limited
  }
}

function getStats() {
  return {
    ...stats,
    uniqueObjects: objectsDb.size
  }
}

function clearDb() {
  objectsDb.clear()
  stats = {
    totalSaved: 0,
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

module.exports = {
  saveObject,
  saveObjects,
  findObjects,
  getStats,
  clearDb,
  getAllObjects,
  getObject,
  deleteObject
}
