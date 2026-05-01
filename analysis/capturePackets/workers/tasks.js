const { styleText } = require('node:util')

console.log(styleText('green', 'This is green!'))
const { parentPort } = require('worker_threads')
const { Piscina } = require('piscina')
const path = require('path')
const { kingdomUrls } = require('../lib/kingdomUrls.js')
const {
  getRequestHeader,
  multiDecodeMsgPack2,
  encodeMsgPack2MultiFragments,
  encodeBase64,
  scanPacket312,
  scanPacket402
} = require('../lib/messagePack.js')
const staticIdRedis = require('../lib/staticIdRedis')
const { getRedis } = require('../lib/redis')
const { saveObjects, savePlayers, getPlayersIdFromKingdom } = require('../lib/database')

// const POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE) || 4

//---------------------------------
// Task handlers for Piscina
//---------------------------------

const generateArrays = (start = 9, end = 2396, step = 50, groupSize = 12) => {
  const allNumbers = []
  const used = new Set()

  for (let i = start; i <= end; i++) {
    if (used.has(i)) continue
    for (let j = 0; j < 4; j++) {
      let num = i + j * step
      if (num <= end && !used.has(num)) {
        allNumbers.push(num)
        used.add(num)
      }
    }
  }

  const result = []
  for (let i = 0; i < allNumbers.length; i += groupSize) {
    result.push(allNumbers.slice(i, i + groupSize))
  }

  return result
}

const processPacket = async ({ request, response }) => {
  if (!request || !response) throw new Error('No  data provided')

  try {
    // const bytes = decodeBase64(base64)
    // const { results: decodedRequest } = multiDecodeMsgPack2(request)
    // const { results: decodedResponse } = multiDecodeMsgPack2(response)

    // const opCode = getFirstValue(decodedResponse)
    const { opCode, userId, token } = getRequestHeader(request)
    // console.log('processpacket', opCode, userId, token)
    // console.log(styleText('green', 'opcode ' + opCode))
    // let tileIds = []
    // if (opCode === 312) {
    //   tileIds = decodedRequest[1]
    // }
    const redisClient = getRedis()

    // any packets bring those data, but only save on 312, to not saturate redis with requests
    if (opCode === 312) {
      await redisClient.set('myPlayerId:BigInt', userId.toString(), 'EX', 86400)
      await redisClient.set('mysession:token2:Uint8Array', Buffer.from(token), 'EX', 86400)
    }

    if (opCode === 312) {
      extractDataFrom312(response)
    }

    if (opCode === 402) {
      extractDataFrom402(response)
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// scan kingdom -----
function buildPacket402Payload(playerIds, tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[402, randomSeq, [[tokenBigInt], token], ''], [playerIds.map(p => [p])]]

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

async function extractDataFrom402(response) {
  console.log(styleText('yellow', 'extractDataFrom402'))
  const { players23 } = scanPacket402(response)
  console.log('scanPacket402: players23:', players23.length)

  // save players
  if (players23.length > 0) {
    //prepare data to send to database
    const players = players23.map(p => {
      return {
        objectId: String(p.objectId),
        playerId: String(p.objectId),
        progressId: p.progressId,
        playerName: p.playerName,
        country: p.country,
        heroLevel: p.heroLevel,
        cityLevel: p.cityLevel,
        might: p.might,
        clanId: String(p.clanId),
        clanName: p.clanName,
        kingdom: p.kingdom,
        x: p.x,
        y: p.y,
        gold: p.gold,
        timezone: p.timezone
      }
    })
    try {
      const result = savePlayers(players)
      console.log(`[tasks][SavePlayers] `, result)
    } catch (e) {
      console.error('[tasks][SavePlayers][extractDataFrom402', e.message)
    }
  }

  return {
    success: true,
    players23
  }
}

async function extractDataFrom312(response, shouldSaveObjects = false) {
  console.log(styleText('red', 'extractDataFrom312'))

  const { players42, objects12 } = scanPacket312(response)
  console.log('scanPacket312: players42:', players42.length)
  console.log('scanPacket312: objects12:', objects12.length)

  objects12.forEach(async o => {
    const dbEntry = await staticIdRedis.getStaticIdData(o.staticId)

    const isComplete = dbEntry && dbEntry.name && dbEntry.level != null && dbEntry.level >= 0

    // NOTE : dont delete static id updater
    if (!isComplete) {
      // await staticIdRedis.addOrUpdateStaticId(o.staticId, {
      //   level: o.level
      // })

      console.log(
        `[worker-task] found staticid:${o.staticId}, ${o.kingdom},${o.x},${o.y}  level:${o.level}`
      )
      console.log(`[worker-task] on db  ${dbEntry?.name || 'unknown'} level:${dbEntry.level}`)

      parentPort.postMessage({
        cmd: 'sendmsg',
        reason: 'missing data',
        coords: { k: o.kingdom, x: o.x, y: o.y },
        staticId: o.staticId
      })
    }

    if (o.staticId === 400) {
      parentPort.postMessage({
        cmd: 'merc',
        reason: '',
        coords: { k: o.kingdom, x: o.x, y: o.y },
        staticId: o.staticId
      })
    }

    // const dragonMounds = [199, 200, 201, 202, 203]
    // const wellSprings = [208, 209, 210, 211, 212]
    // const villages = [34, 521, 522, 523, 524, 525, 40025, 40449, 40451]
    // const allStaticIds = [...dragonMounds, ...wellSprings, ...villages]
    // if (allStaticIds.includes(o.staticId)) {
    //   //village lvl 25
    //   parentPort.postMessage({
    //     cmd: 'poi',
    //     reason: '',
    //     coords: { k: o.kingdom, x: o.x, y: o.y },
    //     staticId: o.staticId
    //   })
    // }
    // END NOTE
  })

  //populate objects with name from redis
  const objectsPromises = objects12.filter(Boolean).map(async o => {
    const dbEntry = await staticIdRedis.getStaticIdData(o.staticId)
    return {
      ...o,
      name: dbEntry?.name || 'unknown'
    }
  })

  // 2. Esperamos a que TODAS se resuelvan
  const objs = await Promise.all(objectsPromises)

  if (shouldSaveObjects) {
    if (objs.length > 0) {
      console.log('saveobject', objs[0])
      const result = saveObjects(objs)
      console.log(
        `[tasks][SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
      )
    }
  }

  // save players
  if (players42.length > 0) {
    //prepare data to send to database
    const players = players42.map(p => {
      return {
        objectId: String(p.objectId),
        playerId: String(p.objectId),
        clanId: String(p.clanId),
        kingdom: p.kingdom,
        cityLevel: p.cityLevel,
        kingdom: p.sourceKingdom,
        x: p.sourceX,
        y: p.sourceY,
        hasShield: p.hasShield ? 1 : 0,
        timestamp: p.timestamp
      }
    })

    try {
      const result = savePlayers(players)
      console.log(`[tasks][SavePlayers] `, result)
    } catch (e) {
      console.error('[tasks][SavePlayers][extractDataFrom402', e.message)
    }
  }

  return {
    success: true,
    players42,
    objects12
  }
}

function generatePlayerArrays(playersIds) {
  const groupedPlayers = []

  while (playersIds.length > 0) {
    // Generar un tamaño aleatorio entre 10 y 20
    const randomSize = Math.floor(Math.random() * (20 - 10 + 1)) + 10

    // .splice extrae los elementos y modifica el array original
    const group = playersIds.splice(0, randomSize)

    groupedPlayers.push(group)
  }

  return groupedPlayers
}

async function getPlayerInfo402(kingdom) {
  // get player detail from specific kingdom
  // get players Id from DB filter for kingdom
  // build array of players ids, grouped on 20, or probably random from 10 to 20
  // generate packet with those player id
  // send to server
  // extract and save data from result

  console.log('task, getPlayerInfo402', { kingdom })

  if (!kingdom) {
    console.log('[getPlayerInfo402] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  const redisClient = getRedis()

  const _token1 = await redisClient.get('myPlayerId:BigInt')
  if (!_token1) {
    throw new Error('no session token1')
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    throw new Error('no session token2')
  }

  const url = kingdomUrls[kingdom]
  if (!url) {
    throw new Error('invalid kingdom')
  }

  const HEADERS = {
    'Content-Type': 'application/octet-stream',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
    Referer: 'https://totalbattle.com/'
  }

  console.log(`[getPlayerInfo402] Sending packets to ${url}  `)
  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    const playerIdsDB = getPlayersIdFromKingdom(kingdom)
    // console.log('[getPlayerInfo402] playersIds', playerIdsDB)

    const playersArr = playerIdsDB.map(p => Number(p.playerId))
    const playerIdsArray = generatePlayerArrays(playersArr)

    //TODO: remove line below
    const playerIds = playerIdsArray[0]

    let players = 0
    // for (const playerIds of playerIdsArray) {
    const packetData402 = buildPacket402Payload(playerIds, token1, token2)

    // Encode the packet
    const encoded402 = encodeMsgPack2MultiFragments(packetData402)
    console.log('encoded request base64', encodeBase64(encoded402))

    // Send to server
    console.log(`[getPlayerInfo402] Sending packet402 to ${url}  `)
    const response402 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded402
    })

    console.log('respnse', response402)

    if (!response402.ok) {
      throw new Error(`Server returned ${response402.status}: ${response402.statusText}`)
    }

    // Get response buffer
    const buffer402 = await response402.arrayBuffer()
    const bytes402 = new Uint8Array(buffer402)

    console.log('encoded result base64', encodeBase64(bytes402))

    const result = await extractDataFrom402(bytes402)
    console.log('[getPlayerInfo402] extract dataaaaaaaaaaa', result.players23.length)

    players += result.players23?.length || 0
    // }

    console.log(`[getPlayerInfo402] Success  players ${players} `)
    return { success: true, players }
  } catch (error) {
    console.error(`[getPlayerInfo402] Error:`, error.message)
  }
}

async function scanKingdom({ kingdom, shouldSaveObjects = false }) {
  console.log('task, scankingdom', { kingdom, shouldSaveObjects })

  if (!kingdom) {
    console.log('[scanKingdom:worker] No kingdom provided')
    return { success: false, error: 'no kingdom' }
  }

  const redisClient = getRedis()

  const _token1 = await redisClient.get('myPlayerId:BigInt')
  if (!_token1) {
    throw new Error('no session token1')
  }

  const _token2 = await redisClient.getBuffer('mysession:token2:Uint8Array')
  if (!_token2) {
    throw new Error('no session token2')
  }

  const url = kingdomUrls[kingdom]
  if (!url) {
    throw new Error('invalid kingdom')
  }

  console.log(`[ScanKingdom] Sending packets to ${url}  `)

  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    //---------- send packet 313
    const packetData313 = buildPacket313Payload(token1, token2)

    // Encode the packet
    const encoded313 = encodeMsgPack2MultiFragments(packetData313)

    const HEADERS = {
      'Content-Type': 'application/octet-stream',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      Referer: 'https://totalbattle.com/'
    }
    // Send to server
    console.log(`[ScanKingdom] Sending packet313 to ${url}  `)
    const response313 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded313
    })

    if (!response313.ok) {
      throw new Error(`packet313: Server returned ${response313.status}: ${response313.statusText}`)
    }

    //---------- send packet 22
    const packetData22 = buildPacket22Payload(token1, token2)

    // Encode the packet
    const encoded22 = encodeMsgPack2MultiFragments(packetData22)

    // Send to server
    console.log(`[ScanKingdom] Sending packet22 to ${url}  `)
    const response22 = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: encoded22
    })

    if (!response22.ok) {
      throw new Error(`packet22: Server returned ${response22.status}: ${response22.statusText}`)
    }

    // Get response buffer
    // const buffer313 = await response313.arrayBuffer()
    // const bytes313 = new Uint8Array(buffer313)

    //------ send packet 312

    const tilesArray = generateArrays(9, 2396, 50, 12)

    let objects = 0
    let players = 0
    for (const tiles of tilesArray) {
      const packetData312 = buildPacket312Payload(tiles, token1, token2)

      // Encode the packet
      const encoded312 = encodeMsgPack2MultiFragments(packetData312)

      // Send to server
      console.log(`[ScanKingdom] Sending packet312 to ${url}  `)
      const response312 = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: encoded312
      })

      if (!response312.ok) {
        throw new Error(`Server returned ${response312.status}: ${response312.statusText}`)
      }

      // Get response buffer
      const buffer312 = await response312.arrayBuffer()
      const bytes312 = new Uint8Array(buffer312)

      // const payload = {
      //   request: encoded312,
      //   response: bytes312,
      //   shouldSaveObjects
      // }
      const result = await extractDataFrom312(bytes312, shouldSaveObjects)

      objects += result.objects12?.length || 0
      players += result.players42?.length || 0
    }

    console.log(`[ScanKingdom] Success objects ${objects}, players ${players} `)
    return { success: true, objects, players }
  } catch (error) {
    console.error(`[ScanKingdom] Error:`, error.message)
  }
}

module.exports = {
  processPacket,
  getPlayerInfo402,
  scanKingdom
}
