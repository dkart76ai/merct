const path = require('path')

const {
  decode: decodeSync,
  decodeBuffer: decodeBufferSync,
  encode: encodeSync,
  processPacket: processPacketSync
} = require('../workers/tasks')

// Toggle for fallback
const USE_WORKERS = process.env.USE_WORKERS !== 'false'
const WORKER_POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 8

let pool = null
let piscina = null

// Try to load piscina lazily
function loadPiscina() {
  if (piscina) return piscina
  try {
    piscina = require('piscina')
  } catch (e) {
    console.warn('[Worker Pool] Piscina not available:', e.message)
  }
  return piscina
}

function getPool() {
  if (!pool && USE_WORKERS) {
    const Piscina = loadPiscina()
    if (Piscina) {
      try {
        pool = new Piscina({
          filename: path.join(__dirname, '..', 'workers', 'tasks.js'),
          maxThreads: WORKER_POOL_SIZE,
          name: 'packet-worker',
          env: { ...process.env, FORCE_COLOR: '1' }
        })
        console.log(`[Worker Pool] Initialized with ${WORKER_POOL_SIZE} threads`)
      } catch (e) {
        console.warn('[Worker Pool] Failed:', e.message)
      }
    }
  }
  return pool
}

// Wrapper functions with fallback
async function decode(base64) {
  if (!base64) throw new Error('No base64 data provided, decode from workerpool.js')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    const result = decodeSync(base64)
    return result.results
  }
  try {
    const result = await p.run(base64, { name: 'decode' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    console.warn('[Worker Pool] Falling back to sync:', e.message)
    const result = decodeSync(base64)
    return result.results
  }
}

async function decodeBuffer(buffer) {
  if (!buffer) throw new Error('No buffer provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    return decodeBufferSync(buffer)
  }
  try {
    const result = await p.run(buffer, { name: 'decodeBuffer' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    return decodeBufferSync(buffer)
  }
}

async function encode(data) {
  if (!data) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    return encodeSync(data)
  }
  try {
    const result = await p.run(data, { name: 'encode' })
    if (!result.success) throw new Error(result.error)
    return result.data
  } catch (e) {
    return encodeSync(data)
  }
}

async function processPacket({ request, response }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    processPacketSync({ request, response })
    return { success: false, error: 'Workers disabled' }
  }

  try {
    const result = await p.run({ request, response }, { name: 'processPacket' })
    if (!result.success) throw new Error(result.error)
    return result
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  getPool,
  decode,
  decodeBuffer,
  encode,

  processPacket
}
