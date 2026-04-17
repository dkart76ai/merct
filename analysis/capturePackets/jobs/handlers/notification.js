const { getRedis } = require('../redis')

const NOTIFICATION_HISTORY = 'notifications:history'

async function sendDiscordWebhook(webhookUrl, data) {
  const { type, objects } = data

  try {
    const embed = {
      title: `Total Battle Alert: ${type}`,
      color: type === 'player-spotted' ? 15105570 : 3447003,
      fields: objects.slice(0, 5).map(obj => ({
        name: obj.name || `Unknown (${obj.staticId})`,
        value: `Level: ${obj.level || '?'} | Location: (${obj.x}, ${obj.y})`
      })),
      footer: {
        text: `Triggered at ${new Date().toISOString()}`
      }
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed]
      })
    })

    if (!response.ok) {
      throw new Error(`Discord returned ${response.status}`)
    }

    console.log(`[Notification] Discord webhook sent successfully`)
    return { success: true, platform: 'discord' }

  } catch (error) {
    console.error(`[Notification] Discord webhook error:`, error.message)
    return { success: false, platform: 'discord', error: error.message }
  }
}

async function sendChatMessage(data) {
  const { channel, message } = data

  try {
    console.log(`[Notification] Chat message to ${channel}: ${message}`)
    return { success: true, platform: 'chat', channel }
  } catch (error) {
    console.error(`[Notification] Chat error:`, error.message)
    return { success: false, platform: 'chat', error: error.message }
  }
}

function formatNotificationMessage(type, objects) {
  if (objects.length === 0) return ''
  
  const names = objects.map(o => o.name || `ID:${o.staticId}`).join(', ')
  const location = objects[0] ? `(${objects[0].x}, ${objects[0].y})` : ''
  
  return `[Alert] ${type}: ${names} ${location}`
}

async function notificationHandler(data) {
  const { type, objects, triggeredBy, config = {} } = data

  console.log(`[Notification] Processing ${type} for ${objects.length} objects`)

  const results = []

  // Discord webhook
  if (config.discordWebhook) {
    const discordResult = await sendDiscordWebhook(config.discordWebhook, { type, objects })
    results.push(discordResult)
  }

  // In-game chat
  if (config.chatChannel) {
    const message = formatNotificationMessage(type, objects)
    const chatResult = await sendChatMessage({ channel: config.chatChannel, message })
    results.push(chatResult)
  }

  // Store in Redis for history
  try {
    const redis = getRedis()
    const notificationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      objectCount: objects.length,
      triggeredBy,
      results,
      createdAt: Date.now()
    }
    
    await redis.zadd(NOTIFICATION_HISTORY, Date.now(), JSON.stringify(notificationRecord))
    
    // Keep only last 1000 notifications
    const count = await redis.zcard(NOTIFICATION_HISTORY)
    if (count > 1000) {
      await redis.zremrangebyrank(NOTIFICATION_HISTORY, 0, count - 1001)
    }
    
  } catch (error) {
    console.error(`[Notification] Redis history error:`, error.message)
  }

  const successCount = results.filter(r => r.success).length

  return {
    success: successCount > 0,
    type,
    objectCount: objects.length,
    results,
    timestamp: Date.now()
  }
}

module.exports = {
  notificationHandler,
  sendDiscordWebhook,
  sendChatMessage,
  formatNotificationMessage
}
