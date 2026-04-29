const { notifyDiscord } = require('../chatSender')

async function discordNotificationHandler(job) {
  const { object = {}, message = '', isBatch = false, content = '', count = 0 } = job.data

  if (isBatch) {
    notifyDiscord(content)
  } else {
    console.log(`[Notification-Discord] `, message, object)

    const { k, x, y, staticId } = object

    notifyDiscord(message, { k, x, y }, staticId)
  }
  return {
    success: true
  }
}

module.exports = {
  discordNotificationHandler
}
