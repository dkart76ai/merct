const { multiDecodeMsgPack2, encodeMsgPack2MultiFragments } = require('../../message-pack/messagePack')
const { PRIORITY } = require('../PriorityJobQueue')

const DEFAULT_HEADERS = {
  'Content-Type': 'application/octet-stream',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  'Referer': 'https://totalbattle.com/'
}

async function sendPacketHandler(payload) {
  const {
    url,
    data,
    headers = DEFAULT_HEADERS,
    kingdom,
    triggeredBy = 'manual',
    onSuccess = null,
    onError = null
  } = payload

  console.log(`[SendPacket] Sending packet to ${url} (triggeredBy: ${triggeredBy})`)

  try {
    // Encode the packet
    const encoded = encodeMsgPack2MultiFragments(data)

    // Send to server
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: encoded
    })

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`)
    }

    // Get response buffer
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    console.log(`[SendPacket] Received ${bytes.length} bytes from server`)

    if (bytes.length < 8) {
      throw new Error(`Response too small: ${bytes.length} bytes`)
    }

    // Decode response
    const decoded = multiDecodeMsgPack2(bytes)

    if (!decoded.results || decoded.results.length === 0) {
      throw new Error('No results in decoded response')
    }

    const result = {
      success: true,
      triggeredBy,
      kingdom,
      responseLength: bytes.length,
      decoded: decoded.results,
      timestamp: Date.now()
    }

    console.log(`[SendPacket] Success - ${decoded.results.length} objects in response`)

    // Return data for chaining handlers
    return {
      ...result,
      nextJobs: [
        { type: 'extract-objects', payload: { packetData: decoded.results, kingdom, triggeredBy } },
        { type: 'extract-player', payload: { packetData: decoded.results, triggeredBy } }
      ]
    }

  } catch (error) {
    console.error(`[SendPacket] Error:`, error.message)
    
    return {
      success: false,
      triggeredBy,
      kingdom,
      error: error.message,
      timestamp: Date.now()
    }
  }
}

module.exports = {
  sendPacketHandler,
  DEFAULT_HEADERS
}
