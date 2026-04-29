const { getRedis } = require('../../lib/redis')
const { sendMessage } = require('../chatSender')
const { loadEnvFile } = require('node:process')

loadEnvFile()

const CHAT_CHANNEL_URL = process.env.CHAT_CHANNEL_URL || ''

let chatIndex = 0

async function gameNotificationHandler(job) {
  const { object, message, toMainChannel = false } = job.data

  console.log(`[Notification-Game] `, message, object)

  const { k, x, y, staticId } = object

  if (toMainChannel) {
    const redisClient = getRedis()
    const activeChatChannel = await redisClient.get(ACTIVE_CHAT_CHANNEL)

    const chatChannel = activeChatChannel || CHAT_CHANNEL_URL

    if (!chatChannel) {
      console.log('[ChatSender] No active chat channel')
      return { success: false, error: 'no active channel' }
    }

    sendMessage(chatChannel, message, { k: kingdom, x, y }, staticId)
  } else {
    const channelUrl = await getChannel()
    if (!channelUrl) return { success: false, error: 'no channel url' }
    sendMessage(channelUrl, message, { k: kingdom, x, y }, staticId)
  }

  return {
    success: true
  }
}

async function getChannel() {
  const channels = await chatChannels.getChannels()
  if (!channels || channels.length === 0) return null

  if (chatIndex > channels.length) chatIndex = 0
  const channelUrl = channels[chatIndex].channelUrl
  chatIndex = (chatIndex + 1) % channels.length

  return channelUrl
}

module.exports = {
  gameNotificationHandler
}
