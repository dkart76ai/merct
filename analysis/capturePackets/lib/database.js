const Database = require('better-sqlite3')
const path = require('path')

const DB_FILE = path.join(__dirname, 'objects.db')

let db = null

function initDb() {
  if (db) return db

  db = new Database(DB_FILE)

  db.exec(`
    CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      objectId TEXT,
      staticId INTEGER,
      level INTEGER,
      kingdom INTEGER,
      x INTEGER,
      y INTEGER,
      firstSeenAt INTEGER,
      lastSeenAt INTEGER,
      seenCount INTEGER DEFAULT 1,
      warning INTEGER DEFAULT 0,
      warningSetAt INTEGER,
      data TEXT
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_key ON objects(key)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_staticId ON objects(staticId)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_level ON objects(level)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lastSeenAt ON objects(lastSeenAt)`)

  console.log('[SQLite] Database initialized:', DB_FILE)
  return db
}

function getDb() {
  if (!db) initDb()
  return db
}

const TTL_WARNING_MS = 10 * 60 * 1000
const TTL_CLEAN_MS = 20 * 60 * 1000

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
  const now = Date.now()
  const database = getDb()

  const existing = database.prepare('SELECT * FROM objects WHERE key = ?').get(key)

  if (existing) {
    database
      .prepare(
        `
      UPDATE objects SET
        lastSeenAt = ?,
        seenCount = seenCount + 1,
        warning = 0,
        warningSetAt = NULL
      WHERE key = ?
    `
      )
      .run(now, key)

    return { action: 'updated', key }
  } else {
    database
      .prepare(
        `
      INSERT INTO objects (key, objectId, staticId, level, kingdom, x, y, firstSeenAt, lastSeenAt, seenCount, warning, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `
      )
      .run(
        key,
        obj.objectId?.toString() || null,
        obj.staticId,
        obj.level,
        obj.kingdom,
        obj.x,
        obj.y,
        now,
        now,
        JSON.stringify(obj)
      )

    stats.totalSaved++
    stats.lastSavedAt = now
    console.log(`[DB] Saved new object: ${key}, staticId: ${obj.staticId}, level: ${obj.level}`)
    return { action: 'created', key }
  }
}

function saveObjects(objects) {
  const results = {
    created: 0,
    updated: 0,
    objects: []
  }

  const database = getDb()
  const insert = database.prepare(`
    INSERT INTO objects (key, objectId, staticId, level, kingdom, x, y, firstSeenAt, lastSeenAt, seenCount, warning, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
  `)

  const update = database.prepare(`
    UPDATE objects SET
      lastSeenAt = ?,
      seenCount = seenCount + 1,
      warning = 0,
      warningSetAt = NULL
    WHERE key = ?
  `)

  const now = Date.now()

  for (const obj of objects) {
    const key = getKey(obj)
    const existing = database.prepare('SELECT id FROM objects WHERE key = ?').get(key)

    if (existing) {
      update.run(now, key)
      results.updated++
    } else {
      insert.run(
        key,
        obj.objectId?.toString() || null,
        obj.staticId,
        obj.level,
        obj.kingdom,
        obj.x,
        obj.y,
        now,
        now,
        JSON.stringify(obj)
      )
      results.created++
      stats.totalSaved++
    }
    results.objects.push(key)
  }

  stats.lastSavedAt = Date.now()
  return results
}

function findObjects(query) {
  const { staticId, level, amount = 10, withWarning = false } = query

  const database = getDb()
  let sql = 'SELECT * FROM objects WHERE 1=1'
  const params = []

  if (staticId !== undefined) {
    sql += ' AND staticId = ?'
    params.push(staticId)
  }

  if (level !== undefined) {
    sql += ' AND level = ?'
    params.push(level)
  }

  if (withWarning !== undefined) {
    sql += ' AND warning = ?'
    params.push(withWarning ? 1 : 0)
  }

  sql += ' ORDER BY lastSeenAt DESC LIMIT ?'
  params.push(amount)

  const rows = database.prepare(sql).all(...params)

  return {
    total: rows.length,
    returned: rows.length,
    objects: rows
  }
}

function getStats() {
  const database = getDb()
  const total = database.prepare('SELECT COUNT(*) as count FROM objects').get()
  const warning = database.prepare('SELECT COUNT(*) as count FROM objects WHERE warning = 1').get()

  return {
    ...stats,
    uniqueObjects: total.count,
    warningCount: warning.count
  }
}

function clearDb() {
  const database = getDb()
  database.prepare('DELETE FROM objects').run()
  stats = {
    totalSaved: 0,
    totalCleaned: 0,
    lastSavedAt: null
  }
  console.log('[DB] Database cleared')
}

function getAllObjects() {
  const database = getDb()
  return database.prepare('SELECT * FROM objects ORDER BY lastSeenAt DESC').all()
}

function getObject(key) {
  const database = getDb()
  return database.prepare('SELECT * FROM objects WHERE key = ?').get(key)
}

function deleteObject(key) {
  const database = getDb()
  const result = database.prepare('DELETE FROM objects WHERE key = ?').run(key)
  return result.changes > 0
}

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const database = getDb()
    const now = Date.now()

    // Get count before update
    const warnBefore = database
      .prepare('SELECT COUNT(*) as c FROM objects WHERE warning = 0 AND lastSeenAt < ?')
      .get(now - TTL_WARNING_MS)

    // Mark old objects as warning
    database
      .prepare(
        `
      UPDATE objects SET warning = 1, warningSetAt = ?
      WHERE warning = 0 AND lastSeenAt < ?
    `
      )
      .run(now, now - TTL_WARNING_MS)

    // Get count after update (now marked as warning)
    const warnAfter = database.prepare('SELECT COUNT(*) as c FROM objects WHERE warning = 1').get()
    const warningSet = warnAfter.c - (warnBefore.c > warnAfter.c ? 0 : warnBefore.c)

    // Count to clean
    const toClean = database
      .prepare('SELECT COUNT(*) as c FROM objects WHERE warning = 1 AND lastSeenAt < ?')
      .get(now - TTL_CLEAN_MS)

    // Clean old warning objects
    database
      .prepare('DELETE FROM objects WHERE warning = 1 AND lastSeenAt < ?')
      .run(now - TTL_CLEAN_MS)

    if (toClean.c > 0) {
      stats.totalCleaned += toClean.c
      console.log(`[DB] Cleaned ${toClean.c} objects, ${warningSet} marked warning`)
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

function closeDb() {
  if (db) {
    db.close()
    db = null
    console.log('[DB] Database closed')
  }
}

module.exports = {
  initDb,
  getDb,
  saveObject,
  saveObjects,
  findObjects,
  getStats,
  clearDb,
  getAllObjects,
  getObject,
  deleteObject,
  startCleanup,
  stopCleanup,
  closeDb
}
