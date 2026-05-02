const { styleText } = require('node:util')

console.log(styleText('green', 'This is green!'))
// const { parentPort } = require('worker_threads')
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
const { addDiscordNotificationJob, addGameNotificationJob } = require('../jobs/queues.js')

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

let prevOpcodes = []
const processPacket = async ({ request, response }) => {
  if (!request || !response) throw new Error('No  data provided')

  try {
    // const bytes = decodeBase64(base64)
    // const { results: decodedRequest } = multiDecodeMsgPack2(request)
    // const { results: decodedResponse } = multiDecodeMsgPack2(response)

    // const opCode = getFirstValue(decodedResponse)

    const { opCode, userId, token } = getRequestHeader(request)
    prevOpcodes.push(opCode)
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
      console.log(
        styleText('red', '*********** PREVIOUS OPCODE *****'),
        prevOpCode.slice(-8).join(',')
      )

      extractDataFrom312(response)
    }
    if (prevOpcodes.length > 100) {
      prevOpcodes = prevOpcodes.slice(-20)
    }

    if (opCode === 402) {
      extractDataFrom402(response)
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// scan kingdom -----
function buildPacket41000Payload(tokenBigInt, token) {
  if (!tokenBigInt || !token) return null

  const randomSeq = Math.floor(Math.random() * 32000) + 1
  const packetData = [[41000, randomSeq, [[tokenBigInt], token], ''], [2]]

  return packetData
}

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
  // console.log(styleText('yellow', 'extractDataFrom402'))
  const { players23 } = scanPacket402(response)
  console.log('[tasks][extractDataFrom402] scanPacket402: players23:', players23.length)

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
      // console.log(`[tasks][extractDataFrom402][SavePlayers] `, result)
    } catch (e) {
      console.error('[tasks][extractDataFrom402][SavePlayers] error', e.message)
    }
  }

  return {
    success: true,
    players23
  }
}

async function extractDataFrom312(response, shouldSaveObjects = false) {
  // console.log(styleText('red', 'extractDataFrom312'))

  const { players42, objects12 } = scanPacket312(response)
  console.log('[tasks][extractDataFrom312] scanPacket312: players42:', players42.length)
  console.log('[tasks][extractDataFrom312] scanPacket312: objects12:', objects12.length)

  // if (parentPort) {
  //   objects12.forEach(async o => {
  //     const dbEntry = await staticIdRedis.getStaticIdData(o.staticId)

  //     const isComplete = dbEntry && dbEntry.name && dbEntry.level != null && dbEntry.level >= 0

  //     // NOTE : dont delete static id updater
  //     if (!isComplete) {
  //       // await staticIdRedis.addOrUpdateStaticId(o.staticId, {
  //       //   level: o.level
  //       // })

  //       console.log(
  //         `[worker-task] found staticid:${o.staticId}, ${o.kingdom},${o.x},${o.y}  level:${o.level}`
  //       )
  //       console.log(
  //         `[worker-task] ${o.staticId} on db  ${dbEntry?.name || 'unknown name'} level:${dbEntry?.level || 'unknown level'}`
  //       )
  //     }

  //     // const dragonMounds = [199, 200, 201, 202, 203]
  //     // const wellSprings = [208, 209, 210, 211, 212]
  //     // const villages = [34, 521, 522, 523, 524, 525, 40025, 40449, 40451]
  //     // const allStaticIds = [...dragonMounds, ...wellSprings, ...villages]
  //     // if (allStaticIds.includes(o.staticId)) {
  //     //   //village lvl 25
  //     //   parentPort.postMessage({
  //     //     cmd: 'poi',
  //     //     reason: '',
  //     //     coords: { k: o.kingdom, x: o.x, y: o.y },
  //     //     staticId: o.staticId
  //     //   })
  //     // }
  //     // END NOTE
  //   })
  // } else {
  // direct call, no worker threads

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

  const mercenaries = objs.filter(o => o.staticId === 400)
  if (mercenaries.length > 0) {
    const lines = mercenaries.map(m => {
      return ` K:${m.kingdom} X:${m.x} Y:${m.y} (${m.name || 'Desconocido'})`
    })

    // 3. Ahora sí podemos unir las strings
    let batchContent = lines.join('\n')
    console.log(styleText('green', 'MERCENARIES FOUND!'))
    console.log(styleText('green', 'MERCENARIES FOUND!'))
    console.log(styleText('green', 'MERCENARIES FOUND!'))
    console.log(styleText('green', 'MERCENARIES FOUND!'))

    // Añadimos UN solo job que contiene muchas líneas
    await addDiscordNotificationJob({
      content: batchContent, // Asegúrate de que tu worker de Discord use este campo
      isBatch: true,
      count: lines.length
    })

    for (merc of mercenaries) {
      await addGameNotificationJob({
        object: {
          k: merc.kingdom,
          x: merc.x,
          y: merc.y,
          staticId: merc.staticId
        },
        message: ``,
        toMainChannel: false
      })
    }
  }
  // }

  if (shouldSaveObjects) {
    if (objs.length > 0) {
      // console.log('[tasks][extractDataFrom312] [SaveObjects] ', objs[0])
      const result = saveObjects(objs)
      console.log(
        `[tasks][extractDataFrom312] [SaveObjects] Created: ${result.created}, Updated: ${result.updated}, Total keys: ${result.objects?.length}`
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
      // console.log(`[tasks][extractDataFrom312][SavePlayers] `, result)
    } catch (e) {
      console.error('[tasks][extractDataFrom312][SavePlayers] error', e.message)
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

  // console.log('[tasks][getPlayerInfo402]', { kingdom })

  if (!kingdom) {
    console.log('[tasks][getPlayerInfo402] No kingdom provided')
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

  // console.log(`[tasks] [getPlayerInfo402] Sending packets to ${url}  `)
  try {
    const token1 = BigInt(_token1)
    const token2 = new Uint8Array(_token2)

    // prepare 41000 first
    const packetData40001 = buildPacket41000Payload(token1, token2)
    // Encode the packet
    const encoded40001 = encodeMsgPack2MultiFragments(packetData40001)
    // console.log('[tasks][getPlayerInfo402]encoded request base64', encodeBase64(encoded40001))

    const playerIdsDB = getPlayersIdFromKingdom(kingdom)
    // console.log('[getPlayerInfo402] playersIds', playerIdsDB)

    const playersArr = playerIdsDB.map(p => Number(p.playerId))
    const playerIdsArray = generatePlayerArrays(playersArr)
    let players = 0

    for (const playerIds of playerIdsArray.slice(0, 5)) {
      // Send to server 40001
      // console.log(`[tasks][getPlayerInfo402]  Sending packet40001 to ${url}  `, playerIds)
      const response40001 = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: encoded40001
      })

      // console.log('[tasks][getPlayerInfo402] getPlayerInfo40001 respnse', response40001)

      if (!response40001.ok) {
        throw new Error(`Server returned ${response40001.status}: ${response40001.statusText}`)
      }

      // Get response buffer
      const buffer40001 = await response40001.arrayBuffer()
      const bytes40001 = new Uint8Array(buffer40001)

      // console.log('[tasks][getPlayerInfo402]40001 encoded result base64', encodeBase64(bytes40001))

      //-----410000 fin

      // for (const playerIds of playerIdsArray) {
      const packetData402 = buildPacket402Payload(playerIds[0], token1, token2)

      // Encode the packet
      const encoded402 = encodeMsgPack2MultiFragments(packetData402)
      // console.log('[tasks][getPlayerInfo402]402 encoded request base64', encodeBase64(encoded402))

      // Send to server
      // console.log(`[tasks][getPlayerInfo402] Sending packet402 to ${url}  `)
      const response402 = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: encoded402
      })

      // console.log('[getPlayerInfo402] respnse', response402)

      if (!response402.ok) {
        throw new Error(`Server returned ${response402.status}: ${response402.statusText}`)
      }

      // Get response buffer
      const buffer402 = await response402.arrayBuffer()
      const bytes402 = new Uint8Array(buffer402)

      // console.log('[tasks][getPlayerInfo402]encoded result base64', encodeBase64(bytes402))

      const result402 = await extractDataFrom402(bytes402)

      // console.log(
      //   styleText('red', '[tasks] [getPlayerInfo402] extract dataaaaaaaaaaa'),
      //   result402.players23.length
      // )

      players += result402.players23?.length || 0
    }

    // console.log(`[tasks] [getPlayerInfo402] Success  players ${players} `)
    return { success: true, players }
  } catch (error) {
    console.error(`[tasks] [getPlayerInfo402] Error:`, error.message)
  }
}

async function scanKingdomTask(data) {
  // console.log('[tasks] [scanKingdomTask] data', data)
  const { kingdom, shouldSaveObjects = false } = data
  // console.log('[tasks][scanKingdomTask]', { kingdom, shouldSaveObjects })

  if (!kingdom) {
    console.log('[tasks][scanKingdomTask] No kingdom provided')
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

  console.log(`[tasks][scanKingdomTask] Sending packets to ${url}  `)

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
    // console.log(`[tasks][scanKingdomTask] Sending packet313 to ${url}  `)
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
    // console.log(`[tasks][scanKingdomTask] Sending packet22 to ${url}  `)
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
      // console.log(`[tasks][scanKingdomTask] Sending packet312 to ${url}  `)
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
      const result312 = await extractDataFrom312(bytes312, shouldSaveObjects)

      objects += result312.objects12?.length || 0
      players += result312.players42?.length || 0

      //---------testing 402
      // if (result312.players42.length > 0 && result312.players42.length < 5) {
      //   // get all objectids from players42 array
      //   // generate a 402 packet and send to server
      //   const allPlayersIds = result312.players42.map(p => p.objectId)
      //   const packetData402 = buildPacket402Payload(allPlayersIds, token1, token2)

      //   // Encode the packet
      //   const encoded402 = encodeMsgPack2MultiFragments(packetData402)
      //   console.log('402 encoded request base64', encodeBase64(encoded402))

      //   // Send to server
      //   console.log(`[getPlayerInfo402] Sending packet402 to ${url}  `)
      //   const response402 = await fetch(url, {
      //     method: 'POST',
      //     headers: HEADERS,
      //     body: encoded402
      //   })

      //   console.log('respnse', response402)

      //   if (!response402.ok) {
      //     throw new Error(`Server returned ${response402.status}: ${response402.statusText}`)
      //   }

      //   // Get response buffer
      //   const buffer402 = await response402.arrayBuffer()
      //   const bytes402 = new Uint8Array(buffer402)

      //   console.log('encoded result base64', encodeBase64(bytes402))

      //   const result402 = await extractDataFrom402(bytes402)

      //   console.log(
      //     styleText('blue', '[getPlayerInfo402] extract dataaaaaaaaaaa'),
      //     result402.players23.length
      //   )
      // }
      /// -- end testing 402
    }

    // console.log(`[tasks][scanKingdomTask] Success objects ${objects}, players ${players} `)
    return { success: true, objects, players }
  } catch (error) {
    console.error(`[tasks][scanKingdomTask] Error:`, error.message)
  }
}

module.exports = {
  processPacket,
  getPlayerInfo402,
  scanKingdomTask
}
