const { Queue } = require('bullmq')
const { JOB_TYPES, PRIORITY } = require('./index')

class TimerManager {
  constructor(queue) {
    this.queue = queue
    this.timers = new Map()
    this.timerConfigs = new Map()
    this.kingdomTimerKeys = new Map()
  }

  async scheduleScanKingdom(kingdomId, options = {}) {
    const {
      intervalMs = 60000,
      tiles
    } = options

    const tilesKey = tiles.join(',')
    const timerKey = `kingdom:${kingdomId}:${tilesKey}`

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
      jobType: JOB_TYPES.SEND_PACKET
    })

    this.timerConfigs.set(timerKey, {
      kingdomId,
      tiles,
      tilesKey,
      intervalMs,
      startedAt: Date.now()
    })

    if (!this.kingdomTimerKeys.has(kingdomId)) {
      this.kingdomTimerKeys.set(kingdomId, [])
    }
    this.kingdomTimerKeys.get(kingdomId).push(timerKey)

    console.log(`[Timer] Scheduled ${JOB_TYPES.SEND_PACKET} for kingdom ${kingdomId} tiles ${tilesKey} every ${intervalMs}ms`)

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
    const timerKeys = this.kingdomTimerKeys.get(kingdomId) || []
    let stopped = false

    for (const timerKey of timerKeys) {
      const result = await this.stopByKey(timerKey)
      if (result) stopped = true
    }

    this.kingdomTimerKeys.delete(kingdomId)

    return stopped
  }

  async stopNamedTimer(name) {
    const timerKey = `custom:${name}`
    return this.stopByKey(timerKey)
  }

  async stopByKey(timerKey) {
    const timer = this.timers.get(timerKey)

    if (timer) {
      const config = this.timerConfigs.get(timerKey)
      const kingdomId = config?.kingdomId

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

      if (kingdomId) {
        const keys = this.kingdomTimerKeys.get(kingdomId)
        if (keys) {
          const idx = keys.indexOf(timerKey)
          if (idx > -1) keys.splice(idx, 1)
          if (keys.length === 0) this.kingdomTimerKeys.delete(kingdomId)
        }
      }

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
    const timerKeys = this.kingdomTimerKeys.get(kingdomId) || []
    return timerKeys.length > 0
  }

  getConfigs(kingdomId) {
    const timerKeys = this.kingdomTimerKeys.get(kingdomId) || []
    return timerKeys.map(key => this.timerConfigs.get(key)).filter(Boolean)
  }

  getActiveTimers() {
    const result = []
    for (const [key, config] of this.timerConfigs.entries()) {
      result.push({ key, ...config })
    }
    return result
  }

  getNextRunTime(kingdomId) {
    const configs = this.getConfigs(kingdomId)
    if (!configs || configs.length === 0) return null

    const nextTimes = configs.map(config => {
      const elapsed = Date.now() - config.startedAt
      return config.startedAt + Math.ceil(elapsed / config.intervalMs) * config.intervalMs
    })

    return Math.min(...nextTimes)
  }
}

module.exports = {
  TimerManager
}
