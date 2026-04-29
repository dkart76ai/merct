const { loadEnvFile } = require('node:process')
loadEnvFile()

let globalPage = null
const channelUrl = process.env.CHAT_CHANNEL_URL || ''
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || ''
const staticIdRedis = require('../lib/staticIdRedis')
const { getRedis } = require('../lib/redis.js')

const ACTIVE_CHAT_CHANNEL = 'CONFIG:ACTIVE_CHAT_CHANNEL'

console.log('[ChatSender] Initialized', DISCORD_WEBHOOK, channelUrl)

function setChatPage(page) {
  globalPage = page
  console.log('[ChatSender] Page set')
}

function getChatPage() {
  return globalPage
}

async function notifyDiscord(msg = '', coord = null, staticId) {
  if (!DISCORD_WEBHOOK) {
    console.log('[ChatSender] No DISCORD_WEBHOOK configured')
    return
  }

  try {
    let message = msg
    if (coord) {
      const dbEntry = await staticIdRedis.getStaticIdData(staticId)

      message = `K:${coord.k} X:${coord.x} Y:${coord.y} (${dbEntry?.name || ''})`
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

async function sendMessage(channelUrl, msg = '', coord = null, staticId = 400) {
  if (!channelUrl) return

  let page = getChatPage()

  if (!page) {
    console.log('no page')
    return
  }

  let data = ''
  let message = msg
  if (!!coord) {
    const dbEntry = await staticIdRedis.getStaticIdData(staticId)

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
    message = `[${msg}] /%0%/`
  }

  const result = await page.evaluate(
    async ({ channelUrl, data, message }) => {
      try {
        // use game's own SendBirdHelper — no new connection needed
        if (!window.SendBirdHelper?.sb) {
          console.log('no sendbird')
          return { success: false, error: 'SendBirdHelper not ready' }
        }
        const state = window.SendBirdHelper?.sb.connectionState
        if (state !== 'OPEN') {
          console.log('chat not connected')
          return { success: false, error: 'SendBirdHelper not ready', state }
        }
        console.log('dentro chat channel', channelUrl)

        // //TODO: testing hide channel :D
        // var foundIndex = window.SendBirdHelper.channelsList.findIndex(function (ch, index, array) {
        //   return channelUrl == ch.url
        // })
        // if (foundIndex != -1) {
        //   window.SendBirdHelper.channelsList.splice(foundIndex, 1)
        // }

        // find channel in existing list or fetch it
        let channel = window.SendBirdHelper.channelsList.find(c => c.url === channelUrl)
        if (!channel) {
          console.log('fetching channel from SB', channelUrl)
          channel = await window.SendBirdHelper.sb.groupChannel.getChannel(channelUrl)
        }

        if (channel) {
          channel.markAsRead(null)
          await channel.sendUserMessage({
            message,
            customType: 'user',
            data
          })

          console.log('message sent')
        } else {
          console.log('no channel found, maybe is hidden ^_^')
        }
        return { success: true }
      } catch (err) {
        console.error(`[chat-sender] Sendmessage failed:`, err.message)

        return { success: false, error: err.message }
      }
    },
    { channelUrl, data, message }
  )
}

module.exports = {
  setChatPage,
  getChatPage,
  sendMessage,
  notifyDiscord
}
