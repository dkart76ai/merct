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

  function isValidObject(arr) {
    if (!Array.isArray(arr) || arr.length !== 12) return false
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
    if (typeof arr[11] !== 'boolean') return false
    return true
  }

  async function findObjects(arr, depth = 0) {
    if (depth > 200) return

    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
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
    addJob(JOB_TYPES.FIND_OBJECTS, PRIORITY.HIGH, {
      message: 'obj missing data',
      objects: incompleteObjData
    })
  }

  return objects
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
    const objects = extractObjects(decodedResponse)

    if (objects.length === 0) {
      console.log(`[ExtractObjects] Found ${objects.length} objects`)
      return { success: true, count: 0, objects: [] }
    }

    console.log(`\x1b[32m [ExtractObjects] Found ${objects.length} objects \x1b[0m`)

    await getRedisClient().del(bufferKey)

    // Chain: Save objects first, then find-objects will trigger notification
    return {
      success: true,
      nextJobs: [
        {
          type: JOB_TYPES.SAVE_OBJECTS,
          priority: PRIORITY.NORMAL,
          payload: {
            objects
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
