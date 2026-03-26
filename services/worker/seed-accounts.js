import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRedisClient } from '../shared/redis-client.js'
import { REDIS_KEYS } from '../shared/constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const redis = getRedisClient()

try {
  const raw = await readFile(path.join(__dirname, '..', 'accounts.json'), 'utf-8')
  const accounts = JSON.parse(raw)
  await redis.del(REDIS_KEYS.ACCOUNTS_LIST)
  await redis.rpush(REDIS_KEYS.ACCOUNTS_LIST, ...accounts.map(a => JSON.stringify(a)))
  console.log(`✅ Seeded ${accounts.length} accounts into Redis`)
  accounts.forEach(a => console.log(`   - ${a.user} (${a.session})`))
} catch (error) {
  console.error('❌ Failed to seed accounts:', error.message)
} finally {
  await redis.quit()
}
