const { getRedis } = require('../redis')
const { sendMessage, notifyDiscord } = require('../chatSender')
const staticIdDB = require('../../staticId.js')

async function notificationHandler(data) {
  const { objects } = data

  console.log(`[Notification] `)
  for (const obj of objects) {
    const { kingdom, x, y, staticId } = obj
    const dbEntry = staticIdDB.getStaticIdData(staticId)

    notificationHandler(dbEntry.name || 'noname', { k: kingdom, x, y })
    sendMessage(
      dbEntry.name || 'noname',
      { k: kingdom, x, y },
      staticId,
      dbEntry.entryType || 'poi'
    )
  }
  return {
    success: true
  }
}

module.exports = {
  notificationHandler
}
