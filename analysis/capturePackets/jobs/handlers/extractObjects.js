const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../redis')
const staticIdDB = require('../../staticId.js')
const { multiDecodeMsgPack2 } = require('../../../message-pack/messagePack.js')

let redisClient = null

function getRedisClient() {
  if (!redisClient) {
    redisClient = getRedis()
  }
  return redisClient
}

function extractObjects(data) {
  const objects = []
  const players = [] // players and cities are the same
  const cities = [] //keep separated for update later

  function isValidObject12(arr) {
    // opcode=312
    if (!Array.isArray(arr) || arr.length !== 12) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
    if (typeof arr[11] !== 'boolean') return false
    return true
  }

  function isValidPlayerObject42(arr) {
    //  opcode=312
    if (!Array.isArray(arr) || arr.length !== 42) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
    if (!Array.isArray(arr[2]) || arr[2].length !== 1) return false
    if (typeof arr[3] !== 'number') return false //staticid
    if (!Array.isArray(arr[4]) || arr[4].length !== 1) return false
    if (typeof arr[7] !== 'number') return false //kingdom
    if (typeof arr[13] !== 'number') return false //level
    if (!Array.isArray(arr[17]) || arr[17].length !== 3) return false //coord
    if (!Array.isArray(arr[18]) || arr[18].length !== 3) return false //coord
    if (!Array.isArray(arr[26]) || arr[26].length !== 4) return false
    if (!Array.isArray(arr[39]) || arr[39].length !== 1) return false
    if (typeof arr[11] !== 'boolean') return false //shield?
    return true
  }

  function isValidPlayerObject23(arr) {
    // opcode=402
    if (!Array.isArray(arr) || arr.length !== 23) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false //objectid
    if (typeof arr[1] !== 'string') return false //tb:xx
    if (typeof arr[2] !== 'string') return false //name
    if (typeof arr[3] !== 'string') return false //localization
    if (typeof arr[8] !== 'number') return false //level
    if (typeof arr[10] !== 'number') return false //MIGHT
    if (!Array.isArray(arr[11]) || arr[11].length !== 1) return false //clanid
    if (typeof arr[13] !== 'string') return false //CLAN NAME
    if (!Array.isArray(arr[15]) || arr[15].length !== 3) return false //coord
    if (!Array.isArray(arr[16]) || arr[16].length !== 1) return false //unknown
    if (typeof arr[17] !== 'number') return false //GOLD INGOT
    if (typeof arr[21] !== 'string') return false //timezone
    return true
  }

  async function findObjects(arr, depth = 0) {
    if (depth > 200) return

    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject12(item)) {
          const staticId = item[1]
          const obj = {
            objectId: item[0][0],
            staticId: staticId,
            unk1: item[2],
            unk2: item[3],
            unk3: item[4],
            level: item[5],
            unk4: item[6],
            unk5: item[7],
            kingdom: item[8][0],
            x: item[8][1],
            y: item[8][2],
            unk6: item[9][0],
            extra: item[10],
            isActive: item[11]
          }
          objects.push(obj)
        } else if (isValidPlayerObject42(item)) {
          // opcode=312
          const city = {
            playerId: String(item[0][0]), // cant handle bigint
            staticId: arr[3], //staticid
            level: arr[13], //level
            kingdom: arr[17][0], //kingdom
            x: arr[17][1], //coordx
            y: arr[17][2], //coordy
            haveShield: arr[11] //shield?
          }
          cities.push(city)
        } else if (isValidPlayerObject23(item)) {
          // opcode=402
          const player = {
            playerId: String(item[0][0]), // cant handle bigint
            key: arr[1], //tb:xx
            name: arr[2], //name
            localization: arr[3], //localization
            level: arr[8], //level
            might: arr[10], //MIGHT
            clanId: arr[11][0], //clanid
            clanName: arr[13], //CLAN NAME
            kingdom: arr[15][0], //coord
            x: arr[15][1], //coord
            y: arr[15][2], //coord
            gold: arr[17], //GOLD INGOT
            timezone: arr[21] //timezone
          }
          players.push(player)
        } else {
          findObjects(item, depth + 1)
        }
      }
    }
  }

  findObjects(data)

  const incompleteObjData = []

  objects.forEach(obj => {
    const dbEntry = staticIdDB.getStaticIdData(obj.staticId)
    const isComplete =
      dbEntry && dbEntry.name && dbEntry.entryType && dbEntry.level != null && dbEntry.level >= 0

    if (!isComplete) {
      incompleteObjData.push(obj)
    }
  })

  if (incompleteObjData.length > 0) {
    console.log(`[ExtractObjects] Found ${incompleteObjData.length} incomplete object entries`)
    addJob(JOB_TYPES.NOTIFICATION, PRIORITY.HIGH, {
      message: 'obj missing data',
      objects: incompleteObjData
    })
  }

  return { objects, players, cities }
}

async function extractObjectsHandler(data) {
  const { bufferKey } = data
  console.log(`[ExtractObjects] Looking for key: ${bufferKey}`)

  const dataBuffer = await getRedisClient().getBuffer(bufferKey)

  if (!dataBuffer) {
    console.error(`[ExtractObjects] Key not found or empty: ${bufferKey}`)
    return { success: false, error: 'buffer not found in Redis' }
  }

  console.log(`[ExtractObjects] Got ${dataBuffer.length} bytes `)

  const _decodedResponse = multiDecodeMsgPack2(Buffer.from(dataBuffer))
  const decodedResponse = _decodedResponse.results

  try {
    const { objects, players, cities } = extractObjects(decodedResponse)

    if (objects.length === 0) {
      console.log(`[ExtractObjects] Found ${objects.length} objects`)
      return { success: true, count: 0, objects: [] }
    }

    console.log(`\x1b[32m [ExtractObjects] Found ${objects.length} objects \x1b[0m`)

    // Convert BigInt to string for serialization
    const safeObjects = objects.map(obj => {
      const safe = { ...obj }
      if (typeof safe.objectId === 'bigint') safe.objectId = safe.objectId.toString()
      if (typeof safe.staticId === 'bigint') safe.staticId = Number(safe.staticId)
      return safe
    })

    await getRedisClient().del(bufferKey)

    // Chain: Save objects first, then find-objects will trigger notification
    return {
      success: true,
      nextJobs: [
        {
          type: JOB_TYPES.SAVE_OBJECTS,
          priority: PRIORITY.HIGH,
          payload: {
            objects: safeObjects
          }
        }
      ]
    }
  } catch (error) {
    console.error(`[ExtractObjects] Error:`, error.message)
    throw error
  }
}

module.exports = {
  extractObjectsHandler,
  extractObjects
}
