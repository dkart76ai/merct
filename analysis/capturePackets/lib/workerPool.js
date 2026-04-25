const path = require('path')

const {
  processPacket: processPacketSync,
  scanKingdom: scanKingdomSync
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

async function processPacket({ request, response, shouldSaveObjects = false }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    processPacketSync({ request, response, shouldSaveObjects })
    return { success: false, error: 'Workers disabled' }
  }

  try {
    const result = await p.run({ request, response, shouldSaveObjects }, { name: 'processPacket' })
    if (!result.success) throw new Error(result.error)
    return result
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function scanKingdom({ kingdom, shouldSaveObjects = false }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    scanKingdomSync({ kingdom, shouldSaveObjects })
    return { success: false, error: 'Workers disabled' }
  }

  try {
    const result = await p.run({ kingdom, shouldSaveObjects }, { name: 'scanKingdom' })
    if (!result.success) throw new Error(result.error)
    return result
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  getPool,

  scanKingdom,
  processPacket
}
