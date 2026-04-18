const path = require('path')
const { addJob, JOB_TYPES, PRIORITY } = require('../index')
const { getRedis } = require('../redis')
const { multiDecodeMsgPack2 } = require('../../../message-pack/messagePack.js')
const fs = require('fs')

const redisClient = getRedis()

let captureIndex = 0
let saveFileIndex = 0
let captures = []
let capturesDecoded = []

const SAVE_DIR = path.join(__dirname, 'captures')
const MYPLAYER_FILE = path.join(__dirname, 'myplayer.json')
const MAX_CAPTURES_PER_FILE = 50

const myPlayerInfo = {
  name: 'Maedve',
  coords: { k: 277, x: 91, y: 53 },
  cityLevel: 9,
  heroLevel: 6,
  playerId: 'tb:68568818',
  might: 7045,
  clan: 'LOW'
}
//  await redisClient.set('app:shared_token', newToken, 'EX', 86400);
function mapToUint8Array(map) {
  if (!map) return null
  if (map instanceof Uint8Array) return map
  const keys = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
  if (keys.length === 0) return null
  const arr = new Uint8Array(keys.length)
  for (const k of keys) {
    arr[k] = map[k]
  }
  return arr
}

function getFirstValue(data) {
  if (!data || !Array.isArray(data)) return null

  for (let item of data) {
    if (typeof item === 'number') return item
    if (Array.isArray(item)) {
      const resultado = getFirstValue(item)
      if (resultado !== undefined) return resultado
    }
  }

  return null
}

function containsPlayerId(data, playerId, internalId) {
  if (!data) return false
  const str = JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  )
  if (playerId && str.includes(playerId)) return true
  if (internalId && str.includes(String(internalId))) return true
  return false
}

function saveToFile() {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true })
    }

    const saveFile = path.join(SAVE_DIR, `captures-${String(saveFileIndex).padStart(3, '0')}.json`)
    fs.writeFileSync(
      saveFile,
      JSON.stringify(captures, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
    )

    const saveFile2 = path.join(
      SAVE_DIR,
      `capturesDecoded-${String(saveFileIndex).padStart(3, '0')}.json`
    )
    fs.writeFileSync(
      saveFile2,
      JSON.stringify(capturesDecoded, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
    )
    // console.log(
    //   `[${new Date().toLocaleTimeString()}] Saved ${captures.length} captures to ${path.basename(saveFile)}`
    // )

    if (captures.length >= MAX_CAPTURES_PER_FILE) {
      captures = []
      capturesDecoded = []
      captureIndex = 0
      saveFileIndex++
      console.log(
        `[${new Date().toLocaleTimeString()}] Rotation: switched to captures-${String(saveFileIndex).padStart(3, '0')}.json`
      )
    }
  } catch (e) {
    console.error('[processPacket] Save error:', e.message)
  }
}

function saveCapturedPacket(
  opCode,
  url,
  status,
  requestMethod,
  requestHeaders,
  requestBodyB64,
  responseHeaders,
  responseBodyB64,
  decodedResponse,
  tileIds,
  isMyPacket
) {
  captures.push({
    id: ++captureIndex,
    opCode,
    url,
    status,
    tileIds,
    isMyPacket,
    request: {
      method: requestMethod,
      headers: requestHeaders,
      // bodyB64: requestBodyB64,
      bodyBufferB64: requestBodyB64
    },
    response: {
      headers: responseHeaders,
      bodyB64: responseBodyB64
      // decodedResponse
    }
  })

  capturesDecoded.push({ id: ++captureIndex, opCode, url, decodedResponse })

  saveToFile()
}

async function extractInternalIdFrom402(data) {
  //also found on 203 packets
  if (!data || !Array.isArray(data)) return null

  for (const item of data) {
    if (Array.isArray(item) && item.length > 0) {
      if (Array.isArray(item[0]) && item[0].length === 1) {
        const id = item[0][0]
        if ((typeof id === 'number' || typeof id === 'bigint') && id > 1000000000000) {
          await redisClient.set('myPlayerId:bigint', id.toString(), 'EX', 86400)
          return
        }
      }
    }
  }
}

async function extractMySessionTokens(decodedReq) {
  console.log(
    '312 packet getting tokens',
    JSON.stringify(decodedReq, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  )
  // 312 packet getting tokens [[312,2807,[["1309965043442"],{"0":105,"1":227,"2":98,"3":249,"4":171,"5":90,"6":183,"7":199,"8":35,"9":185,"10":113,"11":96}],""],[[2284],[45713],[],[]],
  //request:  [312,284,[["1309965043442"],{"0":105,"1":223,"2":166,"3":213,"4":171,"5":90,"6":183,"7":199,"8":35,"9":86,"10":245,"11":99}],""]

  const mySessionToken = decodedReq[0]?.[2]?.[0]?.[0] || null
  // mySessionToken =
  //   typeof rawToken === 'bigint'
  //     ? rawToken
  //     : typeof rawToken === 'number'
  //       ? BigInt(rawToken)
  //       : rawToken
  const token2 = decodedReq[0]?.[2]?.[1] || null // auth token?
  const mySessionToken2 = mapToUint8Array(token2)

  await redisClient.set('mysession:token1:BigInt', mySessionToken.toString(), 'EX', 86400)
  await redisClient.set('mysession:token2:Uint8Array', Buffer.from(mySessionToken2), 'EX', 86400)

  //    const val = await redisClient.get('mysession:token1');

  // if (val !== null) {
  //   const recoveredBigInt = BigInt(val);

  //   // Ahora puedes hacer operaciones matemáticas de BigInt
  //   console.log(recoveredBigInt + 1n);
  // }

  //    const data = await redisClient.getBuffer('mi_clave_binaria');

  // if (data) {
  //   const recuperado = new Uint8Array(data);
  //   console.log(recuperado); // Uint8Array [10, 20, 30, 40]
  // }
}

async function processPacketHandler(data) {
  const { url, status, requestKey, responseKey, requestMethod, requestHeaders, responseHeaders } =
    data

  // Recuperar el binario original
  const requestData = await redisClient.getBuffer(requestKey)
  const responseData = await redisClient.getBuffer(responseKey)

  if (!requestData || !responseData) {
    throw new Error('Los datos binarios expiraron o no se encontraron')
  }

  const _decodedReq = multiDecodeMsgPack2(Buffer.from(requestData))
  const decodedReq = _decodedReq.results

  const _decodedResponse = multiDecodeMsgPack2(Buffer.from(responseData))
  const decodedResponse = _decodedResponse.results

  const opCode = getFirstValue(decodedResponse)

  //save all packets
  requestBodyB64 = requestData ? Buffer.from(requestData).toString('base64') : null
  responseBodyB64 = responseData ? Buffer.from(responseData).toString('base64') : null

  //-----------------------

  let isMyPacket = false
  const internalPlayerId = await redisClient.get('myPlayerId:bigint')
  if (internalPlayerId !== null) {
    isMyPacket = containsPlayerId(decodedResponse, myPlayerInfo.playerId, BigInt(internalPlayerId))
  }

  //-----------------------
  let tileIds = []
  if (opCode === 312) {
    tileIds = decodedReq[1]
  }

  saveCapturedPacket(
    opCode,
    url,
    status,
    requestMethod,
    requestHeaders,
    requestBodyB64,
    responseHeaders,
    responseBodyB64,
    decodedResponse,
    tileIds,
    isMyPacket
  )
  //-----------------------

  //-----------------------

  if (opCode === 312) {
    extractMySessionTokens(decodedReq)
  }

  if (opCode === 402) {
    extractInternalIdFrom402(decodedResponse)
  }

  if (opCode === 312 || opCode === 408) {
    // pass rawBytes (encoded)to extract_objects as they are smaller
    const msgPackDataKey = `msgPackData:${Date.now()}:${Math.random().toString(36).substring(7)}`
    await redisClient.set(msgPackDataKey, Buffer.from(responseData), 'EX', 60 * 5)

    const payload = {
      bufferKey: msgPackDataKey
    }

    await addJob(JOB_TYPES.EXTRACT_OBJECTS, payload, {
      priority: PRIORITY.NORMAL
    })

    // objects.forEach(obj => trackUnknownStaticId(obj))
  }

  // 3. Limpieza (opcional pero recomendado)
  await redisClient.del(requestKey)
  await redisClient.del(responseKey)

  return {
    success: true
  }
}

module.exports = {
  processPacketHandler
}
