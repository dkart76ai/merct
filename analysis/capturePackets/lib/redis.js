const Redis = require('ioredis')

let redis = null

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      // Minimal retry settings
      maxRetriesPerRequest: 20,
      retryStrategy(times) {
        if (times > 20) {
          console.log('[Redis] Max retries reached, giving up')
          return null
        }
        const delay = Math.min(times * 500, 5000)
        console.log(`[Redis] Retry ${times}, waiting ${delay}ms`)
        return delay
      },
      // Connection settings
      lazyConnect: true,
      enableReadyCheck: true,
      enableOfflineQueue: true
    })

    redis.on('error', err => {
      console.error('[Redis] Error:', err.message)
    })

    redis.on('connect', () => {
      console.log('[Redis] Connected')
    })

    redis.on('ready', () => {
      console.log('[Redis] Ready')
    })

    redis.on('close', () => {
      console.log('[Redis] Connection closed')
    })

    redis.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...')
    })

    // Try to connect
    redis.connect().catch(err => {
      console.error('[Redis] Connect error:', err.message)
    })
  }
  return redis
}

async function ping() {
  return getRedis().ping()
}

async function connectRedis() {
  const client = getRedis()
  await client.ping()
  console.log('[Redis] Verified')
  return client
}

function closeRedis() {
  if (redis) {
    redis.quit()
    redis = null
  }
}

module.exports = {
  getRedis,
  ping,
  connectRedis,
  closeRedis
}