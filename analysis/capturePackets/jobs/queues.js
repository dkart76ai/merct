const { Queue } = require('bullmq')

const { getRedis } = require('../lib/redis')
const { QUEUE_NAMES, JOB_TYPES, PRIORITY } = require('./constants.js')
const queues = {}
let timerManager = null

function getQueue(name) {
  if (queues[name]) return queues[name]

  queues[name] = new Queue(name, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 50 }, // Mantén un pequeño historial
      removeOnFail: { count: 100 }
    }
  })
  console.log(`[QueueManager] Cola "${name}" inicializada.`)
  return queues[name]
}

// Función genérica para añadir trabajos a CUALQUIER cola
async function addJob(queueName, jobName, data, opts = {}) {
  const q = getQueue(queueName)

  const jobOptions = {}

  if (options.priority !== undefined) {
    jobOptions.priority = opts.priority
  }

  if (options.jobId) {
    jobOptions.jobId = opts.jobId
  }

  if (options.delay) {
    jobOptions.delay = opts.delay
  }

  if (options.repeat) {
    jobOptions.repeat = opts.repeat
  }

  console.log(
    `[Queue] Added job ${job.id} (${type}) with priority ${opts.priority || PRIORITY.NORMAL}`
  )

  return await q.add(jobName, data, jobOptions)
}

//  await addJob(QUEUE_NAMES.DISCORD, 'send-alert', { text: '...' });

async function addScanKingdomJob(data, opts = {}) {
  await addJob(QUEUE_NAMES.SCAN_KINGDOM, JOB_TYPES.SCAN_KINGDOM, data, opts)
}
async function addCriticalScanJob(data) {
  return addScanKingdomJob(data, { priority: PRIORITY.CRITICAL })
}

async function addDiscordNotificationJob(data, opts = {}) {
  await addJob(QUEUE_NAMES.NOTIFICATION_DISCORD, JOB_TYPES.NOTIFICATION_DISCORD, data, opts)
}

async function addFindObjectsJob(data, opts = {}) {
  await addJob(QUEUE_NAMES.FIND_OBJECTS, JOB_TYPES.FIND_OBJECTS, data, opts)
}

async function addGameNotificationJob(data, opts = {}) {
  await addJob(QUEUE_NAMES.NOTIFICATION_GAME, JOB_TYPES.NOTIFICATION_GAME, data, opts)
}

async function cleanOldJobs() {
  const Q1 = getQueue(QUEUE_NAMES.SCAN_KINGDOM)
  // Clean ALL completed jobs (max 10000, age 0 = all)
  await Q1.clean(0, 10000, 'completed')
  await Q1.clean(0, 5000, 'failed')
  console.log('[Queue] ScanKingdom Cleaned all completed and failed jobs')

  const Q2 = getQueue(QUEUE_NAMES.FIND_OBJECTS)
  await Q2.clean(0, 10000, 'completed')
  await Q2.clean(0, 5000, 'failed')
  console.log('[Queue] FindObjects Cleaned all completed and failed jobs')

  const Q3 = getQueue(QUEUE_NAMES.NOTIFICATION_DISCORD)
  await Q3.clean(0, 10000, 'completed')
  await Q3.clean(0, 5000, 'failed')
  console.log('[Queue] NotificationDiscord Cleaned all completed and failed jobs')

  const Q4 = getQueue(QUEUE_NAMES.NOTIFICATION_GAME)
  await Q4.clean(0, 10000, 'completed')
  await Q4.clean(0, 5000, 'failed')
  console.log('[Queue] NofiticationGame Cleaned all completed and failed jobs')
}

async function closeQueue() {
  const Q1 = getQueue(QUEUE_NAMES.SCAN_KINGDOM)
  const Q2 = getQueue(QUEUE_NAMES.FIND_OBJECTS)
  const Q3 = getQueue(QUEUE_NAMES.NOTIFICATION_DISCORD)
  const Q4 = getQueue(QUEUE_NAMES.NOTIFICATION_GAME)

  await Q1.close()
  await Q2.close()
  await Q3.close()
  await Q4.close()
  console.log('[Queue] All queues Closed')
}

async function getQueueStatus() {
  // Obtenemos los nombres de las colas que definimos antes
  const statusPromises = Object.values(QUEUE_NAMES).map(async queueName => {
    const q = getQueue(queueName)

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
      q.getDelayedCount()
    ])

    return {
      queue: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed
    }
  })

  return await Promise.all(statusPromises)
}

async function getTimerManagerInstance() {
  const { TimerManager } = require('./TimerManager')

  if (!timerManager) {
    const queueInstance = getQueue(QUEUE_NAMES.SCAN_KINGDOM)
    timerManager = new TimerManager(queueInstance)

    // Es vital esperar a que se rehidrate antes de empezar a programar nuevos
    await timerManager.rehydrate()
  }

  return timerManager
}

module.exports = {
  addScanKingdomJob,
  addCriticalScanJob,
  addDiscordNotificationJob,
  addFindObjectsJob,
  addGameNotificationJob,
  cleanOldJobs,
  closeQueue,
  getQueueStatus,
  getQueue,
  getTimerManager: getTimerManagerInstance
}
