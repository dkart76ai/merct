export const QUEUE_NAMES = {
  COORDINATES: 'coordinates',
  MERCENARIES: 'mercenaries'
}

export const REDIS_KEYS = {
  MERCENARIES_LIST: 'mercenaries:found',
  COORDINATES_LIST: 'scan:coordinates',
  SCAN_PAUSED: 'scan:paused',
  ACCOUNTS_LIST: 'accounts:available',
  WORKERS_REGISTRY: 'workers:registry'
}

export const KINGDOMS = [
  145, 157, 141, 148, 154, 151, 150, 147, 139, 155, 152, 142, 144, 138, 156, 153, 143, 149
]

export function generateCoordinates() {
  const coordinates = []
  for (const k of KINGDOMS) {
    for (let x = 10; x < 990; x += 22) {
      for (let y = 10; y < 990; y += 30) {
        coordinates.push({ k, x, y })
      }
    }
  }
  return coordinates
}
