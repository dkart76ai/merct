const { scanKingdomHandler } = require('./scanKingdom')
const { scanRefreshPlayerInfoHandler } = require('./scanRefreshPlayerInfo')
const { scanRefreshPlayerFlagsHandler } = require('./scanRefreshPlayerFlags')
// const { extractObjectsHandler } = require('./extractObjects')
// const { saveObjectsHandler } = require('./saveObjects')
const { findObjectsHandler } = require('./findObjects')
const { discordNotificationHandler } = require('./discordNotification')
const { gameNotificationHandler } = require('./gameNotification')
// const { processPacketHandler } = require('./processPacket')

module.exports = {
  scanKingdomHandler,
  scanRefreshPlayerInfoHandler,
  scanRefreshPlayerFlagsHandler,
  // extractObjectsHandler,
  // saveObjectsHandler,
  findObjectsHandler,
  discordNotificationHandler,
  gameNotificationHandler
  // processPacketHandler
}
