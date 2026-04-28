const { getRedis } = require('./redis')

const CHANNELS_KEY = 'chat:channels'

async function getChannels() {
  const r = getRedis()
  const data = await r.get(CHANNELS_KEY)
  if (!data) return []
  try {
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function setChannels(channels) {
  const r = getRedis()
  await r.set(CHANNELS_KEY, JSON.stringify(channels))
}

async function addChannel(channelData) {
  const channels = await getChannels()
  channels.push(channelData)
  await setChannels(channels)
  return channels
}

async function removeChannel(index) {
  const channels = await getChannels()
  const idx = parseInt(index)
  if (idx >= 0 && idx < channels.length) {
    channels.splice(idx, 1)
    await setChannels(channels)
  }
  return channels
}

module.exports = {
  getChannels,
  setChannels,
  addChannel,
  removeChannel
}