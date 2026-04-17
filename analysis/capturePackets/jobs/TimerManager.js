const { Queue } = require('bullmq')
const { JOB_TYPES, PRIORITY } = require('./index')

class TimerManager {
  constructor(queue) {
    this.queue = queue
    this.timers = new Map()
    this.timerConfigs = new Map()
  }

  async scheduleScanKingdom(kingdomId, options = {}) {
    const {
      intervalMs = 60000,
      tiles
    } = options

    const timerKey = `kingdom:${kingdomId}`

    await this.stopScan(kingdomId)

    const repeatOptions = {
      every: intervalMs
    }

    const jobData = {
      kingdomId,
      triggeredBy: 'timer',
      intervalMs,
      tiles
    }

    const job = await this.queue.add(JOB_TYPES.SEND_PACKET, jobData, {
      priority: PRIORITY.LOW,
      repeat: repeatOptions,
      jobId: `timer:${timerKey}`
    })

    this.timers.set(timerKey, {
      repeatJobKey: job.repeatJobKey,
      JOB_TYPES.SEND_PACKET
    })

    this.timerConfigs.set(timerKey, {
      kingdomId,tiles,
      intervalMs,
      startedAt: Date.now()
    })

    console.log(`[Timer] Scheduled ${JOB_TYPES.SEND_PACKET} for kingdom ${kingdomId} every ${intervalMs}ms`)

    return job
  }

  async scheduleCustom(name, intervalMs, jobType, jobData, options = {}) {
    const timerKey = `custom:${name}`

    await this.stopNamedTimer(name)

    const repeatOptions = {
      every: intervalMs
    }

    const job = await this.queue.add(
      jobType,
      { ...jobData, customTimerName: name },
      {
        priority: options.priority || PRIORITY.NORMAL,
        repeat: repeatOptions,
        jobId: `timer:${timerKey}`
      }
    )

    this.timers.set(timerKey, {
      repeatJobKey: job.repeatJobKey,
      jobType
    })

    this.timerConfigs.set(timerKey, {
      name,
      intervalMs,
      jobType,
      startedAt: Date.now()
    })

    console.log(`[Timer] Scheduled custom timer "${name}" every ${intervalMs}ms`)

    return job
  }

  async stopScan(kingdomId) {
    const timerKey = `kingdom:${kingdomId}`
    return this.stopByKey(timerKey)
  }

  async stopNamedTimer(name) {
    const timerKey = `custom:${name}`
    return this.stopByKey(timerKey)
  }

  async stopByKey(timerKey) {
    const timer = this.timers.get(timerKey)

    if (timer) {
      try {
        if (timer.repeatJobKey) {
          await this.queue.removeRepeatableByKey(timer.repeatJobKey)
          console.log(`[Timer] Removed repeatable job with key: ${timer.repeatJobKey}`)
        }
      } catch (error) {
        console.error(`[Timer] Error removing timer ${timerKey}:`, error.message)
      }

      this.timers.delete(timerKey)
      this.timerConfigs.delete(timerKey)
      return true
    }

    return false
  }

  async stopAll() {
    const keys = Array.from(this.timers.keys())
    for (const key of keys) {
      await this.stopByKey(key)
    }
    console.log('[Timer] Stopped all timers')
  }

  isRunning(kingdomId) {
    const timerKey = `kingdom:${kingdomId}`
    return this.timers.has(timerKey)
  }

  getConfig(kingdomId) {
    return this.timerConfigs.get(`kingdom:${kingdomId}`) || null
  }

  getActiveTimers() {
    return Array.from(this.timerConfigs.entries()).map(([key, config]) => ({
      key,
      ...config
    }))
  }

  getNextRunTime(kingdomId) {
    const config = this.timerConfigs.get(`kingdom:${kingdomId}`)
    if (!config) return null

    const elapsed = Date.now() - config.startedAt
    const nextRun = config.startedAt + Math.ceil(elapsed / config.intervalMs) * config.intervalMs

    return nextRun
  }
}

module.exports = {
  TimerManager
}
