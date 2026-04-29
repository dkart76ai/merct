const { notifyDiscord } = require('../chatSender')

async function discordNotificationHandler(data) {
  const { object, message } = data

  console.log(`[Notification-Discord] `, message, object)

  const { k, x, y, staticId } = object

  notifyDiscord(message, { k, x, y })

  return {
    success: true
  }
}

module.exports = {
  discordNotificationHandler
}
