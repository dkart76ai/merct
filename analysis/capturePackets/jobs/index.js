const { Worker } = require('bullmq')
const { getRedis } = require('../lib/redis')

const {
  scanKingdomHandler,
  findObjectsHandler,
  discordNotificationHandler,
  gameNotificationHandler
} = require('./handlers/index.js')
const { QUEUE_NAMES } = require('./constants.js')

const {
  addScanKingdomJob,
  addCriticalScanJob,
  addDiscordNotificationJob,
  addFindObjectsJob,
  addGameNotificationJob,
  getQueue
} = require('./queues.js')

let workerFindObjects = null
let workerNotificationDiscord = null
let workerNotificationGame = null
let workerScanKingdom = null

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

function initializeWorkers() {
  try {
    // Worker dedicado solo a escanear (Sin limitadores si tu DB lo aguanta)
    workerScanKingdom = startWorker(QUEUE_NAMES.SCAN_KINGDOM, scanKingdomHandler, {
      concurrency: 5
    })

    workerNotificationDiscord = startWorker(
      QUEUE_NAMES.NOTIFICATION_DISCORD,
      discordNotificationHandler,
      {
        concurrency: 2,
        limiter: {
          max: 25, // Máximo de trabajos
          duration: 60000 // Por cada 60,000 ms (1 minuto)
        }
      }
    )

    workerNotificationGame = startWorker(QUEUE_NAMES.NOTIFICATION_GAME, gameNotificationHandler, {
      concurrency: 2,
      limiter: { max: 20, duration: 60000 } // 20 messages per minute, 3secs per message
    })

    workerFindObjects = startWorker(QUEUE_NAMES.FIND_OBJECTS, findObjectsHandler, {
      concurrency: 10,
      limiter: { max: 10, duration: 1000 }
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
  initializeWorkers,
  stopWorkers,

  addScanKingdomJob,
  addCriticalScanJob,
  addDiscordNotificationJob,
  addFindObjectsJob,
  addGameNotificationJob
}
