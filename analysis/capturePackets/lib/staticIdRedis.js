const Redis = require('ioredis')
const fs = require('fs')
const path = require('path')
const { getRedis } = require('./redis')

const PREFIX = 'staticid:'
const INDEX_KEY = 'staticid:index'
const DB_FILE = path.join(__dirname, '..', 'staticId-db.json')

// let redis = null

// function getRedis() {
//   if (!redis) {
//     redis = new Redis({
//       host: process.env.REDIS_HOST || 'localhost',
//       port: parseInt(process.env.REDIS_PORT || '6379'),
//       maxRetriesPerRequest: null
//     })
//     redis.on('error', err => {
//       console.error('[StaticIdRedis] Redis error:', err.message)
//     })
//   }
//   return redis
// }

async function init() {
  const r = getRedis()
  const count = await r.scard(INDEX_KEY)
  if (count === 0 && fs.existsSync(DB_FILE)) {
    console.log('[StaticIdRedis] Loading existing staticId-db.json into Redis...')
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
      const pipeline = r.pipeline()
      for (const [id, entry] of Object.entries(data)) {
        const cleanEntry = {}
        // if (entry.staticId !== undefined) cleanEntry.staticId = entry.staticId.toString()
        // if (entry.entryType !== undefined) cleanEntry.entryType = entry.entryType
        if (entry.name !== undefined) cleanEntry.name = entry.name
        if (entry.level !== undefined) cleanEntry.level = entry.level?.toString() || ''

        pipeline.hset(`${PREFIX}${id}`, cleanEntry)
        pipeline.sadd(INDEX_KEY, id)
      }
      await pipeline.exec()
      const newCount = await r.scard(INDEX_KEY)
      console.log(`[StaticIdRedis] Loaded ${newCount} entries into Redis`)
    } catch (e) {
      console.error('[StaticIdRedis] Failed to load JSON:', e.message)
    }
  } else if (count > 0) {
    console.log(`[StaticIdRedis] Redis already has ${count} entries, skipping JSON load`)
  }
}

async function getStaticIdData(staticId) {
  const r = getRedis()
  const data = await r.hgetall(`${PREFIX}${staticId}`)
  if (!data || Object.keys(data).length === 0) return null
  return {
    // staticId: parseInt(data.staticId || staticId),
    // entryType: data.entryType || null,
    name: data.name || null,
    level: data.level != null && data.level !== '' ? parseInt(data.level) : null
  }
}

async function addOrUpdateStaticId(staticId, data) {
  const r = getRedis()
  const key = `${PREFIX}${staticId}`
  const exists = await r.exists(key)

  const updates = {}
  // if (data.entryType !== undefined && data.entryType !== null) updates.entryType = data.entryType
  if (data.name !== undefined && data.name !== null) updates.name = data.name
  if (data.level !== undefined && data.level !== null) updates.level = data.level.toString()

  if (Object.keys(updates).length > 0) {
    if (exists) {
      const existing = await r.hgetall(key)
      for (const [field, value] of Object.entries(updates)) {
        if (existing[field] === undefined || existing[field] === '' || existing[field] === null) {
          await r.hset(key, field, value)
        }
      }
    } else {
      await r.hset(key, updates)
      await r.sadd(INDEX_KEY, staticId.toString())
      // const entryType = updates.entryType || data.entryType || 'unknown'
      console.log(`[StaticIdRedis] New staticId: ${staticId}`)
    }
  }
}

async function getStaticIdSize() {
  return await getRedis().scard(INDEX_KEY)
}

async function getStaticIdValues() {
  const r = getRedis()
  const ids = await r.smembers(INDEX_KEY)
  if (ids.length === 0) return []

  const pipeline = r.pipeline()
  for (const id of ids) {
    pipeline.hgetall(`${PREFIX}${id}`)
  }
  const results = await pipeline.exec()

  return results
    .map(([err, data], i) => {
      if (err || !data || Object.keys(data).length === 0) return null
      return {
        // staticId: parseInt(ids[i]),
        // entryType: data.entryType || null,
        name: data.name || null,
        level: data.level != null && data.level !== '' ? parseInt(data.level) : null
      }
    })
    .filter(Boolean)
}

async function dump() {
  const r = getRedis()
  console.log('[StaticIdRedis] Dumping to JSON...')

  const ids = await r.smembers(INDEX_KEY)
  if (ids.length === 0) {
    console.log('[StaticIdRedis] No entries to dump')
    return { count: 0 }
  }

  const data = {}
  const pipeline = r.pipeline()
  for (const id of ids) {
    pipeline.hgetall(`${PREFIX}${id}`)
  }
  const results = await pipeline.exec()

  let count = 0
  for (let i = 0; i < ids.length; i++) {
    const [err, fields] = results[i]
    if (err || !fields || Object.keys(fields).length === 0) continue

    data[ids[i]] = {
      // staticId: parseInt(ids[i]),
      // entryType: fields.entryType || null,
      name: fields.name || null,
      level: fields.level != null && fields.level !== '' ? parseInt(fields.level) : null
    }
    count++
  }

  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(data, (k, v) => (v === null ? null : v), 2)
    )
    console.log(`[StaticIdRedis] Dumped ${count} entries to staticId-db.json`)
  } catch (e) {
    console.error('[StaticIdRedis] Failed to dump:', e.message)
  }

  return { count }
}

async function close() {
  // if (redis) {
  await dump()
  // await redis.quit()
  // redis = null
  // }
}

module.exports = {
  getRedis,
  init,
  getStaticIdData,
  addOrUpdateStaticId,
  getStaticIdSize,
  getStaticIdValues,
  dump,
  close
}
