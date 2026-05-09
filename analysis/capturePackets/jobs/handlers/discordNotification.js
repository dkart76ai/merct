const { notifyDiscord } = require('../chatSender')

//? MUST be async, bullmq handles it
async function discordNotificationHandler(job) {
  const { object = {}, message = '', isBatch = false, content = '', count = 0 } = job.data
  // console.log('[discordNotificationHandler] job', job.data)

  if (isBatch) {
    if (content !== '') {
      notifyDiscord(content)
      // console.log(`[Notification-Discord] batch`, content)
    }
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
