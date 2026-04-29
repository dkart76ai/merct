const { notifyDiscord } = require('../chatSender')

async function discordNotificationHandler(job) {
  const { object, message } = job.data

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
