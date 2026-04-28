const Redis = require('ioredis')

let redis = null

let connectionCount = 0
function getRedis() {
  connectionCount++
  console.log('Redis connected #', connectionCount, new Error().stack)

  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null
        return Math.min(times * 200, 2000)
      }
    })

    redis.on('error', err => {
      console.error('Redis connection error:', err.message)
    })

    redis.on('connect', () => {
      console.log('Redis connected')
    })
  }
  return redis
}

async function connectRedis() {
  const client = getRedis()
  await client.ping()
  console.log('Redis connected and verified')
  return client
}

module.exports = {
  getRedis,
  connectRedis
}
