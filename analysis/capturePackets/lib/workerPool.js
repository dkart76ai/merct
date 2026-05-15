const path = require('path')

const {
  processPacket: processPacketSync,
  scanRefreshPlayerInfoTask,
  scanKingdomTask
} = require('../workers/tasks')
const { addDiscordNotificationJob, addGameNotificationJob } = require('../jobs/queues')
const chatChannels = require('../lib/chatChannels.js')
const staticIdRedis = require('../lib/staticIdRedis')
// Toggle for fallback
const USE_WORKERS = process.env.USE_WORKERS !== 'false'
const WORKER_POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 8

let pool = null
let piscina = null

// let messageBuffer = []
// const BATCH_DELAY = 5000 // Enviar cada 5 segundos
// let countDiscord = 0
// Función para procesar el buffer y crear UN solo Job
// const flushBuffer = async () => {
//   if (messageBuffer.length === 0) return

//   const currentBatch = [...messageBuffer]
//   messageBuffer = []

//   // Agrupamos las coordenadas en un solo texto para el mensaje de Discord

//   const linesPromises = currentBatch.map(async m => {
//     const dbEntry = await staticIdRedis.getStaticIdData(m.staticId)
//     countDiscord++
//     return `K:${m.coords.k} X:${m.coords.x} Y:${m.coords.y} (${dbEntry?.name || 'Desconocido'})`
//   })

//   // 2. Esperamos a que TODAS se resuelvan
//   const lines = await Promise.all(linesPromises)

//   // 3. Ahora sí podemos unir las strings
//   let batchContent = lines.join('\n')

//   // countDiscord += currentBatch.length
//   batchContent += `\ntotal coords ${countDiscord}\n`

//   // Añadimos UN solo job que contiene muchas líneas
//   await addDiscordNotificationJob({
//     content: batchContent, // Asegúrate de que tu worker de Discord use este campo
//     isBatch: true,
//     count: currentBatch.length
//   })

//   // Si necesitas que sigan siendo jobs individuales para lógica de juego:
//   // for (const msg of currentBatch) { await addGameNotificationJob(...) }
// }

// // Ejecutar el flush cada X segundos
// setInterval(flushBuffer, BATCH_DELAY)

// Try to load piscina lazily
function loadPiscina() {
  if (piscina) return piscina
  try {
    piscina = require('piscina')
  } catch (e) {
    console.warn('[Worker Pool] Piscina not available:', e.message)
  }
  return piscina
}

function getPool() {
  if (!pool && USE_WORKERS) {
    const Piscina = loadPiscina()
    if (Piscina) {
      try {
        pool = new Piscina({
          filename: path.join(__dirname, '..', 'workers', 'tasks.js'),
          maxThreads: WORKER_POOL_SIZE, // O el número de núcleos que tengas
          maxQueue: 100, // Asegúrate de que sea mayor a 50 para que no rechace tareas
          name: 'packet-worker',
          env: {
            ...process.env,
            FORCE_COLOR: '1',
            REDIS_HOST: process.env.REDIS_HOST || 'localhost',
            REDIS_PORT: process.env.REDIS_PORT || '6379'
          }
          // stdout: process.stdout,
          // stderr: process.stderr
        })

        pool.on('drain', () => {
          // console.log('✅ Todos los workers han terminado su trabajo.')
        })

        // let count = 0

        // pool.on('message', async msg => {
        //   const channels = await chatChannels.getChannels()
        //   if (!channels || channels.length === 0) return

        //   count++
        //   // console.log('Mensaje recibido del worker:', msg)
        //   // Aquí verás: { coords: { k: o.k , x: o.x, y: o.y }, staticId: o.staticId }
        //   if (msg.cmd === 'merc' || msg.cmd === 'poi') {
        //     messageBuffer.push(msg)

        //     // await addDiscordNotificationJob({
        //     //   object: {
        //     //     k: msg.coords.k,
        //     //     x: msg.coords.x,
        //     //     y: msg.coords.y,
        //     //     staticId: msg.staticId
        //     //   },
        //     //   message: `notification count ${count}`
        //     // })
        //     await addGameNotificationJob({
        //       object: {
        //         k: msg.coords.k,
        //         x: msg.coords.x,
        //         y: msg.coords.y,
        //         staticId: msg.staticId
        //       },
        //       message: `${count}`,
        //       toMainChannel: false
        //     })

        //     console.log('notification count', count)

        //     // they handle different delays between messages, so must be separated jobs
        //   } else if (msg.cmd === 'sendmsg') {
        //     // cant spam, error too many messages
        //     // must set a job
        //     // that sends msg every 5 minutes or so
        //     // create  a queue pool, where to extract messages to send
        //     // sendMessage(msg.reason, msg.coords, msg.staticId)
        //     await addDiscordNotificationJob({
        //       object: {
        //         k: msg.coords.k,
        //         x: msg.coords.x,
        //         y: msg.coords.y,
        //         staticId: msg.staticId
        //       },
        //       message: `incomplete data`
        //     })
        //   }
        // })
        console.log(`[Worker Pool] Initialized with ${WORKER_POOL_SIZE} threads`)
      } catch (e) {
        console.warn('[Worker Pool] Failed:', e.message)
      }
    }
  }
  return pool
}

// Wrapper functions with fallback

async function processPacket({ request, response, shouldSaveObjects = false }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    return await processPacketSync({ request, response, shouldSaveObjects })
  }

  try {
    // ESPERAMOS a que Piscina termine para que BullMQ sepa el resultado real
    const result = await p.run({ request, response, shouldSaveObjects }, { name: 'processPacket' })

    // Aquí puedes procesar el resultado
    return { success: true, data: result }
  } catch (e) {
    console.error('[workerPool][scanKingdomWorker]1, error', e.message)
    // Al lanzar el error, BullMQ marcará el job como "Failed" y podrá reintentarlo
    throw e
  }
}

async function scanKingdomWorker(kingdom, shouldSaveObjects = false, checkFlags = false) {
  if (!kingdom) {
    console.log('[worker pool], no kingdom provided')
    throw new Error('[Worker Pool] No kingdom provided')
  }

  const p = getPool()
  if (!p || !USE_WORKERS) {
    console.log(
      '[worker pool][scanKingdomWorker], no workers, calling scankingdomtask directly',
      kingdom,
      shouldSaveObjects,
      checkFlags
    )
    return await scanKingdomTask({ kingdom, shouldSaveObjects, checkFlags })
  }

  try {
    // ESPERAMOS a que Piscina termine para que BullMQ sepa el resultado real
    console.log('[workerPool][scanKingdomWorker]', kingdom, shouldSaveObjects, checkFlags)
    const result = await p.run(
      { kingdom, shouldSaveObjects, checkFlags },
      { name: 'scanKingdomTask' }
    )

    console.log('[workerPool][scanKingdomWorker] result', result)

    // Aquí puedes procesar el resultado
    return { success: true, data: result }
  } catch (e) {
    console.error('[workerPool][scanKingdomWorker]2, error', e.message)
    // Al lanzar el error, BullMQ marcará el job como "Failed" y podrá reintentarlo
    throw e
  }
}

async function scanRefreshPlayerInfoWorker(kingdom, checkFlags = false) {
  if (!kingdom) {
    console.log('[worker pool], no kingdom provided')
    throw new Error('[Worker Pool] No kingdom provided')
  }

  const p = getPool()
  if (!p || !USE_WORKERS) {
    console.log(
      '[worker pool][scanRefreshPlayerInfoWorker], no workers, calling scanRefreshPlayerInfoTask directly'
    )
    return await scanRefreshPlayerInfoTask({ kingdom, checkFlags })
  }

  try {
    // ESPERAMOS a que Piscina termine para que BullMQ sepa el resultado real
    console.log('[worker pool][scanRefreshPlayerInfoWorker]', kingdom)
    const result = await p.run({ kingdom, checkFlags }, { name: 'scanRefreshPlayerInfoTask' })
    console.log('[worker pool][scanRefreshPlayerInfoWorker]', result)

    // Aquí puedes procesar el resultado
    return { success: true, data: result }
  } catch (e) {
    console.error('[workerPool][scanRefreshPlayerInfoWorker], error', e.message)
    // Al lanzar el error, BullMQ marcará el job como "Failed" y podrá reintentarlo
    throw e
  }
}

function poolReport() {
  const p = getPool()

  // console.log(`Uso del pool: ${(p.utilization * 100).toFixed(2)}%`)
  // console.log(`Tareas en cola: ${p.queueSize}`)

  // if (p.utilization > 0.8) {
  //   console.log(
  //     '⚠️ El pool está casi lleno, el bot de Discord podría sentir latencia en la transferencia de datos.'
  //   )
  // }
  return {
    usage: `${(p.utilization * 100).toFixed(2)}%`,
    queue: p.queueSize
  }
}

module.exports = {
  getPool,
  scanRefreshPlayerInfoWorker,
  scanKingdomWorker,
  processPacket,
  poolReport
}
