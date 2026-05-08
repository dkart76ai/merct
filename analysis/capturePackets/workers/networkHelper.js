const HEADERS = {
  'Content-Type': 'application/octet-stream',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Referer: 'https://totalbattle.com/'
}

async function sendPacket(url, payload) {
  if (!url) throw new Error(`no url param`)
  if (!payload) throw new Error(`no payload param`)

  const response = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: payload
  })

  // console.log('[getPlayerInfo402] respnse', response402)

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${response.statusText}`)
  }

  // Get response buffer
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  return bytes
}

function buildPacket41000Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[41000, randomSeq, [[tokenBigInt], token], ''], [2]]

  return packetData
}

function buildPacket312Payload(tiles, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const zeros = new Array(tiles.length).fill(0)
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [312, randomSeq, [[tokenBigInt], token], ''],
    [tiles, zeros, [], []]
  ]

  return packetData
}

function buildPacket313Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[313, randomSeq, [[tokenBigInt], token], ''], []]

  return packetData
}

function buildPacket22Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [22, randomSeq, [[tokenBigInt], token], ''],
    [1, 1]
  ]

  return packetData
}

function buildPacket402Payload(playerIds, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [402, randomSeq, [[tokenBigInt], token], ''],
    [playerIds.map(p => [BigInt(p)])]
  ]

  return packetData
}

function buildPacket24301Payload(playerId, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[24301, randomSeq, [[tokenBigInt], token], ''], [[playerId]]]

  return packetData
}

function buildPacket601Payload(playerId, tokenBigInt, token) {
  //something with resources maybe
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [24301, randomSeq, [[tokenBigInt], token], ''],
    [[[[playerId], 0, 2147483647]]]
  ]

  return packetData
}

function buildPacket213Payload(tokenBigInt, token) {
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [
    [213, randomSeq, [[tokenBigInt], token], ''],
    [[0]] // <-- note: this is [[0]], not []
  ]
  return packetData
}

function buildPacket314Payload(tokenBigInt, token) {
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[314, randomSeq, [[tokenBigInt], token], ''], []]
  return packetData
}
function buildPacket318Payload(tokenBigInt, token) {
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[318, randomSeq, [[tokenBigInt], token], ''], []]
  return packetData
}

function buildPacket15100Payload(tokenBigInt, token) {
  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[15100, randomSeq, [[tokenBigInt], token], ''], []]
  return packetData
}

module.exports = {
  sendPacket,
  buildPacket41000Payload,
  buildPacket312Payload,
  buildPacket313Payload,
  buildPacket22Payload,
  buildPacket402Payload,
  buildPacket24301Payload,
  buildPacket213Payload,
  buildPacket314Payload,
  buildPacket318Payload,
  buildPacket15100Payload,
  buildPacket601Payload
}

// styletext
//  * 'reset', 'bold', 'dim', 'italic', 'underline',
//  * 'blink', 'inverse', 'hidden', 'strikethrough', 'doubleunderline',
//  * 'framed', 'overlined',
//  *
//  * 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',  'gray', 'redBright',
//  * 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright', '
//  *
//  * 'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite',
//  * 'bgGray', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'
