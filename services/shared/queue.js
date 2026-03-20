import { Queue } from 'bullmq'
import { getRedisClient } from './redis-client.js'

let coordinatesQueue = null
let connection = null

export function getCoordinatesQueue() {
  if (!coordinatesQueue) {
    connection = getRedisClient()
    coordinatesQueue = new Queue('coordinates', { connection })
  }
  return coordinatesQueue
}

export async function closeQueue() {
  if (coordinatesQueue) {
    await coordinatesQueue.close()
    coordinatesQueue = null
  }
}
