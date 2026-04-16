const { PriorityJobQueue, PRIORITY } = require('./PriorityJobQueue')
const { TimerManager } = require('./TimerManager')
const { connectRedis } = require('./redis')
const {
  sendPacketHandler,
  extractObjectsHandler,
  notificationHandler
} = require('./handlers')

let jobQueue = null
let timerManager = null

async function initializeJobs(options = {}) {
  console.log('[Jobs] Initializing job system...')

  // Connect to Redis
  await connectRedis()

  // Create job queue
  jobQueue = new PriorityJobQueue({
    maxRetries: options.maxRetries || 3,
    maxConcurrent: options.maxConcurrent || 3,
    pollInterval: options.pollInterval || 100,
    workerId: options.workerId || `server-${process.pid}`
  })

  // Register handlers
  jobQueue.register('send-packet', async (payload) => {
    const result = await sendPacketHandler(payload)
    
    // If successful and has next jobs, enqueue them
    if (result.success && result.nextJobs) {
      for (const nextJob of result.nextJobs) {
        const priority = nextJob.priority === 'HIGH' ? PRIORITY.HIGH : PRIORITY.NORMAL
        await jobQueue.add(nextJob.type, nextJob.payload, priority)
      }
    }
    
    return result
  })

  jobQueue.register('extract-objects', async (payload) => {
    const result = await extractObjectsHandler(payload)
    
    // If successful and has notification jobs, enqueue them
    if (result.success && result.nextJobs) {
      for (const nextJob of result.nextJobs) {
        await jobQueue.addHigh(nextJob.type, nextJob.payload)
      }
    }
    
    return result
  })

  jobQueue.register('extract-player', async (payload) => {
    // Player extraction logic
    console.log('[Jobs] extract-player handler not yet implemented')
    return { success: true, timestamp: Date.now() }
  })

  jobQueue.register('notification', async (payload) => {
    return await notificationHandler(payload)
  })

  // Create timer manager
  timerManager = new TimerManager(jobQueue)

  // Start worker
  await jobQueue.startWorker()

  console.log('[Jobs] Job system initialized successfully')

  return { jobQueue, timerManager }
}

function getJobQueue() {
  return jobQueue
}

function getTimerManager() {
  return timerManager
}

async function shutdownJobs() {
  console.log('[Jobs] Shutting down...')
  
  if (timerManager) {
    timerManager.stopAll()
  }
  
  if (jobQueue) {
    jobQueue.stopWorker()
  }
  
  console.log('[Jobs] Shutdown complete')
}

module.exports = {
  initializeJobs,
  getJobQueue,
  getTimerManager,
  shutdownJobs,
  PRIORITY
}
