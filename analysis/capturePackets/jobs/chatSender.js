const { loadEnvFile } = require('node:process')
loadEnvFile()

let globalPage = null
const channelUrl = process.env.CHAT_CHANNEL_URL || ''
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || ''
const staticIdDB = require('../staticId.js')

console.log('[ChatSender] Initialized', DISCORD_WEBHOOK, channelUrl)

function setChatPage(page) {
  globalPage = page
  console.log('[ChatSender] Page set')
}

function getChatPage() {
  return globalPage
}

async function notifyDiscord(msg = '', coord = null) {
  if (!DISCORD_WEBHOOK) {
    console.log('[ChatSender] No DISCORD_WEBHOOK configured')
    return
  }

  try {
    let message = msg
    if (coord) {
      const dbEntry = staticIdDB.getStaticIdData(staticId)
      message = `K:${coord.k} X:${coord.x} Y:${coord.y} ${dbEntry.name || ''} (${msg})`
    }
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message
      })
    })
  } catch (error) {
    console.error(`[chat-sender] Discord notify failed:`, error.message)
  }
}

async function sendMessage(msg = '', coord = null, staticId = 400) {
  if (!channelUrl) {
    console.log('[ChatSender] No channelUrl configured')
    return
  }

  const page = getChatPage()
  if (!page) return

  let data = ''
  let message = msg
  if (!!coord) {
    const dbEntry = staticIdDB.getStaticIdData(staticId)

    data = JSON.stringify({
      subs: {
        '/%0%/': {
          type: 'coord',
          entryType: dbEntry.entryType || 'poi',
          x: coord?.x ?? 0,
          y: coord?.y ?? 0,
          realmId: coord?.k ?? 0,
          staticId,
          name: dbEntry.name || '',
          v: 1
        }
      }
    })
    message = '/%0%/'
  }

  const result = await page.evaluate(
    async ({ channelUrl, data, message }) => {
      try {
        // use game's own SendBirdHelper — no new connection needed
        if (!window.SendBirdHelper?.sb) {
          return { success: false, error: 'SendBirdHelper not ready' }
        }
        const state = window.SendBirdHelper?.sb.connectionState
        if (state !== 'OPEN') {
          console.log('chat not connected')
          return { success: false, error: 'SendBirdHelper not ready', state }
        }

        // find channel in existing list or fetch it
        let channel = window.SendBirdHelper.channelsList.find(c => c.url === channelUrl)
        if (!channel) {
          channel = await window.SendBirdHelper.sb.groupChannel.getChannel(channelUrl)
        }
        const msg = await channel.sendUserMessage({
          message,
          customType: 'user',
          data
        })
        return { success: true, messageId: msg.messageId }
      } catch (e) {
        console.error(`[chat-sender] Discord sendmessage failed:`, error.message)

        return { success: false, error: e.message }
      }
    },
    { channelUrl: config.channelUrl, data, message }
  )
}

module.exports = {
  setChatPage,
  getChatPage,
  sendMessage,
  notifyDiscord
}
