const { getRedis } = require('../redis')
const { sendMessage, notifyDiscord } = require('../chatSender')

async function notificationHandler(data) {
  const { objects, message } = data

  console.log(`[Notification] `)
  for (const obj of objects) {
    const { kingdom, x, y, staticId } = obj

    notificationHandler(message, { k: kingdom, x, y })
    sendMessage(message, { k: kingdom, x, y }, staticId)
  }
  return {
    success: true
  }
}

module.exports = {
  notificationHandler
}
