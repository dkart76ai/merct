const { Queue } = require('bullmq')
const { JOB_TYPES, PRIORITY } = require('./index')

class TimerManager {
  constructor(queue) {
    this.queue = queue
    this.timers = new Map()
  }

  async scheduleScanKingdom(kingdom, options = {}) {
    const { intervalMs = 180000, shouldSaveObjects } = options
    const timerKey = `kingdom:${kingdom}`

    return this.scheduleCustom(`kingdom:${kingdom}`, intervalMs, JOB_TYPES.SCAN_KINGDOM, {
      kingdom,
      shouldSaveObjects
    })
  }

  async scheduleCustom(name, intervalMs, jobType, jobData, options = {}) {
    const timerKey = name.includes(':') ? name : `custom:${name}`

    await this.stopByKey(timerKey) // Evita duplicados

    const repeat = { every: intervalMs }

    await this.queue.add(jobType, jobData, {
      ...options,
      repeat,
      jobId: timerKey
    })

    this.timers.set(timerKey, { jobName: jobType, repeat, data: jobData })
    console.log(`[Timer] Scheduled: ${timerKey}`)
  }

  async stopByKey(timerKey) {
    const timer = this.timers.get(timerKey)
    if (!timer) return false

    try {
      // Borrado exacto en BullMQ
      await this.queue.removeRepeatable(timer.jobName, timer.repeat, timerKey)
    } catch (e) {
      console.error(`[Timer] Error in Redis for ${timerKey}:`, e.message)
    }

    this.timers.delete(timerKey)
    return true
  }

  async stopAll() {
    const keys = Array.from(this.timers.keys())
    await Promise.all(keys.map(key => this.stopByKey(key)))

    // Limpieza de seguridad para jobs que no estén en el Map local
    const redisJobs = await this.queue.getRepeatableJobs()
    await Promise.all(redisJobs.map(j => this.queue.removeRepeatableByKey(j.key)))

    this.timers.clear()
  }

  async purgeEverything() {
    await this.stopAll() // Primero detenemos los cronómetros

    // Borra el historial de jobs terminados, fallidos y en espera
    await Promise.all([
      this.queue.clean(0, 1000, 'completed'),
      this.queue.clean(0, 1000, 'failed'),
      this.queue.drain() // Vacía jobs que estén esperando ejecución ahora mismo
    ])

    console.log('[Timer] Cola purgada completamente.')
  }

  // Helpers rápidos
  isRunning(kingdom) {
    return this.timers.has(`kingdom:${kingdom}`)
  }
  stopScan(kingdom) {
    return this.stopByKey(`kingdom:${kingdom}`)
  }

  async getNextRunTimes() {
    // 1. Obtenemos todos los cronómetros activos directamente de Redis
    const repeatableJobs = await this.queue.getRepeatableJobs()

    const schedule = repeatableJobs.map(job => {
      // Intentamos buscar datos extra en nuestro Map local usando el jobId (que es job.id)
      const localData = this.timers.get(job.id)

      return {
        key: job.id,
        jobName: job.name,
        nextRunAt: new Date(job.next).toLocaleString(), // Formato legible
        nextRunTimestamp: job.next,
        remainingMs: job.next - Date.now(),
        interval: job.every,
        data: localData?.data || {} // Datos que guardamos originalmente
      }
    })

    // Ordenamos por el que se ejecutará más pronto
    return schedule.sort((a, b) => a.nextRunTimestamp - b.nextRunTimestamp)
  }

  async getNextScanForKingdom(kingdom) {
    const timerKey = `kingdom:${kingdom}`
    const allJobs = await this.queue.getRepeatableJobs()

    const job = allJobs.find(j => j.id === timerKey)

    if (!job) return null

    return {
      kingdom,
      nextRun: new Date(job.next),
      secondsLeft: Math.round((job.next - Date.now()) / 1000)
    }
  }

  async getHealthReport() {
    const jobs = await this.queue.getRepeatableJobs()
    const now = Date.now()

    return jobs.map(job => {
      const isOverdue = now > job.next // Esto indicaría que el worker está bloqueado o lento
      return {
        id: job.id,
        name: job.name,
        interval: job.every,
        nextRunIn: `${Math.round((job.next - now) / 1000)}s`,
        status: isOverdue ? 'Lags detected' : 'Healthy'
      }
    })
  }

  async getActiveTimers() {
    // 1. Obtenemos todos los cronómetros registrados en Redis
    const repeatableJobs = await this.queue.getRepeatableJobs()

    return repeatableJobs.map(job => {
      // 2. Intentamos recuperar los datos originales guardados en nuestro Map
      const localInfo = this.timers.get(job.id)
      console.log('getActiveTimers', { job, localInfo })

      return {
        id: job.id, // Ej: "kingdom:123" o "custom:mi-tarea"
        name: job.name, // El JOB_TYPES (ej: SCAN_KINGDOM)
        interval: job.every, // Cada cuántos ms se ejecuta
        nextRunAt: new Date(job.next).toLocaleString(), // Próxima ejecución legible
        data: localInfo?.data || {}, // Los datos que le pasaste al programarlo
        key: job.key // La llave interna de BullMQ (por si quieres borrarla)
      }
    })
  }

  async rehydrate() {
    console.log('[Timer] Sincronizando timers con Redis...')

    // 1. Obtener todos los trabajos repetibles actuales de la base de datos
    const repeatableJobs = await this.queue.getRepeatableJobs()

    for (const job of repeatableJobs) {
      // 2. Reconstruimos el Map local
      // BullMQ guarda la configuración de repetición en el objeto job
      this.timers.set(job.id, {
        jobName: job.name,
        repeat: { every: job.every },
        // Intentamos recuperar los datos del job si es posible
        // Nota: getRepeatableJobs no siempre trae los 'data' originales,
        // pero sí las opciones necesarias para detenerlos (removeRepeatable).
        data: {}
      })
    }

    console.log(`[Timer] Sincronización completada. ${this.timers.size} timers recuperados.`)
  }
}

module.exports = {
  TimerManager
}
