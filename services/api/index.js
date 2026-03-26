import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRedisClient } from '../shared/redis-client.js'
import { REDIS_KEYS, generateCoordinates } from '../shared/constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const redis = getRedisClient()

async function getWorkers() {
  const registry = await redis.hgetall(REDIS_KEYS.WORKERS_REGISTRY)
  if (!registry) return []
  return Object.entries(registry).map(([id, val]) => ({ id, url: JSON.parse(val).url }))
}

app.get('/api/workers', async (req, res) => {
  const workers = await getWorkers()
  const statuses = await Promise.all(workers.map(async ({ id, url }) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      const data = await r.json()
      return { id, url, online: true, browserReady: data.browserReady, code: data.code ?? null }
    } catch {
      return { id, url, online: false, browserReady: false, code: null }
    }
  }))
  res.json({ success: true, workers: statuses })
})

app.post('/api/workers/code/:workerId', async (req, res) => {
  const workers = await getWorkers()
  const worker = workers.find(w => w.id === req.params.workerId)
  if (!worker) return res.status(404).json({ success: false, error: 'Worker not found' })
  try {
    const r = await fetch(`${worker.url}/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: req.body.code }),
      signal: AbortSignal.timeout(5000)
    })
    const data = await r.json()
    res.json(data)
  } catch (error) {
    res.status(503).json({ success: false, error: error.message })
  }
})

app.post('/api/workers/wake/:workerId', async (req, res) => {
  const workers = await getWorkers()
  const worker = workers.find(w => w.id === req.params.workerId)
  if (!worker) return res.status(404).json({ success: false, error: 'Worker not found' })
  try {
    const r = await fetch(worker.url, { signal: AbortSignal.timeout(10000) })
    const data = await r.json()
    res.json({ success: true, worker: req.params.workerId, ...data })
  } catch (error) {
    res.status(503).json({ success: false, error: 'Worker unreachable', detail: error.message })
  }
})

app.get('/api/workers/:workerId/screenshot', async (req, res) => {
  const workers = await getWorkers()
  const worker = workers.find(w => w.id === req.params.workerId)
  if (!worker) return res.status(404).json({ success: false, error: 'Worker not found' })
  try {
    const r = await fetch(`${worker.url}/screenshot`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return res.status(404).json({ success: false, error: 'No screenshot available' })
    res.setHeader('Content-Type', 'image/jpeg')
    const buf = Buffer.from(await r.arrayBuffer())
    res.end(buf)
  } catch (error) {
    res.status(503).json({ success: false, error: error.message })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/mercenaries', async (req, res) => {
  try {
    const mercenaries = await redis.lrange(REDIS_KEYS.MERCENARIES_LIST, 0, -1)
    const parsed = mercenaries.map(m => JSON.parse(m))
    res.json({ success: true, count: parsed.length, data: parsed })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/scan/stats', async (req, res) => {
  try {
    const total = await redis.llen(REDIS_KEYS.COORDINATES_LIST)
    const paused = await redis.exists(REDIS_KEYS.SCAN_PAUSED)
    res.json({ success: true, stats: { total, paused: paused === 1 } })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/scan/init', async (req, res) => {
  try {
    const coordinates = generateCoordinates()
    await redis.del(REDIS_KEYS.COORDINATES_LIST)
    const serialized = coordinates.map(c => JSON.stringify(c))
    await redis.rpush(REDIS_KEYS.COORDINATES_LIST, ...serialized)
    await redis.del(REDIS_KEYS.SCAN_PAUSED)
    res.json({ success: true, message: `Initialized with ${coordinates.length} coordinates`, count: coordinates.length })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/scan/pause', async (req, res) => {
  try {
    await redis.set(REDIS_KEYS.SCAN_PAUSED, '1')
    res.json({ success: true, message: 'Scan paused' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/scan/resume', async (req, res) => {
  try {
    await redis.del(REDIS_KEYS.SCAN_PAUSED)
    res.json({ success: true, message: 'Scan resumed' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/scan/stop', async (req, res) => {
  try {
    await redis.del(REDIS_KEYS.COORDINATES_LIST)
    await redis.del(REDIS_KEYS.SCAN_PAUSED)
    res.json({ success: true, message: 'Scan stopped and coordinates cleared' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/mercenaries/clear', async (req, res) => {
  try {
    await redis.del(REDIS_KEYS.MERCENARIES_LIST)
    res.json({ success: true, message: 'Mercenaries list cleared' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`)
})

process.on('SIGTERM', async () => {
  await redis.quit()
  process.exit(0)
})
