import Redis from 'ioredis'

let redisClient = null

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    })

    redisClient.on('connect', () => {
      console.log('✅ Redis connected')
    })

    redisClient.on('error', err => {
      console.error('❌ Redis error:', err)
    })
  }

  return redisClient
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
