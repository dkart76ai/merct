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

function processPacket({ request, response, shouldSaveObjects = false }) {
  if (!request || !response) throw new Error('No data provided')

  const p = getPool()
  if (!p || !USE_WORKERS) {
    processPacketSync({ request, response, shouldSaveObjects })
    // return { success: false, error: 'Workers disabled' }
  }

  p.run({ request, response, shouldSaveObjects }, { name: 'processPacket' })
    .then(result => {
      //do something with result of scanKingdomTask call
    })
    .catch(e => {
      console.error('[workerPol][scanKingdomWorker], error in scanKingdomTask', e.message)
    })
  return { success: true }
}

function scanKingdomWorker(kingdom, shouldSaveObjects = false, checkFlags = false) {
  if (!kingdom) {
    console.log('[worker pool], no kingdom provided')
    throw new Error('[Worker Pool] No kingdom provided')
  }

  const p = getPool()
  if (!p || !USE_WORKERS) {
    console.log('worker pool, no workers, using sync scankingdom')
    scanKingdomTask({ kingdom, shouldSaveObjects, checkFlags })
  }

  // console.log('worker pool, calling scankingdom on threads')
  // ? set and forget, no await needed, or returning anything,handle error on catch
  p.run({ kingdom, shouldSaveObjects, checkFlags }, { name: 'scanKingdomTask' })
    .then(result => {
      //do something with result of scanKingdomTask call
    })
    .catch(e => {
      console.error('[workerPol][scanKingdomWorker], error in scanKingdomTask', e.message)
    })

  return { success: true }
}

function scanRefreshPlayerInfoWorker(kingdom) {
  if (!kingdom) {
    console.log('[worker pool], no kingdom provided')
    throw new Error('[Worker Pool] No kingdom provided')
  }

  const p = getPool()
  if (!p || !USE_WORKERS) {
    console.log('worker pool, no workers, using sync scankingdom')
    scanRefreshPlayerInfoTask({ kingdom })
  }

  p.run({ kingdom }, { name: 'scanRefreshPlayerInfoTask' })
    .then(result => {
      //do something with result of scanKingdomTask call
    })
    .catch(e => {
      console.error('[workerPol][scanKingdomWorker], error in scanKingdomTask', e.message)
    })
  return { success: true }
}
module.exports = {
  getPool,
  scanRefreshPlayerInfoWorker,
  scanKingdomWorker,
  processPacket
}
