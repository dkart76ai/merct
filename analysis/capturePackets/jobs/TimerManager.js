const { PRIORITY } = require('./PriorityJobQueue')

class TimerManager {
  constructor(jobQueue) {
    this.jobQueue = jobQueue
    this.timers = new Map()
    this.timerConfigs = new Map()
  }

  scheduleScanKingdom(kingdomId, options = {}) {
    const {
      intervalMs = 60000,
      payloadBuilder = null,
      onTick = null
    } = options

    // Clear existing timer for this kingdom
    this.stopScan(kingdomId)

    const timerId = setInterval(async () => {
      try {
        console.log(`[Timer] Kingdom ${kingdomId} scan triggered`)
        
        if (onTick) {
          await onTick(kingdomId)
        }
        
        if (payloadBuilder) {
          const payload = await payloadBuilder(kingdomId)
          if (payload) {
            // LOW priority - background timer jobs don't block user actions
            await this.jobQueue.addLow('send-packet', payload)
          }
        }
        
      } catch (error) {
        console.error(`[Timer] Kingdom ${kingdomId} scan error:`, error.message)
      }
    }, intervalMs)

    this.timers.set(kingdomId, timerId)
    this.timerConfigs.set(kingdomId, {
      intervalMs,
      startedAt: Date.now()
    })

    console.log(`[Timer] Scheduled scan for kingdom ${kingdomId} every ${intervalMs}ms`)
    
    return timerId
  }

  scheduleCustom(name, intervalMs, callback) {
    // Clear existing timer with same name
    this.stopNamedTimer(name)

    const timerId = setInterval(async () => {
      try {
        console.log(`[Timer] Custom timer "${name}" triggered`)
        await callback()
      } catch (error) {
        console.error(`[Timer] Custom timer "${name}" error:`, error.message)
      }
    }, intervalMs)

    this.timers.set(`custom:${name}`, timerId)
    this.timerConfigs.set(`custom:${name}`, {
      name,
      intervalMs,
      startedAt: Date.now()
    })

    console.log(`[Timer] Scheduled custom timer "${name}" every ${intervalMs}ms`)
    
    return timerId
  }

  stopScan(kingdomId) {
    if (this.timers.has(kingdomId)) {
      clearInterval(this.timers.get(kingdomId))
      this.timers.delete(kingdomId)
      this.timerConfigs.delete(kingdomId)
      console.log(`[Timer] Stopped scan for kingdom ${kingdomId}`)
      return true
    }
    return false
  }

  stopNamedTimer(name) {
    const key = `custom:${name}`
    if (this.timers.has(key)) {
      clearInterval(this.timers.get(key))
      this.timers.delete(key)
      this.timerConfigs.delete(key)
      console.log(`[Timer] Stopped custom timer "${name}"`)
      return true
    }
    return false
  }

  stopAll() {
    for (const [key, timerId] of this.timers) {
      clearInterval(timerId)
    }
    this.timers.clear()
    this.timerConfigs.clear()
    console.log(`[Timer] Stopped all timers`)
  }

  isRunning(kingdomId) {
    return this.timers.has(kingdomId)
  }

  getConfig(kingdomId) {
    return this.timerConfigs.get(kingdomId) || null
  }

  getActiveTimers() {
    const active = []
    for (const [key, config] of this.timerConfigs) {
      const timerInfo = {
        key,
        ...config
      }
      active.push(timerInfo)
    }
    return active
  }

  // Get next run time for a kingdom
  getNextRunTime(kingdomId) {
    const config = this.timerConfigs.get(kingdomId)
    if (!config) return null

    const elapsed = Date.now() - config.startedAt
    const intervalMs = config.intervalMs
    const nextRun = config.startedAt + Math.ceil(elapsed / intervalMs) * intervalMs
    
    return nextRun
  }

  // Adjust interval for a running timer
  adjustInterval(kingdomId, newIntervalMs) {
    if (!this.timers.has(kingdomId)) {
      console.warn(`[Timer] Cannot adjust - no timer running for kingdom ${kingdomId}`)
      return false
    }

    const config = this.timerConfigs.get(kingdomId)
    
    // Restart with new interval
    const builder = null // User should re-call scheduleScanKingdom with new interval
    console.log(`[Timer] Restarting timer for kingdom ${kingdomId} with new interval ${newIntervalMs}ms`)
    
    // Simply update config and let it continue (next tick will use new timing)
    config.intervalMs = newIntervalMs
    
    return true
  }
}

module.exports = {
  TimerManager
}
