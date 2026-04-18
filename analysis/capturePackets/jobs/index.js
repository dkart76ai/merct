const { Queue, Worker } = require('bullmq')
const { getRedis } = require('./redis')

const QUEUE_NAME = 'playwtb-jobs'

let queue = null
let worker = null
let timerManager = null

const JOB_TYPES = {
  SEND_PACKET: 'send-packet',
  EXTRACT_OBJECTS: 'extract-objects',
  SAVE_OBJECTS: 'save-objects',
  FIND_OBJECTS: 'find-objects',
  EXTRACT_PLAYER: 'extract-player',
  NOTIFICATION: 'notification',
  SCAN_KINGDOM: 'scan-kingdom',
  SCAN_FOR_MERC: 'scan-for-merc',
  PROCESS_PACKET: 'process-packet'
}

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  IDLE: 5
}

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 3600
        }
      }
    })
  }
  return queue
}

async function addJob(type, data, options = {}) {
  const q = getQueue()

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

  const job = await q.add(type, data, jobOptions)

  console.log(
    `[Queue] Added job ${job.id} (${type}) with priority ${options.priority || PRIORITY.NORMAL}`
  )

  return job
}

async function addCritical(type, data) {
  return addJob(type, data, { priority: PRIORITY.CRITICAL })
}

async function addHigh(type, data) {
  return addJob(type, data, { priority: PRIORITY.HIGH })
}

async function addLow(type, data) {
  return addJob(type, data, { priority: PRIORITY.LOW })
}

async function addDelayed(type, data, delayMs) {
  return addJob(type, data, { priority: PRIORITY.LOW, delay: delayMs })
}

function getTimerManagerInstance() {
  const { TimerManager } = require('./TimerManager')

  if (!timerManager) {
    const queueInstance = getQueue()
    timerManager = new TimerManager(queueInstance)
  }

  return timerManager
}

async function startWorker(handlers) {
  const connection = getRedis()

  worker = new Worker(
    QUEUE_NAME,
    async job => {
      console.log(`[Worker] Processing job ${job.id} (${job.name}) priority ${job.priority}`)

      const handler = handlers[job.name]
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.name}`)
      }

      const result = await handler(job.data)

      // Process chained jobs if handler returned them
      if (result && result.nextJobs) {
        for (const nextJob of result.nextJobs) {
          await addJob(nextJob.type, nextJob.payload, {
            priority: nextJob.priority || PRIORITY.NORMAL
          })
        }
      }

      console.log(`[Worker] Job  ${job.name} ${job.id} completed`)

      return result
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000
      }
    }
  )

  worker.on('completed', job => {
    console.log(`[Worker] Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message)
  })

  worker.on('error', err => {
    console.error('[Worker] Error:', err.message)
  })

  console.log('[Worker] Started')

  return worker
}

async function stopWorker() {
  if (worker) {
    await worker.close()
    worker = null
    console.log('[Worker] Stopped')
  }
}

async function getQueueStatus() {
  const q = getQueue()

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount()
  ])

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  }
}

async function getJob(jobId) {
  const q = getQueue()
  return q.getJob(jobId)
}

async function cleanOldJobs() {
  const q = getQueue()
  await q.clean(24 * 3600, 1000, 'completed')
  await q.clean(24 * 3600, 500, 'failed')
}

async function addJobAndWait(type, data, options = {}) {
  const q = getQueue()

  const jobOptions = {}
  if (options.priority !== undefined) {
    jobOptions.priority = options.priority
  }

  // Don't repeat, we want to wait for this one
  if (options.delay) {
    jobOptions.delay = options.delay
  }

  const job = await q.add(type, data, jobOptions)

  console.log(`[Queue] Added job ${job.id} (${type}), waiting for result...`)

  try {
    // Wait for job to complete (with timeout)
    const result = await job.waitUntilFinished(q.eventsEmitter, {
      timeout: options.timeout || 30000 // 30 second default
    })

    return {
      jobId: job.id,
      success: true,
      result
    }
  } catch (error) {
    console.error(`[Queue] Job  ${job.name} ${job.id} failed or timed out:`, error.message)
    return {
      jobId: job.id,
      success: false,
      error: error.message
    }
  }
}

async function pauseQueue() {
  const q = getQueue()
  await q.pause()
  console.log('[Queue] Paused')
}

async function resumeQueue() {
  const q = getQueue()
  await q.resume()
  console.log('[Queue] Resumed')
}

async function closeQueue() {
  if (queue) {
    await queue.close()
    queue = null
    console.log('[Queue] Closed')
  }
}

module.exports = {
  getQueue,
  addJob,
  addCritical,
  addHigh,
  addLow,
  addDelayed,
  addJobAndWait,
  getTimerManager: getTimerManagerInstance,
  startWorker,
  stopWorker,
  getQueueStatus,
  getJob,
  cleanOldJobs,
  pauseQueue,
  resumeQueue,
  closeQueue,
  JOB_TYPES,
  PRIORITY,
  QUEUE_NAME
}
