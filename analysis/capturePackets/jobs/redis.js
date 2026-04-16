const Redis = require('ioredis')

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let redis = null
let subscriber = null

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    })
    
    redis.on('error', (err) => {
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
  await client.connect().catch(() => {
    console.log('Redis already connected or connection failed')
  })
  return client
}

function getSubscriber() {
  if (!subscriber) {
    subscriber = getRedis().duplicate()
    subscriber.on('error', (err) => {
      console.error('Redis subscriber error:', err.message)
    })
  }
  return subscriber
}

module.exports = {
  getRedis,
  connectRedis,
  getSubscriber,
  REDIS_URL
}
