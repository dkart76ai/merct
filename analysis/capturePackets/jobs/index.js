const { Worker } = require('bullmq')
const { getRedis } = require('../lib/redis')

const {
  scanKingdomHandler,
  findObjectsHandler,
  discordNotificationHandler,
  gameNotificationHandler,
  scanRefreshPlayerInfoHandler
} = require('./handlers/index.js')
const { QUEUE_NAMES } = require('./constants.js')

let workerFindObjects = null
let workerNotificationDiscord = null
let workerNotificationGame = null
let workerScanKingdom = null
let workerScanKingdomRefreshPlayerInfo = null

//--------------------
function startWorker(queueName, handler, config = {}) {
  const worker = new Worker(queueName, handler, {
    connection: getRedis(),
    concurrency: config.concurrency || 1,
    limiter: config.limiter // Aquí pones el Rate Limit específico
  })

  worker.on('completed', (job, err) => {
    // console.log(` [Worker][${queueName}] Job ${job.id} completed successfully`)
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
      concurrency: 3
    })

    workerScanKingdomRefreshPlayerInfo = startWorker(
      QUEUE_NAMES.SCAN_REFRESH_PLAYER_INFO,
      scanRefreshPlayerInfoHandler,
      {
        concurrency: 1,
        limiter: {
          max: 10, // Máximo de trabajos
          duration: 60000 // Por cada 60,000 ms (1 minuto)
        }
      }
    )

    workerNotificationDiscord = startWorker(
      QUEUE_NAMES.NOTIFICATION_DISCORD,
      discordNotificationHandler,
      {
        concurrency: 1,
        limiter: {
          max: 25, // Máximo de trabajos
          duration: 60000 // Por cada 60,000 ms (1 minuto)
        }
      }
    )

    workerNotificationGame = startWorker(QUEUE_NAMES.NOTIFICATION_GAME, gameNotificationHandler, {
      concurrency: 1,
      limiter: { max: 15, duration: 60000 } // 15 messages per minute, 4secs per message
    })

    workerFindObjects = startWorker(QUEUE_NAMES.FIND_OBJECTS, findObjectsHandler, {
      concurrency: 1,
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
  if (workerScanKingdomRefreshPlayerInfo) {
    await workerScanKingdomRefreshPlayerInfo.close()
    workerScanKingdomRefreshPlayerInfo = null
    console.log('[Worker] workerScanKingdomRefreshPlayerInfo stoped')
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

module.exports = {
  initializeWorkers,
  stopWorkers
}
