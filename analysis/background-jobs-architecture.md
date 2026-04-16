# Background Jobs Architecture

## Goal
Refactor the packet processing system to use a priority-based job queue architecture. This decouples packet capture from processing, allowing for parallel execution, retry logic, and priority handling.

## Priority Levels

| Priority | Value | Use Case | Example |
|----------|-------|----------|---------|
| `critical` | 100 | User interactions | Button clicks, immediate actions |
| `high` | 75 | User-initiated tasks | Manual scans, chat messages |
| `normal` | 50 | Background tasks | Timer-based scans, regular processing |
| `low` | 25 | Batch processing | Bulk database updates, analytics |
| `idle` | 10 | Non-urgent tasks | Cleanup, cache pruning |

**Higher number = higher priority**

## Current Problem
- Packet capture, processing, and responses are tightly coupled
- Multiple promises running in parallel without proper error handling
- No retry mechanism for failed jobs
- No priority system - timer jobs block user-initiated actions

## Proposed Architecture

### 1. Priority Job Queue System

```javascript
const PRIORITY = {
  CRITICAL: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25,
  IDLE: 10
}

class PriorityJobQueue {
  constructor(options = {}) {
    this.queues = {
      [PRIORITY.CRITICAL]: [],
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: [],
      [PRIORITY.IDLE]: []
    }
    this.handlers = new Map()
    this.processing = false
    this.maxConcurrent = options.maxConcurrent || 3
    this.activeJobs = 0
  }

  register(type, handler) {
    this.handlers.set(type, handler)
  }

  add(type, payload, priority = PRIORITY.NORMAL) {
    const job = {
      id: generateJobId(),
      type,
      payload,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 3
    }

    this.queues[priority].push(job)
    this.process()
    return job.id
  }

  // Convenience methods for specific priorities
  addCritical(type, payload) {
    return this.add(type, payload, PRIORITY.CRITICAL)
  }

  addHigh(type, payload) {
    return this.add(type, payload, PRIORITY.HIGH)
  }

  addLow(type, payload) {
    return this.add(type, payload, PRIORITY.LOW)
  }

  // Get next job from highest priority queue
  shift() {
    // Check from highest to lowest priority
    for (const priority of Object.keys(this.queues).sort((a, b) => b - a)) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift()
      }
    }
    return null
  }

  // Re-add failed job with lower priority (backoff)
  requeueWithBackoff(job) {
    const newPriority = Math.max(PRIORITY.IDLE, job.priority - 10)
    job.priority = newPriority
    job.status = 'pending'
    this.queues[newPriority].push(job)
    console.log(`Job ${job.id} requeued with priority ${newPriority}`)
  }

  async process() {
    if (this.processing) return
    this.processing = true

    while (this.hasJobs()) {
      // Don't start new jobs if at concurrency limit
      if (this.activeJobs >= this.maxConcurrent) {
        await this.waitForSlot()
        continue
      }

      const job = this.shift()
      if (!job) break

      this.activeJobs++
      this.executeJob(job)
    }

    this.processing = false
  }

  hasJobs() {
    return Object.values(this.queues).some(q => q.length > 0)
  }

  async waitForSlot() {
    return new Promise(resolve => setTimeout(resolve, 100))
  }

  async executeJob(job) {
    try {
      const handler = this.handlers.get(job.type)
      if (!handler) throw new Error(`No handler for job type: ${job.type}`)

      job.status = 'processing'
      job.startedAt = Date.now()

      console.log(`[PRIORITY ${job.priority}] Processing job ${job.id} (${job.type})`)

      job.result = await handler(job.payload)
      job.status = 'completed'
      job.completedAt = Date.now()

      console.log(`[PRIORITY ${job.priority}] Job ${job.id} completed`)

    } catch (error) {
      job.status = 'failed'
      job.error = error.message
      job.retries++

      if (job.retries < job.maxRetries) {
        console.log(`Job ${job.id} failed (${job.retries}/${job.maxRetries}), requeueing...`)
        this.requeueWithBackoff(job)
      } else {
        console.error(`Job ${job.id} failed permanently:`, error.message)
      }
    } finally {
      this.activeJobs--
      this.process() // Check for more jobs
    }
  }

  // Get queue status
  getStatus() {
    return {
      queues: Object.fromEntries(
        Object.entries(this.queues).map(([p, q]) => [p, q.length])
      ),
      activeJobs: this.activeJobs,
      processing: this.processing,
      totalPending: Object.values(this.queues).reduce((a, q) => a + q.length, 0)
    }
  }

  // Cancel jobs matching filter
  cancel(filterFn) {
    let cancelled = 0
    for (const queue of Object.values(this.queues)) {
      const before = queue.length
      queue = queue.filter(job => {
        if (filterFn(job)) {
          cancelled++
          return false
        }
        return true
      })
    }
    return cancelled
  }
}
```

### 2. Job Types

| Job Type | Trigger | Priority | Handler |
|----------|---------|----------|---------|
| `send-packet` | Button click | `CRITICAL` (100) | Encode & send packet to game server |
| `send-chat` | User chat message | `HIGH` (75) | Send in-game chat message |
| `extract-objects` | Packet contains object data | `NORMAL` (50) | Parse objects from packet, save to DB |
| `extract-player` | Packet contains player data | `NORMAL` (50) | Update player info, stats |
| `notification` | User config + event match | `HIGH` (75) | Send Discord webhook |
| `scan-kingdom` | Timer tick | `LOW` (25) | Periodic kingdom scan |

### 3. Priority Usage Examples

**User clicks button → CRITICAL priority (100)**
```javascript
// User pressed "Scan Now" button
jobQueue.addCritical('send-packet', { ... })
// Immediately processed, bypasses all lower priority jobs
```

**Timer tick → LOW priority (25)**
```javascript
// Scheduled scan every 60 seconds
setInterval(() => {
  jobQueue.addLow('scan-kingdom', { ... })
  // Won't block user actions
}, 60000)
```

**Notification triggered → HIGH priority (75)**
```javascript
// Player spotted! Send alert
jobQueue.addHigh('notification', { 
  type: 'player-spotted',
  objects: [player]
})
// Important but user can wait a bit
```

### 4. How Priority Works

```
Queue State Example:
┌─────────────────────────────────────────────────┐
│ CRITICAL (100): [job-5]                         │ ← User click
│ HIGH (75):     [job-3, job-4]                   │ ← Notifications  
│ NORMAL (50):   [job-1, job-2, ...]              │ ← Normal tasks
│ LOW (25):      [timer-job-1, timer-job-2, ...]  │ ← Background
│ IDLE (10):     [cleanup-job-1]                  │ ← Cleanup
└─────────────────────────────────────────────────┘

Processing order: job-5 → job-3 → job-4 → job-1 → job-2 → ...
```

### 5. Refactored Packet Capture Flow

**Before (coupled):**
```javascript
// All in one place
const response = await fetch(url, { body })
const decoded = multiDecodeMsgPack2(response)

if (decoded.results[0]?.[0] === 312) {
  const objects = extractObjects(decoded.results[1])
  saveToDatabase(objects)
  
  const playerData = extractPlayerData(decoded.results[2])
  updatePlayerInfo(playerData)
  
  if (shouldNotify(objects)) {
    sendDiscord(objects)
    sendChat(objects)
  }
}
```

**After (decoupled with priorities):**
```javascript
// Packet capture just enqueues jobs
const response = await fetch(url, { body })
const decoded = multiDecodeMsgPack2(response)

// Enqueue all jobs based on packet content
if (decoded.results[0]?.[0] === 312) {
  // Normal priority - database save can wait
  jobQueue.add('extract-objects', {
    packetData: decoded.results[1],
    kingdom: PACKET312.kingdom,
    timestamp: Date.now()
  })
  
  jobQueue.add('extract-player', {
    packetData: decoded.results[2],
    timestamp: Date.now()
  })
}
```
```

### 4. Job Handlers

```javascript
// Extract Objects Job (NORMAL priority)
jobQueue.register('extract-objects', async (payload) => {
  const { packetData, kingdom, timestamp } = payload
  const objects = extractObjects(packetData)
  
  // Save to database
  for (const obj of objects) {
    await saveObject({ ...obj, kingdom, timestamp })
  }
  
  // Check if any object matches notification rules
  const notifyObjects = objects.filter(obj => 
    notificationRules.shouldNotify(obj)
  )
  
  // Notifications are HIGH priority (important but user can wait)
  if (notifyObjects.length > 0) {
    jobQueue.addHigh('notification', {
      type: 'object-spotted',
      objects: notifyObjects
    })
  }
  
  return { count: objects.length }
})

// Send Packet Job (CRITICAL priority for button clicks)
jobQueue.register('send-packet', async (payload) => {
  const { url, opcode, data, headers, priority } = payload
  
  const encoded = encodeMsgPack2MultiFragments([data])
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: encoded
  })
  
  const buffer = await response.arrayBuffer()
  const decoded = multiDecodeMsgPack2(new Uint8Array(buffer))
  
  // Process response with NORMAL priority (can wait)
  if (decoded.results[0]?.[0] === 312) {
    jobQueue.add('extract-objects', {
      packetData: decoded.results[1],
      kingdom: payload.kingdom,
      timestamp: Date.now()
    })
  }
  
  return decoded
})

// Notification Job (HIGH priority)
jobQueue.register('notification', async (payload) => {
  const { type, objects } = payload
  
  const results = []
  
  // Discord webhook - HIGH priority
  if (config.discordWebhook) {
    results.push(await sendDiscordWebhook(config.discordWebhook, {
      type,
      objects
    }))
  }
  
  // In-game chat - HIGH priority
  if (config.sendChatMessages) {
    results.push(jobQueue.addHigh('send-chat', {
      channel: config.chatChannel,
      message: formatNotificationMessage(type, objects)
    }))
  }
  
  return results
})
```
```

### 5. Timer-Based Jobs (LOW Priority)

```javascript
const PRIORITY = {
  CRITICAL: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25,
  IDLE: 10
}

class TimerManager {
  constructor(jobQueue) {
    this.jobQueue = jobQueue
    this.timers = new Map()
  }

  scheduleScanKingdom(kingdomId, intervalMs = 60000) {
    // Clear existing timer for this kingdom
    if (this.timers.has(kingdomId)) {
      clearInterval(this.timers.get(kingdomId))
    }

    const timerId = setInterval(() => {
      const url = kingdomUrls[kingdomId]
      const payload = buildPacket312Payload()
      
      // LOW priority - timer jobs don't block user actions
      this.jobQueue.addLow('scan-kingdom', {
        url,
        opcode: 312,
        data: payload,
        headers: defaultHeaders,
        kingdom: kingdomId,
        triggeredBy: 'timer'
      })
      
    }, intervalMs)
    
    this.timers.set(kingdomId, timerId)
    console.log(`Scheduled scan for kingdom ${kingdomId} every ${intervalMs}ms`)
  }

  stopScan(kingdomId) {
    if (this.timers.has(kingdomId)) {
      clearInterval(this.timers.get(kingdomId))
      this.timers.delete(kingdomId)
      console.log(`Stopped scan for kingdom ${kingdomId}`)
    }
  }
}

// Register scan-kingdom handler
jobQueue.register('scan-kingdom', async (payload) => {
  // Same logic as send-packet but identified as timer-triggered
  return jobQueue.handlers.get('send-packet')(payload)
})
```

### 6. API Endpoints

```javascript
// Trigger IMMEDIATE scan (CRITICAL priority - user clicked button)
app.post('/api/scanKingdom', (req, res) => {
  const { kingdom } = req.body
  
  const jobId = jobQueue.addCritical('send-packet', {
    url: kingdomUrls[kingdom],
    opcode: 312,
    data: buildPacket312Payload(kingdom),
    headers: defaultHeaders,
    kingdom
  })
  
  res.json({ success: true, message: 'Scan queued', jobId })
})

// Start timer scan (LOW priority - background)
app.post('/api/timer/start', (req, res) => {
  const { kingdom, interval } = req.body
  timerManager.scheduleScanKingdom(kingdom, interval)
  res.json({ success: true })
})

app.post('/api/timer/stop', (req, res) => {
  const { kingdom } = req.body
  timerManager.stopScan(kingdom)
  res.json({ success: true })
})

// Send chat message (HIGH priority - user initiated)
app.post('/api/sendChat', (req, res) => {
  const { channel, message } = req.body
  
  const jobId = jobQueue.addHigh('send-chat', {
    channel,
    message
  })
  
  res.json({ success: true, jobId })
})

// Job status
app.get('/api/jobs', (req, res) => {
  res.json(jobQueue.getStatus())
})

// Cancel pending jobs
app.post('/api/jobs/cancel', (req, res) => {
  const { type, kingdom } = req.body
  
  const cancelled = jobQueue.cancel(job => {
    if (type && job.type !== type) return false
    if (kingdom && job.payload.kingdom !== kingdom) return false
    return true
  })
  
  res.json({ success: true, cancelled })
})
```

### 7. Benefits

1. **Separation of Concerns**: Packet capture, processing, and notification are independent
2. **Parallel Execution**: Multiple jobs can run simultaneously
3. **Retry Logic**: Failed jobs automatically retry with backoff
4. **Timer Support**: Easy to add periodic scans
5. **Extensibility**: Add new job types without changing existing code
6. **Testability**: Each handler can be tested independently
7. **Backpressure**: Queue naturally limits concurrent operations

### 8. Optional: Job Persistence

For production, consider persisting jobs to Redis/database:
- Recover jobs after server restart
- Distribute jobs across multiple server instances
- Monitor job metrics

```javascript
// Example: Add persistence layer
class PersistedJobQueue extends JobQueue {
  constructor(db) {
    super()
    this.db = db
  }

  async add(type, payload) {
    const job = await super.add(type, payload)
    await this.db.jobs.insert(job) // Persist to DB
    return job
  }

  async loadPending() {
    const pending = await this.db.jobs.find({ status: 'pending' })
    this.queue.push(...pending)
    this.process()
  }
}
```

## File Structure (Proposed)

```
capturePackets/
├── server.js              # Express routes, packet capture
├── jobs/
│   ├── JobQueue.js         # Core queue system
│   ├── TimerManager.js     # Timer-based job scheduling
│   └── handlers/
│       ├── extractObjects.js
│       ├── extractPlayer.js
│       ├── sendPacket.js
│       └── notification.js
├── services/
│   ├── database.js         # Object/player persistence
│   ├── discord.js          # Discord webhook service
│   └── chat.js             # In-game chat service
└── config/
    └── jobs.js             # Job configurations
```

## Next Steps (If You Want Implementation)

1. Create `PriorityJobQueue` class with priority levels
2. Create job handlers for each type
3. Refactor packet capture to use queue
4. Add `TimerManager` for periodic scans (LOW priority)
5. Add notification handlers (Discord, chat) - HIGH priority
6. Add API endpoints for job management
7. Add concurrent job limiting (don't overwhelm server)
