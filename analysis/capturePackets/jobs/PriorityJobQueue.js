const { getRedis } = require('./redis')

const PRIORITY = {
  CRITICAL: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25,
  IDLE: 10
}

const QUEUE_KEYS = {
  CRITICAL: 'jobs:priority:100',
  HIGH: 'jobs:priority:75',
  NORMAL: 'jobs:priority:50',
  LOW: 'jobs:priority:25',
  IDLE: 'jobs:priority:10',
  PROCESSING: 'jobs:processing',
  COMPLETED: 'jobs:completed',
  FAILED: 'jobs:failed'
}

const JOB_PREFIX = 'job:'

function generateJobId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

class PriorityJobQueue {
  constructor(options = {}) {
    this.handlers = new Map()
    this.maxRetries = options.maxRetries || 3
    this.maxConcurrent = options.maxConcurrent || 3
    this.activeJobs = 0
    this.processing = false
    this.pollInterval = options.pollInterval || 100
    this.redis = getRedis()
    this.workerId = options.workerId || `worker-${process.pid}`
  }

  register(type, handler) {
    this.handlers.set(type, handler)
    console.log(`Registered handler for job type: ${type}`)
  }

  async add(type, payload, priority = PRIORITY.NORMAL) {
    const jobId = generateJobId()
    
    const job = {
      id: jobId,
      type,
      payload,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      workerId: null,
      error: null,
      result: null
    }

    const jobKey = `${JOB_PREFIX}${jobId}`
    const priorityKey = QUEUE_KEYS[`${this.getPriorityName(priority)}`] || `jobs:priority:${priority}`

    try {
      // Store job data in Redis
      await this.redis.set(jobKey, JSON.stringify(job), 'EX', 3600)
      
      // Add job ID to priority queue (sorted set by timestamp)
      await this.redis.zadd(priorityKey, Date.now(), jobId)
      
      console.log(`[Queue] Added job ${jobId} (${type}) with priority ${priority}`)
      
      // Trigger worker to process
      await this.triggerWorker()
      
      return jobId
    } catch (error) {
      console.error(`[Queue] Failed to add job:`, error.message)
      throw error
    }
  }

  getPriorityName(priority) {
    const entry = Object.entries(PRIORITY).find(([, v]) => v === priority)
    return entry ? entry[0] : 'NORMAL'
  }

  async triggerWorker() {
    // Publish to worker channel
    await this.redis.publish('jobs:new', '1')
  }

  async addCritical(type, payload) {
    return this.add(type, payload, PRIORITY.CRITICAL)
  }

  async addHigh(type, payload) {
    return this.add(type, payload, PRIORITY.HIGH)
  }

  async addLow(type, payload) {
    return this.add(type, payload, PRIORITY.LOW)
  }

  async getNextJob() {
    // Check queues from highest to lowest priority
    const priorityOrder = [
      QUEUE_KEYS.CRITICAL,
      QUEUE_KEYS.HIGH,
      QUEUE_KEYS.NORMAL,
      QUEUE_KEYS.LOW,
      QUEUE_KEYS.IDLE
    ]

    for (const queueKey of priorityOrder) {
      // Get the oldest job from each queue
      const jobIds = await this.redis.zrange(queueKey, 0, 0)
      
      if (jobIds.length > 0) {
        const jobId = jobIds[0]
        const jobKey = `${JOB_PREFIX}${jobId}`
        
        // Get job data
        const jobData = await this.redis.get(jobKey)
        if (jobData) {
          const job = JSON.parse(jobData)
          
          // Remove from queue and mark as processing
          await this.redis.zrem(queueKey, jobId)
          await this.redis.zadd(QUEUE_KEYS.PROCESSING, Date.now(), jobId)
          
          job.status = 'processing'
          job.startedAt = Date.now()
          job.workerId = this.workerId
          await this.redis.set(jobKey, JSON.stringify(job), 'EX', 3600)
          
          return job
        }
      }
    }

    return null
  }

  async completeJob(job, result) {
    job.status = 'completed'
    job.completedAt = Date.now()
    job.result = result

    const jobKey = `${JOB_PREFIX}${job.id}`
    await this.redis.zrem(QUEUE_KEYS.PROCESSING, job.id)
    await this.redis.zadd(QUEUE_KEYS.COMPLETED, Date.now(), job.id)
    await this.redis.set(jobKey, JSON.stringify(job), 'EX', 3600)

    console.log(`[Queue] Job ${job.id} (${job.type}) completed`)

    this.activeJobs--
    this.processQueue()
  }

  async failJob(job, error) {
    job.retries++
    job.error = error.message

    const jobKey = `${JOB_PREFIX}${job.id}`

    if (job.retries < this.maxRetries) {
      // Re-queue with lower priority
      const newPriority = Math.max(PRIORITY.IDLE, job.priority - 10)
      job.priority = newPriority
      job.status = 'pending'
      job.workerId = null

      await this.redis.zrem(QUEUE_KEYS.PROCESSING, job.id)
      const priorityKey = `jobs:priority:${newPriority}`
      await this.redis.zadd(priorityKey, Date.now(), job.id)
      await this.redis.set(jobKey, JSON.stringify(job), 'EX', 3600)

      console.log(`[Queue] Job ${job.id} failed (${job.retries}/${this.maxRetries}), requeued with priority ${newPriority}`)
    } else {
      // Mark as permanently failed
      job.status = 'failed'
      job.failedAt = Date.now()

      await this.redis.zrem(QUEUE_KEYS.PROCESSING, job.id)
      await this.redis.zadd(QUEUE_KEYS.FAILED, Date.now(), job.id)
      await this.redis.set(jobKey, JSON.stringify(job), 'EX', 3600)

      console.error(`[Queue] Job ${job.id} failed permanently:`, error.message)
    }

    this.activeJobs--
    this.processQueue()
  }

  async processQueue() {
    if (this.processing) return
    if (this.activeJobs >= this.maxConcurrent) return

    const job = await this.getNextJob()
    if (!job) return

    this.processing = true
    this.activeJobs++

    try {
      const handler = this.handlers.get(job.type)
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`)
      }

      console.log(`[Queue] Processing job ${job.id} (${job.type}) [Priority: ${this.getPriorityName(job.priority)}]`)

      const result = await handler(job.payload)
      await this.completeJob(job, result)

    } catch (error) {
      await this.failJob(job, error)
    }

    this.processing = false
    
    // Continue processing if more jobs available
    this.processQueue()
  }

  async startWorker() {
    console.log(`[Queue] Starting worker ${this.workerId}`)
    
    // Poll for new jobs
    this.workerInterval = setInterval(async () => {
      if (this.activeJobs < this.maxConcurrent) {
        await this.processQueue()
      }
    }, this.pollInterval)

    // Subscribe to new job notifications
    const subscriber = getRedis()
    await subscriber.subscribe('jobs:new')
    
    subscriber.on('message', async (channel, message) => {
      if (channel === 'jobs:new') {
        await this.processQueue()
      }
    })
  }

  stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval)
      this.workerInterval = null
    }
    console.log(`[Queue] Worker ${this.workerId} stopped`)
  }

  async getStatus() {
    const status = {}
    
    for (const [name, key] of Object.entries(QUEUE_KEYS)) {
      if (name === 'PROCESSING' || name === 'COMPLETED' || name === 'FAILED') {
        status[name.toLowerCase()] = await this.redis.zcard(key)
      } else {
        status[name.toLowerCase()] = await this.redis.zcard(key)
      }
    }

    status.activeJobs = this.activeJobs
    status.maxConcurrent = this.maxConcurrent

    return status
  }

  async cancelJobs(filterFn) {
    const cancelled = []
    const jobKeys = []
    
    for (const [name, key] of Object.entries(QUEUE_KEYS)) {
      if (name === 'COMPLETED' || name === 'FAILED') continue
      
      const ids = await this.redis.zrange(key, 0, -1)
      for (const jobId of ids) {
        const jobKey = `${JOB_PREFIX}${jobId}`
        const jobData = await this.redis.get(jobKey)
        if (jobData) {
          const job = JSON.parse(jobData)
          if (filterFn(job)) {
            await this.redis.zrem(key, jobId)
            cancelled.push(jobId)
            jobKeys.push(jobKey)
          }
        }
      }
    }

    // Clean up job data
    for (const key of jobKeys) {
      await this.redis.del(key)
    }

    console.log(`[Queue] Cancelled ${cancelled.length} jobs`)
    return cancelled
  }

  async getJob(jobId) {
    const jobKey = `${JOB_PREFIX}${jobId}`
    const jobData = await this.redis.get(jobKey)
    return jobData ? JSON.parse(jobData) : null
  }
}

module.exports = {
  PriorityJobQueue,
  PRIORITY,
  generateJobId
}
