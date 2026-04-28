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

  //updated
  async scheduleCustom(name, intervalMs, jobType, jobData, options = {}) {
    const timerKey = name.includes(':') ? name : `custom:${name}`

    // await this.stopByKey(timerKey) // Evita duplicados

    const repeat = { every: intervalMs }

    // await this.queue.add(jobType, jobData, {
    //   ...options,
    //   repeat,
    //   jobId: timerKey
    // })

    // upsertJobScheduler gestiona internamente la actualización sin duplicados.
    // 1. ID del programador
    // 2. Configuración de repetición
    // 3. Plantilla del trabajo (nombre, datos y opciones)
    await this.queue.upsertJobScheduler(
      timerKey,
      { every: intervalMs },
      {
        name: jobType,
        data: jobData,
        opts: options
      }
    )

    this.timers.set(timerKey, { jobName: jobType, repeat, data: jobData })
    console.log(`[Timer] Scheduled: ${timerKey}`)
  }

  //updated
  async stopByKey(timerKey) {
    const timer = this.timers.get(timerKey)
    if (!timer) return false

    try {
      // Borrado exacto en BullMQ
      // await this.queue.removeRepeatable(timer.jobName, timer.repeat, timerKey)

      // En la nueva API, solo necesitas el ID del scheduler
      await this.queue.removeJobScheduler(timerKey)
      this.timers.delete(timerKey)
      console.log(`[Timer] Stopped: ${timerKey}`)
    } catch (e) {
      console.error(`[Timer] Error in Redis for ${timerKey}:`, e.message)
    }

    return true
  }

  //updated
  async stopAll() {
    // 1. Obtener todos los schedulers configurados en la cola
    const schedulers = await this.queue.getJobSchedulers()

    for (const scheduler of schedulers) {
      // 2. Eliminar el programador usando su ID (el timerKey que definiste)
      await this.queue.removeJobScheduler(scheduler.key)

      // 3. (Opcional) Limpiar tu mapa local de timers
      this.timers.delete(scheduler.key)

      console.log(`[Timer] Stopped Scheduler: ${scheduler.key}`)
    }

    // 4. Limpiar trabajos que ya fueron creados por el scheduler pero siguen en espera
    // Los schedulers generan trabajos con IDs que suelen empezar con "repeat:"
    const delayedJobs = await this.queue.getJobs(['delayed', 'waiting'])

    for (const job of delayedJobs) {
      if (job.id && job.id.includes('repeat:')) {
        await job.remove()
      }
    }

    // 2. ¡CRUCIAL! Eliminar los trabajos que ya están programados en Redis
    // Esto limpia los trabajos en estado 'delayed' (esperando su turno)
    // y 'waiting' (listos para ejecutarse)
    await this.queue.drain(true)
  }

  //updated
  async purgeEverything() {
    await this.stopAll() // Primero detenemos los cronómetros

    // Borra el historial de jobs terminados, fallidos y en espera
    await Promise.all([
      this.queue.clean(0, 0, 'completed'),
      this.queue.clean(0, 0, 'failed'),
      this.queue.clean(0, 0, 'delayed'), // Importante: los schedulers suelen dejar el próximo job en 'delayed'
      this.queue.drain(true) // Vacía jobs que estén esperando ejecución ahora mismo
    ])

    // 3. Limpieza de compatibilidad (Opcional pero recomendado una sola vez)
    // Esto borra los jobs repetibles de la API antigua que pudieran seguir vivos
    const oldRepeatables = await this.queue.getRepeatableJobs()
    await Promise.all(oldRepeatables.map(job => this.queue.removeRepeatableByKey(job.key)))

    console.log('[Timer] Cola purgada y sincronizada con el nuevo sistema.')
  }

  // Helpers rápidos
  isRunning(kingdom) {
    return this.timers.has(`kingdom:${kingdom}`)
  }

  stopScan(kingdom) {
    return this.stopByKey(`kingdom:${kingdom}`)
  }

  async stopByKeyFull(key) {
    return this.stopByKey(key)
  }

  //updated
  async getNextRunTimes() {
    // 1. Obtenemos los programadores activos (Job Schedulers)
    const schedulers = await this.queue.getJobSchedulers()

    const schedule = schedulers.map(scheduler => {
      // BullMQ devuelve el timestamp de la próxima ejecución en 'next'
      const nextRun = scheduler.next || 0

      return {
        key: scheduler.id,
        jobName: scheduler.name, // Nombre de la tarea (plantilla)
        nextRunAt: nextRun ? new Date(nextRun).toLocaleString() : 'N/A',
        nextRunTimestamp: nextRun,
        remainingMs: nextRun ? Math.max(0, nextRun - Date.now()) : 0,
        // Los schedulers pueden ser por intervalo (every) o cron (pattern)
        interval: scheduler.every || scheduler.pattern,
        data: scheduler.data || {}
      }
    })

    // Ordenamos por el que se ejecutará más pronto
    return schedule.sort((a, b) => a.nextRunTimestamp - b.nextRunTimestamp)
  }

  //updated
  async getNextScanForKingdom(kingdom) {
    const timerKey = `kingdom:${kingdom}`
    const allJobs = await this.queue.getJobSchedulers()

    const job = allJobs.find(j => j.id === timerKey)

    // Si no hay job o no tiene una próxima ejecución definida
    if (!job || !job.next) return null

    const nextRunDate = new Date(job.next)
    const secondsLeft = Math.max(0, Math.round((job.next - Date.now()) / 1000))

    return {
      kingdom,
      nextRun: nextRunDate,
      secondsLeft: secondsLeft
    }
  }

  //updated
  async getHealthReport() {
    const jobs = await this.queue.getJobSchedulers()
    const now = Date.now()
    const TOLERANCE_MS = 5000 // 5 segundos de margen antes de marcarlo como "Lags detected"

    return jobs.map(job => {
      const nextRun = job.next || 0
      const diff = nextRun - now

      // Si 'next' es menor que 'now' menos la tolerancia, el job debería haber arrancado ya.
      const isOverdue = nextRun > 0 && now > nextRun + TOLERANCE_MS

      return {
        id: job.id,
        name: job.name,
        interval: job.every || job.pattern, // Soporta ambos tipos de programación
        nextRunIn: nextRun > 0 ? `${Math.round(diff / 1000)}s` : 'N/A',
        status: isOverdue ? 'Lags detected' : 'Healthy',
        // Añadimos el retraso exacto para debug
        delay: isOverdue ? `${Math.round((now - nextRun) / 1000)}s` : '0s'
      }
    })
  }

  async getActiveTimers() {
    // 1. Obtenemos los programadores activos (fuente de verdad en Redis)
    const repeatableJobs = await this.queue.getJobSchedulers()
    // console.log('RAW DATA FROM REDIS:', JSON.stringify(repeatableJobs, null, 2))

    return repeatableJobs.map(job => {
      // BullMQ guarda la configuración de tiempo en propiedades específicas
      const frequency = job.every ? `${job.every}ms` : job.pattern
      const jobData = job.template?.data || {}

      return {
        id: job.id,
        kingdom: jobData.kingdom || null,
        name: job.name,
        interval: frequency,
        nextRunAt: job.next ? new Date(job.next).toLocaleString() : 'Never',
        data: jobData
      }
    })
  }

  async rehydrate() {
    console.log('[Timer] Sincronizando timers con Redis...')

    // 1. Obtener los programadores desde la fuente de verdad (Redis)
    const schedulers = await this.queue.getJobSchedulers()

    // Limpiamos el mapa local antes de rehidratar para evitar residuos
    this.timers.clear()

    for (const job of schedulers) {
      // 2. Reconstruimos el Map local con el formato correcto
      // Determinamos si es un intervalo fijo o una expresión cron
      const repeatConfig = job.every ? { every: job.every } : { pattern: job.pattern }

      this.timers.set(job.id, {
        jobName: job.name,
        repeat: repeatConfig,
        data: job.data
      })
    }

    console.log(`[Timer] Sincronización completada. ${this.timers.size} timers recuperados.`)
  }
}

module.exports = {
  TimerManager
}
