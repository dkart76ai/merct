const Database = require('better-sqlite3')
const path = require('path')
const { isMainThread } = require('worker_threads')
const DB_FILE = path.join(__dirname, 'objects.db')

let db = null

function initDb() {
  if (db) return db

  // 1. Añadimos timeout para que el worker espere si la DB está bloqueada
  db = new Database(DB_FILE, { timeout: 7000 })
  // 2. Activamos modo WAL (Write-Ahead Logging)
  // Esto permite que los hilos de lectura no bloqueen al hilo de escritura
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  // if (isMainThread) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      objectId TEXT,
      staticId INTEGER,
      name TEXT,
      level INTEGER,
      kingdom INTEGER,
      x INTEGER,
      y INTEGER,
      timestamp INTEGER,
      firstSeenAt INTEGER,
      lastSeenAt INTEGER,
      seenCount INTEGER DEFAULT 1,
      warning INTEGER DEFAULT 0,
      warningSetAt INTEGER,
      data TEXT
    )
  `)

  //playerid = unique
  //objectid = entityid updates on reloggin, temporary id
  //progressID tb:1234567
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      objectId TEXT ,
      playerId TEXT UNIQUE NOT NULL,
      playerName TEXT,
      country TEXT,
      progressId TEXT,
      clanId TEXT,
      clanName TEXT,
      cityLevel INTEGER,
      heroType INTEGER,
      heroLevel INTEGER,
      kingdom INTEGER,
      x INTEGER,
      y INTEGER,
      might INTEGER,
      gold INTEGER,
      timezone TEXT,
      timestamp INTEGER,
      hasShield BOOLEAN,
      previousCheckAt INTEGER,
      lastCheckAt INTEGER,
      flagCount INTEGER
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS userPosition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      x INTEGER,
      y INTEGER
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_playerId ON players(playerId)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_playerName ON players(playerName)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_clanName ON players(clanName)`)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_key ON userPosition(key)`)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_key ON objects(key)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_staticId ON objects(staticId)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_level ON objects(level)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lastSeenAt ON objects(lastSeenAt)`)

  console.log('[SQLite] Database initialized:', DB_FILE)
  // }

  return db
}

function getDb() {
  if (!db) initDb()
  return db
}

const TTL_WARNING_MS = 10 * 60 * 1000
const TTL_CLEAN_MS = 20 * 60 * 1000

// let stats = {
//   totalSaved: 0,
//   totalCleaned: 0,
//   lastSavedAt: null
// }
let cleanupInterval = null

function getKey(obj) {
  return `${obj.kingdom}:${obj.x}:${obj.y}`
}

function saveUserPosition({ userId, x, y }) {
  const now = Date.now()
  const database = getDb()

  const existing = database.prepare('SELECT * FROM userPosition WHERE key = ?').get(userId)

  if (existing) {
    database
      .prepare(
        `
      UPDATE userPosition SET
        x = ?,
        y = ?
      WHERE key = ?
    `
      )
      .run(x, y, userId)

    return { action: 'updated', userId }
  } else {
    database
      .prepare(
        `
      INSERT INTO userPosition (key, x, y)
      VALUES (?, ?, ?)
    `
      )
      .run(userId, x, y)

    console.log(`[DB] Saved new user position: ${userId}, x: ${x}, y: ${y}`)
    return { action: 'created', userId }
  }
}

function getUserPosition(userId) {
  const database = getDb()
  return database.prepare('SELECT * FROM userPosition WHERE key = ?').get(userId)
}

function deleteObject(key) {
  if (!key) return

  const database = getDb()

  // 1. Prepare the delete statement
  const deleteStmt = db.prepare('DELETE FROM objects WHERE key = ?')

  // 2. Execute with the specific key
  const result = deleteStmt.run(key)

  // Result contains changes (number of rows deleted)
  console.log(`Deleted ${result.changes} row(s).`)
  return result
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
      INSERT INTO objects (key, objectId, staticId, name,level, kingdom, x, y,timestamp, firstSeenAt, lastSeenAt, seenCount, warning, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `
      )
      .run(
        key,
        obj.objectId?.toString() || null,
        obj.staticId,
        obj.name,
        obj.level,
        obj.kingdom,
        obj.x,
        obj.y,
        obj.timestamp,
        now,
        now,
        JSON.stringify(obj)
      )

    // stats.totalSaved++
    // stats.lastSavedAt = now
    console.log(
      `[DB] Saved new object: ${key}, staticId: ${obj.staticId}, name: ${obj.name}, level: ${obj.level}`
    )
    return { action: 'created', key }
  }
}

function saveObjects(objects) {
  const results = {
    created: 0,
    updated: 0,
    objects: []
  }
  // console.log('[DB] Saving object, db:', DB_FILE)
  const database = getDb()
  const insert = database.prepare(`
    INSERT INTO objects (key, objectId, staticId, name, level, kingdom, x, y, timestamp, firstSeenAt, lastSeenAt, seenCount, warning, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
  `)

  const update = database.prepare(`
    UPDATE objects SET
      lastSeenAt = ?,
      seenCount = seenCount + 1,
      warning = 0,
      warningSetAt = NULL
    WHERE key = ?
  `)

  const check = database.prepare('SELECT id FROM objects WHERE key = ?')
  const now = Date.now()

  // 3. ENVOLVEMOS TODO EN UNA TRANSACCIÓN IMMEDIATE
  // Esto avisa a otros hilos: "Voy a escribir, esperen su turno"
  const transaction = database.transaction(objects => {
    for (const obj of objects) {
      const key = getKey(obj)
      const existing = check.get(key)

      if (existing) {
        update.run(now, key)
        results.updated++
      } else {
        insert.run(
          key,
          obj.objectId?.toString() || null,
          obj.staticId,
          obj.name,
          obj.level,
          obj.kingdom,
          obj.x,
          obj.y,
          obj.timestamp,
          now,
          now,
          JSON.stringify(obj)
        )
        results.created++
        // stats.totalSaved++
      }
      results.objects.push(key)
    }
  })

  // Ejecutamos con .immediate() para evitar deadlocks
  transaction.immediate(objects)

  // stats.lastSavedAt = Date.now()
  // console.log('[database] objects saved', objects.length)
  return results
}

function findObjects(query) {
  const { staticId, name, level, amount = 10, userId } = query

  const userPosition = getUserPosition(userId)
  // console.log('[findObjects] userPosition', userPosition)
  // userPosition { id: 1, key: '1182035430531670106', x: 500, y: 800 }

  // if user didnt set pos, fallback to my position
  let mix = 448
  let miy = 480

  if (userPosition !== undefined) {
    mix = userPosition.x
    miy = userPosition.y
  }

  const database = getDb()
  let sql = 'SELECT *, ((x - ?) * (x - ?) + (y - ?) * (y - ?)) AS distance FROM objects WHERE 1=1'
  const params = [mix, mix, miy, miy]

  if (staticId !== undefined) {
    sql += ' AND staticId = ?'
    params.push(staticId)
  }

  if (name !== undefined) {
    sql += ' AND LOWER(name) LIKE LOWER(?)'
    if (!name.includes('%')) {
      params.push(`${name}%`)
    } else {
      params.push(name)
    }
  }

  // if (name !== undefined) {
  //   const words = name.trim().split(/\s+/) // Separa por espacios
  //   words.forEach(word => {
  //     sql += ' AND name LIKE ? COLLATE NOCASE'
  //     params.push(`%${word}%`)
  //   })
  // }

  if (level !== undefined) {
    sql += ' AND level = ?'
    params.push(level)
  }

  sql += ' AND kingdom = ?'
  params.push(146)

  sql += ' ORDER BY distance ASC, lastSeenAt DESC LIMIT ?'
  params.push(amount)

  const rows = database.prepare(sql).all(...params)

  return {
    total: rows.length,
    returned: rows.length,
    objects: rows
  }
}

// function upsertPlayer(playerKey, data) {
//   const now = Date.now()

//   const columns = Object.keys(data)
//   if (columns.length === 0) return

//   const database = getDb()

//   const colNames = ['key', 'lastCheckAt', ...columns].join(', ')
//   // Usamos 'unixepoch()' para el primer insert
//   const placeholders = ['?', 'unixepoch()', ...columns.map(() => '?')].join(', ')

//   const updateFragment = columns.map(col => `${col} = excluded.${col}`).join(', ')

//   const sql = `
//     INSERT INTO players (${colNames})
//     VALUES (${placeholders})
//     ON CONFLICT(key) DO UPDATE SET
//       previousCheckAt = lastCheckAt,
//       lastCheckAt = unixepoch(), -- Genera el timestamp actual automáticamente
//       ${updateFragment}
//   `

//   const stmt = database.prepare(sql)

//   // Solo pasamos el playerKey y los valores de data
//   return stmt.run(playerKey, ...Object.values(data))
// }

function getUpsertStatement(player) {
  const database = getDb()

  const { playerId, ...data } = player
  const columns = Object.keys(data)

  const colNames = ['playerId', 'lastCheckAt', ...columns].join(', ')
  const placeholders = ['?', 'unixepoch()', ...columns.map(() => '?')].join(', ')
  const updateFragment = columns.map(col => `${col} = excluded.${col}`).join(', ')

  const sql = `
    INSERT INTO players (${colNames})
    VALUES (${placeholders})
    ON CONFLICT(playerId) DO UPDATE SET
      previousCheckAt = lastCheckAt,
      lastCheckAt = unixepoch(),
      ${updateFragment}
  `

  return {
    stmt: database.prepare(sql),
    values: [playerId, ...Object.values(data)]
  }
}

// Para usarla con un solo jugador:
function savePlayer(player) {
  const { stmt, values } = getUpsertStatement(player)
  return stmt.run(values)
}

// Uso: savePlayers(miArrayDePlayers);
const savePlayers = getDb().transaction(players => {
  if (players.length > 0) {
    // console.log('[Database] saveplayers', players[0])
    for (const player of players) {
      const { stmt, values } = getUpsertStatement(player)
      stmt.run(values)
    }
    return { success: true }
  }
  return { success: false }
})

function getPlayersIdFromKingdom(kingdom) {
  const database = getDb()
  return database.prepare('SELECT playerId FROM players where kingdom=?').all(kingdom)
}
function getPlayersObjectIdFromKingdom(kingdom) {
  const database = getDb()
  return database.prepare('SELECT playerId, objectId FROM players where kingdom=?').all(kingdom)
}

function savePlayerFlagCount(playerId, flagCount) {
  const database = getDb()

  const update = database.prepare(`
    UPDATE players SET
      flagCount = ?
    WHERE playerId = ?
  `)

  const result = update.run(flagCount, playerId)
  console.log('[database] update flagcount', result)
  return { success: true }
}

function getPlayers(
  nameFilter,
  clanFilter,
  kingdomFilter,
  shieldFilter,
  sortBy,
  sortOrder,
  limit,
  offset
) {
  const db = getDb()
  const whereClauses = []
  const params = []
  if (nameFilter) {
    whereClauses.push('LOWER(playerName) LIKE LOWER(?)')
    params.push('%%' + nameFilter + '%%')
  }
  if (clanFilter) {
    whereClauses.push('LOWER(clanName) LIKE LOWER(?)')
    params.push('%%' + clanFilter + '%%')
  }
  if (kingdomFilter) {
    whereClauses.push('kingdom = ?')
    params.push(kingdomFilter)
  }
  if (shieldFilter === 'true') {
    whereClauses.push('hasShield = 1')
  } else if (shieldFilter === 'false') {
    whereClauses.push('hasShield = 0')
  }
  const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''
  const countSql = 'SELECT COUNT(*) as total FROM players ' + whereSql
  const { total } = db.prepare(countSql).get(...params)
  const dataSql =
    'SELECT playerId, playerName, clanName, kingdom, might, gold, hasShield, x, y, cityLevel, heroLevel, heroType, country, timezone, flagCount FROM players ' +
    whereSql +
    ' ORDER BY ' +
    sortBy +
    ' ' +
    sortOrder +
    ' LIMIT ? OFFSET ?'
  const players = db.prepare(dataSql).all(...params, limit, offset)
  return { success: true, players, total }
}

function getStats() {
  const database = getDb()

  // Forzamos un checkpoint o lectura limpia
  database.pragma('optimize')

  const total = database.prepare('SELECT COUNT(*) as count FROM objects').get()
  const warning = database.prepare('SELECT COUNT(*) as count FROM objects WHERE warning = 1').get()
  // console.log('getStats obj total count:', total)

  return {
    uniqueObjects: total.count || 0,
    warningCount: warning.count || 0
  }
}

function clearDb() {
  const database = getDb()
  database.prepare('DELETE FROM objects').run()
  // stats = {
  //   totalSaved: 0,
  //   totalCleaned: 0,
  //   lastSavedAt: null
  // }
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
  // solo debe llamarse en el hilo principal (main.js)
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
      // stats.totalCleaned += toClean.c
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
  deleteObject,
  savePlayers,
  getPlayersIdFromKingdom,
  getPlayersObjectIdFromKingdom,
  getPlayers,
  savePlayerFlagCount,
  saveUserPosition,
  getStats,
  clearDb,
  getAllObjects,
  getObject,
  deleteObject,
  startCleanup,
  stopCleanup,
  closeDb
}
