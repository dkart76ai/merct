const QUEUE_NAMES = {
  FIND_OBJECTS: 'find-objects',
  NOTIFICATION_DISCORD: 'notification-discord',
  NOTIFICATION_GAME: 'notification-in-game',
  SCAN_KINGDOM: 'scan-kingdom'
}

const JOB_TYPES = QUEUE_NAMES

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  IDLE: 5
}

module.exports = {
  QUEUE_NAMES,
  JOB_TYPES,
  PRIORITY
}
