const { Queue, Worker } = require('bullmq')

const { getRedis } = require('../lib/redis')
const {
  scanKingdomHandler,
  findObjectsHandler,
  discordNotificationHandler,
  gameNotificationHandler
} = require('./handlers/index.js')

const JOB_TYPES = (QUEUE_NAMES = {
  FIND_OBJECTS: 'find-objects',
  NOTIFICATION_DISCORD: 'notification-discord',
  NOTIFICATION_GAME: 'notification-in-game',
  SCAN_KINGDOM: 'scan-kingdom'
})

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  IDLE: 5
}

const queues = {}
let workerFindObjects = null
let workerNotificationDiscord = null
let workerNotificationGame = null
let workerScanKingdom = null
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
    jobOptions.priority = options.priority
  }

  if (options.jobId) {
    jobOptions.jobId = options.jobId
  }

  if (options.delay) {
    jobOptions.delay = options.delay
  }

  if (options.repeat) {
    jobOptions.repeat = options.repeat
  }

  console.log(
    `[Queue] Added job ${job.id} (${type}) with priority ${options.priority || PRIORITY.NORMAL}`
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

//--------------------
function startWorker(queueName, handler, config = {}) {
  const worker = new Worker(queueName, handler, {
    connection: getRedis(),
    concurrency: config.concurrency || 1,
    limiter: config.limiter // Aquí pones el Rate Limit específico
  })

  worker.on('completed', (job, err) => {
    console.log(` [Worker][${queueName}] Job ${job.id} completed successfully`)
  })
  worker.on('failed', (job, err) => {
    console.log(` [Worker][${queueName}] Job ${job.id} failed: ${err.message}`)
  })
  worker.on('error', (job, err) => {
    console.log(` [Worker][${queueName}] Error: ${err.message}`)
  })

  console.log('[Worker] Started')
  return worker
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

function initializeWorkers() {
  try {
    // Worker dedicado solo a escanear (Sin limitadores si tu DB lo aguanta)
    workerScanKingdom = startWorker(QUEUE_NAMES.SCAN_KINGDOM, scanKingdomHandler, {
      concurrency: 5
    })

    // Worker de Discord: Lento (Ej: 5 mensajes cada 2 segundos)
    workerNotificationDiscord = startWorker(
      QUEUE_NAMES.NOTIFICATION_DISCORD,
      discordNotificationHandler,
      {
        concurrency: 2,
        limiter: { max: 5, duration: 2000 }
      }
    )

    // Worker   Rápido (Ej: 30 mensajes por segundo)
    workerNotificationGame = startWorker(QUEUE_NAMES.NOTIFICATION_GAME, gameNotificationHandler, {
      concurrency: 10,
      limiter: { max: 30, duration: 1000 }
    })

    workerFindObjects = startWorker(QUEUE_NAMES.FIND_OBJECTS, findObjectsHandler, {
      concurrency: 10,
      limiter: { max: 30, duration: 1000 }
    })
  } catch (error) {
    console.error('❌ Error crítico al iniciar:', error)
    // process.exit(1);
  }
}

async function stopWorkers() {
  if (workerScanKingdom) {
    await workerScanKingdom.close()
    workerScanKingdom = null
    console.log('[Worker] workerScanKingdom stoped')
  }
  if (workerNotificationDiscord) {
    await workerNotificationDiscord.close()
    workerNotificationDiscord = null
    console.log('[Worker] workerNotificationDiscord stoped')
  }
  if (workerNotificationGame) {
    await workerNotificationGame.close()
    workerNotificationGame = null
    console.log('[Worker] workerNotificationGame stoped')
  }
  if (workerFindObjects) {
    await workerFindObjects.close()
    workerFindObjects = null
    console.log('[Worker] workerFindObjects stoped')
  }
}

async function cleanOldJobs() {
  const Q1 = getQueue(QUEUE_NAME.SCAN_KINGDOM)
  // Clean ALL completed jobs (max 10000, age 0 = all)
  await Q1.clean(0, 10000, 'completed')
  await Q1.clean(0, 5000, 'failed')
  console.log('[Queue] ScanKingdom Cleaned all completed and failed jobs')

  const Q2 = getQueue(QUEUE_NAME.FIND_OBJECTS)
  await Q2.clean(0, 10000, 'completed')
  await Q2.clean(0, 5000, 'failed')
  console.log('[Queue] FindObjects Cleaned all completed and failed jobs')

  const Q3 = getQueue(QUEUE_NAME.NOTIFICATION_DISCORD)
  await Q3.clean(0, 10000, 'completed')
  await Q3.clean(0, 5000, 'failed')
  console.log('[Queue] NotificationDiscord Cleaned all completed and failed jobs')

  const Q4 = getQueue(QUEUE_NAME.NOTIFICATION_GAME)
  await Q4.clean(0, 10000, 'completed')
  await Q4.clean(0, 5000, 'failed')
  console.log('[Queue] NofiticationGame Cleaned all completed and failed jobs')
}

async function closeQueue() {
  const Q1 = getQueue(QUEUE_NAME.SCAN_KINGDOM)
  const Q2 = getQueue(QUEUE_NAME.FIND_OBJECTS)
  const Q3 = getQueue(QUEUE_NAME.NOTIFICATION_DISCORD)
  const Q4 = getQueue(QUEUE_NAME.NOTIFICATION_GAME)

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
//------
// const scanKingdomHandler = async job => {
//   const result = await doScanLogic(job.data)

//   if (result.foundSomething) {
//     // Enviar a la cola de Discord (con su propio rate limit)
//     await addJob(QUEUE_NAMES.DISCORD, 'send-alert', { text: '...' })

//     // Enviar a la cola de Telegram (con su propio rate limit)
//     await addJob(QUEUE_NAMES.TELEGRAM, 'send-alert', { text: '...' })
//   }
// }

// await getQueue('discord-queue').add('notif', { ... });
// await getQueue('telegram-queue').add('notif', { ... });

module.exports = {
  QUEUE_NAMES,
  JOB_TYPES,
  PRIORITY,
  initializeWorkers,
  stopWorkers,
  cleanOldJobs,
  closeQueue,
  getQueueStatus,
  addScanKingdomJob,
  addCriticalScanJob,
  addDiscordNotificationJob,
  addFindObjectsJob,
  addGameNotificationJob,
  getTimerManager: getTimerManagerInstance
}
