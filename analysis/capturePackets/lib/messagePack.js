const { styleText } = require('node:util')
const path = require('path')
const { MsgPackTurboDecoder, MsgPackLazyDecoder, MsgPackTurboEncoder } = require('message-pack')
const { createStream } = require('rotating-file-stream')
// class MsgPackGame extends MsgPackLazyDecoder {

// }
// Capture error: MsgPackLazyDecoder is not a constructor

let decoder = null
// const LOGS_DIR = path.join(__dirname, 'logs')
// const logStream = createStream('static400.bin', {
//   size: '2M', // Rota cada 10MB para que sean fáciles de descargar
//   interval: '5m', // O cada día
//   path: LOGS_DIR
// })
// let counter = 0

function getDecoder(buffer) {
  if (decoder) {
    decoder.setBuffer(buffer)
    decoder.off = 0 // Reset offset to beginning
    return decoder
  }

  decoder = new MsgPackLazyDecoder(buffer)
  return decoder
}

let encoder = null
function getEncoder(buffer) {
  if (encoder) {
    encoder.reset() //set offset to 0
    return encoder
  }

  encoder = new MsgPackTurboEncoder(buffer)
  return encoder
}

function decodeBase64(base64String) {
  let cleanBase64 = base64String.replace(/\s/g, '')
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1]
  }

  const binaryString = atob(cleanBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes
}

function encodeBase64(buffer) {
  const b64 = btoa(String.fromCharCode(...buffer))
  return b64
}

function decodeMsgPack2(buff) {
  // 1. Instanciamos el decoder
  const decoder = getDecoder(buff)

  // 2. Leemos los dos enteros del encabezado (4 bytes cada uno)
  // Usamos getUint32. El primero está en offset 0, el segundo en offset 4.
  const longitud1 = decoder.view.getUint32(0, true) // Offset 0
  const longitud2 = decoder.view.getUint32(4, true) // Offset 4

  // console.log(`Longitudes del encabezado: ${longitud1}, ${longitud2}`)

  // 3. Posicionamos el offset en 8 para saltar el encabezado
  decoder.off = 8

  // 4. Decodificamos el payload MessagePack
  const data = decoder.decode()
  // console.log('Contenido:', data)
  return data
}

function decodeMsgPackBase64(base64String) {
  try {
    const bytes = decodeBase64(base64String)

    return decodeMsgPack2(bytes)
  } catch (e) {
    throw new Error('Failed to decode: ' + e.message)
  }
}

function multiDecodeMsgPack2(buff, decodeAll = false) {
  if (!buff || buff.length === 0) {
    console.warn('multiDecodeMsgPack2: Empty buffer received')
    return { results: [], bufLen: 0, len: 0 }
  }

  if (buff.length < 8) {
    console.warn('multiDecodeMsgPack2: Buffer too small for header:', buff.length, 'bytes')
    return { results: [], bufLen: 0, len: 0 }
  }

  const decoder = getDecoder(buff)

  // 2. Leemos los dos enteros del encabezado (4 buff cada uno)
  // Usamos getUint32. El primero está en offset 0, el segundo en offset 4.
  const longitud1 = decoder.view.getUint32(0, true) // Offset 0
  const longitud2 = decoder.view.getUint32(4, true) // Offset 4

  // console.log(`Longitudes del encabezado: ${longitud1}, ${longitud2}, buff.len=`, buff.length)

  decoder.off = 8 // Saltamos tu encabezado

  const results = []
  try {
    while (decoder.off < decoder.buf.length) {
      // console.log('Decodificando en offset:', decoder.off)
      if (!decodeAll) {
        if (decoder.off >= longitud2) break
      }
      const data = decoder.decode()
      if (data !== undefined) {
        results.push(data)
      }
    }
  } catch (err) {
    console.error('multiDecodeMsgPack2: Error en offset ' + decoder.off + ':', err.message)
    // Inspecciona los bytes cercanos al error
    console.log(
      'multiDecodeMsgPack2: Bytes problemáticos:',
      buff.slice(decoder.off, decoder.off + 10)
    )
  }

  // console.log(results) // Aquí tienes todo el contenido
  return { results, bufLen: longitud1, len: longitud2 }
}

function multiDecodeMsgPackBase64(base64String, decodeAll = false) {
  try {
    const bytes = decodeBase64(base64String)

    return multiDecodeMsgPack2(bytes, decodeAll)
  } catch (e) {
    throw new Error('Failed to decode: ' + e.message)
  }
}

function encodeMsgPack2MultiFragments(fragmentos, len = null) {
  const encoder = getEncoder()

  encoder.off = 8

  fragmentos.forEach(obj => {
    encoder.encode(obj)
  })

  const finalBuf = encoder.getBuffer()
  const view = new DataView(finalBuf.buffer)

  const totalLength = finalBuf.length
  const msgpackPayloadLength = len ? len : totalLength - 8

  view.setUint32(0, totalLength, true)
  view.setUint32(4, msgpackPayloadLength, true)

  return finalBuf
}

function encodeMsgPack2(value) {
  const encoder = getEncoder()

  encoder.writeUint32LE(value.length + 8)
  encoder.writeUint32LE(value.length + 8)

  encoder.encode(value)

  return encoder.getBuffer()
}

function encodeMsgPack2ToBase64(value) {
  const b64 = encodeBase64(encodeMsgPack2(value))
  return b64
}

// /-------------------
/// packets handler
// /-------------------
// NOTA:
// el packet tiene multiples msgpack
// y no tiene un wrapper [] exterior,
//  es algo que yo se lo agrego para poder agrupar data
// asi que el primer packet es el que contiene el opcode y session
// Suponiendo que el buffer contiene: [312, 26, [[id], token], ""]
function getRequestHeader(buffer) {
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length

  decoder.readArrayHeader() // Entra al primer nivel [...]

  const opCode = decoder.decode() // Lee 312 (off se mueve solo)
  const sequence = decoder.decode() // Lee 26

  decoder.readArrayHeader() // Entra al bloque [[id], token]

  decoder.readArrayHeader() // Entra al mini-array [id]
  const userId = decoder.decode() // Lee el BigInt/Number

  // Ahora el cursor está exactamente al inicio del Token
  // Tu decode() ya detectará que es un binario (0xc4/c5/c6)
  // y llamará a readBin (que usa subarray)
  const token = decoder.decode()

  return { opCode, userId, token }
}

function getChestCode(buffer) {
  //! this is not chest code, seems more like clan whealth counter
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length
  decoder.skip() //skip header, opcode,seq,sessiondata

  decoder.readArrayHeader() // Entra al primer nivel [...]

  const chestCode = decoder.decode() // Lee {"strChestCode":count}

  return { chestCode }
}

function getTroopTrainCode(buffer) {
  //! this is not chest code, seems more like clan whealth counter
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length
  decoder.skip() //skip header, opcode,seq,sessiondata

  decoder.readArrayHeader() // Entra al primer nivel [...]
  decoder.skip() //skip obj/instance id

  const troopType = decoder.decode() // Lee {"strChestCode":count}
  const troopAmount = decoder.decode() // Lee {"strChestCode":count}

  return { troopType, troopAmount }
}

function getChestCodeResponse(buffer) {
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length
  decoder.skip() //skip header, opcode,seq

  decoder.readArrayHeader() // Entra al primer nivel [...]
  decoder.readArrayHeader() // Entra al 2nd nivel [...]
  /**
 {
          "1": 5500,
          "2": 6250000,
          "13": 10190,
          "30": 6410,
          "32": 1190,
          "34": 479,
          "35": 9500,
          "1634": 1,
          "2005": 1,
          "2006": 3,
          "72002": 2
        },
 */
  const resourceCode = decoder.decode() // Lee {"strresourceCode":count}

  return { resourceCode }
}

function getMsgPack2ndBlockRequest(buffer) {
  const decoder = getDecoder(buffer)
  // 1. Saltar los 8 bytes de cabecera del paquete (total len / buffer len)
  decoder.off += 8

  // 2. Saltar el primer mensaje completo [312, 26, [[id], token], ""]
  // Usamos skip() porque es iterativo y no consume memoria
  decoder.skip()

  // Ahora el puntero 'off' está al inicio del segundo mensaje:
  // [ [ 170, 270, 171, 221, 271 ], [ 0, 0, 0, 0, 0 ], [], [] ]

  // 3. Entramos al array principal del segundo mensaje

  const mainArrayLen = decoder.readArrayHeader() // debería ser 4
  if (mainArrayLen > 0) {
    // 4. El primer elemento es el array que buscas [ 170, 270, 171, 221, 271 ]
    // Usamos decode() aquí porque queremos los valores reales dentro del array
    return decoder.decode()
  }

  return undefined
}

// Busca el primer número real ignorando la profundidad de los arreglos
// function findFirstInt(decoder) {
//   const limit = decoder.buf.length

//   while (decoder.off < limit) {
//     const byte = decoder.buf[decoder.off]

//     // 1. Si es un FixInt (0x00-0x7f o 0xe0-0xff), es nuestro ID.
//     if (byte <= 0x7f) return decoder.buf[decoder.off++]
//     if (byte >= 0xe0) return decoder.buf[decoder.off++] - 0x100

//     // 2. Si es un marcador de arreglo o mapa, lo "perforamos"
//     // simplemente saltamos el byte del marcador para ver qué hay adentro
//     if ((byte >= 0x90 && byte <= 0x9f) || (byte >= 0x80 && byte <= 0x8f)) {
//       decoder.off++
//       continue
//     }

//     // 3. Marcadores de enteros extendidos (8, 16, 32, 64 bits)
//     switch (byte) {
//       case 0xcc:
//       case 0xcd:
//       case 0xce:
//       case 0xcf:
//       case 0xd0:
//       case 0xd1:
//       case 0xd2:
//       case 0xd3:
//         return decoder.decode() // Reutiliza tu decode() que ya está optimizado

//       // 4. Marcadores de estructuras largas (Headers de 16/32 bits)
//       case 0xdc:
//       case 0xde:
//         decoder.off += 3
//         continue // Salta marcador + 2 bytes de len
//       case 0xdd:
//       case 0xdf:
//         decoder.off += 5
//         continue // Salta marcador + 4 bytes de len

//       // 5. Si es cualquier otra cosa (Strings, Binarios, Floats)
//       // los saltamos por completo usando la lógica de skip()
//       default:
//         decoder.skip()
//         break
//     }
//   }
//   return null
// }

function findMyValuesInPacket(myValues, buffer) {
  // Convertimos a Set para que la búsqueda sea O(1) en lugar de O(n)
  const targetValues = new Set(myValues.split(',').map(Number))
  const decoder = getDecoder(buffer)

  decoder.off = 8 // Saltamos el header
  const limit = decoder.buf.length

  while (decoder.off < limit) {
    // Si el siguiente byte representa un número
    if (decoder.isNextNumber()) {
      const val = decoder.decode()
      if (targetValues.has(val)) return true
    } else {
      // Si es un mapa, arreglo o string, simplemente saltamos el marcador
      // o el bloque completo para seguir buscando
      const byte = decoder.buf[decoder.off]

      // Optimizamos: si es un marcador de colección (fixmap/fixarray)
      // solo saltamos el byte de cabecera para entrar en él
      if ((byte >= 0x80 && byte <= 0x8f) || (byte >= 0x90 && byte <= 0x9f)) {
        decoder.off++
      }
      //Marcadores de estructuras largas (Headers de 16/32 bits)
      else if (byte == 0xdc || byte == 0xde) {
        decoder.off += 3
      } else if (byte == 0xdd || byte == 0xdf) {
        decoder.off += 5
      } else {
        // Para todo lo demás (objetos complejos, strings largos), saltar
        decoder.skip()
      }
    }
  }
  return false
}

// Opcode 312 - Versión 12 elementos
function _isObject12(decoder) {
  const startOff = decoder.off
  try {
    const len = decoder.readArrayHeader()
    if (len !== 12) return false

    // [0] es Array de 1?
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip() // Saltamos el contenido de arr[0][0]

    // Saltamos arr[1] hasta arr[7] (7 elementos)
    for (let i = 1; i <= 7; i++) decoder.skip()

    // [8] es Array de 3?
    if (decoder.readArrayHeader() !== 3) return false
    decoder.skip()
    decoder.skip()
    decoder.skip() // Saltamos coords

    // [9] es Array de 1?
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [10] saltar
    decoder.skip()

    // [11] es Boolean? (0xc2 false, 0xc3 true)
    const b11 = decoder.buf[decoder.off]
    if (b11 !== 0xc2 && b11 !== 0xc3) return false

    return true
  } catch (e) {
    return false
  } finally {
    decoder.off = startOff
  } // Resetear puntero para poder decodificarlo luego
}

function _extractObj12Data(decoder) {
  /*
  [[1189808496191],1590,     0,2,0, 1,   0,0, [277,418,82] ,[0] ,1776856789 ,false]
   objectId,       staticId, 0,2,0,level,0,0, [kingdom,x,y], [0], unknown, isUnlocked
*/
  // Entramos al array principal de 12
  decoder.readArrayHeader() // outside wrapper[]

  // [0] ID de objeto (Está en un array de 1)
  decoder.readArrayHeader() //[objid]
  const objectId = decoder.decode() // objid valie

  // [1] staticId
  const staticId = decoder.decode()

  // [2] al [4] No nos interesan (0, 2, 0)
  decoder.skip() // salta el 0
  decoder.skip() // salta el 2
  decoder.skip() // salta el 0

  // [5] Level
  const level = decoder.decode()

  // [6] y [7] No nos interesan (0, 0)
  decoder.skip()
  decoder.skip()

  // [8] Posición [kingdom, x, y]
  decoder.readArrayHeader()
  const kingdom = decoder.decode()
  const x = decoder.decode()
  const y = decoder.decode()

  // [9]   No nos interesan
  decoder.skip() // salta [0]

  // [10] isUnlocked (Timestamp)
  const timestamp = decoder.decode()

  // [11] isUnlocked (Boolean)
  const isUnlocked = decoder.decode()

  return { objectId, staticId, level, kingdom, x, y, timestamp, isUnlocked }
}

// Opcode 402 - Versión 23 elementos
function _isValidPlayerObject23(decoder) {
  const startOff = decoder.off
  try {
    const len = decoder.readArrayHeader()
    if (len !== 23) return false

    // [0] Array de 1 [1108101725624]  object id
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [1], [2], [3] deben ser Strings (0xa0-0xbf, 0xd9-0xdb)
    if (!decoder.isNextString()) return false
    decoder.skip() //"tb:54052127"
    if (!decoder.isNextString()) return false
    decoder.skip() //"Scarlet Witch"
    if (!decoder.isNextString()) return false
    decoder.skip() //"IN"

    if (!decoder.isNextNumber()) return false
    decoder.skip() // hero type  2=alrick 3=thaddeus

    // [4]... saltar hasta el [6]
    for (let i = 5; i <= 6; i++) decoder.skip()

    // [7] Number (hero Level)
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    // [8] Number (city Level)
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    //[9]
    decoder.skip()

    // [10] Number (might)
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    // [11] Array de 1 [1108101725624]  clan id
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    //[12]
    decoder.skip()

    //[13] clan name
    if (!decoder.isNextString()) return false
    decoder.skip() //"BLD"

    //[14]  0
    decoder.skip()

    //[15]  cooords [k,x,y]
    if (decoder.readArrayHeader() !== 3) return false
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // [16] Array de 1 [1108101725624]  clan id
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    //[17]  // gold ingots
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    //[18]
    decoder.skip()

    // [19 y 20]  2 arrays
    decoder.skip()
    decoder.skip()

    //[21] timezone  "(UTC-50-30)"
    if (!decoder.isNextString()) return false
    decoder.skip()

    return true // Si pasa estas pruebas críticas, es el objeto
  } catch (e) {
    return false
  } finally {
    decoder.off = startOff
  }
}

function _extractObj23Data(decoder) {
  // Entramos al array principal de 23
  decoder.readArrayHeader()

  // [0] ID de objeto (Está en un array de 1)
  decoder.readArrayHeader() // ["1189748226882n"]
  const playerId = decoder.decode()

  // [1] progressId
  const progressId = decoder.decode() // "tb:54052127"
  // [2] name
  const playerName = decoder.decode() // "Scarlet Witch"
  // [3] country
  const country = decoder.decode() // "IN"

  //[4] hero type
  const heroType = decoder.decode() // hero type  2=alrick 3=thaddeus

  // salta [5,6]
  decoder.skip()
  decoder.skip()

  // [7] heroLevel
  const heroLevel = decoder.decode() // 201
  // [8] city Level
  const cityLevel = decoder.decode() // 40

  // salta [9]
  decoder.skip()

  // [10] might
  const might = decoder.decode() // 172162451

  // [11] clan ID  (Está en un array de 1)
  decoder.readArrayHeader() // ["1189748226882n"]
  const clanId = decoder.decode()

  // salta [12]
  decoder.skip()

  // [13] clan name
  const clanName = decoder.decode() // 40

  // salta [14]
  decoder.skip()

  //[15] coords  [k,x,y]
  decoder.readArrayHeader()
  const kingdom = decoder.decode()
  const x = decoder.decode()
  const y = decoder.decode()

  // salta [16]  [11111111] // otro id
  const objectId = decoder.decode()

  // [17] gold
  const gold = decoder.decode() // 40

  //salta [18,19,20]  num,y 2 array
  decoder.skip()
  decoder.skip()
  decoder.skip()

  // [21] timezone "(UTC-50-30)"
  const timezone = decoder.decode() // 40

  //[22]     [0]
  decoder.skip()

  return {
    objectId,
    playerId,
    progressId,
    playerName,
    country,
    heroType,
    heroLevel,
    cityLevel,
    might,
    clanId,
    clanName,
    kingdom,
    x,
    y,
    gold,
    timezone
  }
}

function _isValidPlayerObject42(decoder) {
  const startOff = decoder.off

  try {
    const len = decoder.readArrayHeader() // enter inside wrapper []
    if (len !== 42) return false

    // [0]: Array de 1 (ObjectId)  [1189706100123]
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip() // objectId value

    // [1]: Desconocido (Saltamos)
    decoder.skip() //skip the whole array and content [0]

    // [2]: Array de 1 [1189706100452]
    if (decoder.readArrayHeader() !== 1) return false // goes inside, consume the header byte 0x91
    decoder.skip() // 1189706100452  (skip number marker +value)

    // [3]: Number (StaticId) 2
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    // [4]: Array de 1 [clan id ?]  0=noclan
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip() // [0]

    // [5, 6]: Saltamos
    decoder.skip() //0
    decoder.skip() //32583

    // [7]: Number (Kingdom)
    if (!decoder.isNextNumber()) return false
    decoder.skip() //277

    // [8-12]: Saltamos
    decoder.skip() //0
    decoder.skip() //0
    decoder.skip() //0
    decoder.skip() //0
    decoder.skip() //0

    // [13]: Number (level)
    if (!decoder.isNextNumber()) return false
    decoder.skip() //29

    // [14-16]: Number
    if (!decoder.isNextNumber()) return false
    decoder.skip() //9

    decoder.skip() //0
    decoder.skip() //0

    // [17]: Array de 3 (source Coord)
    if (decoder.readArrayHeader() !== 3) return false
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // [18]: Array de 3 (target Coord) // when different , its attacking something: ie: arena
    if (decoder.readArrayHeader() !== 3) return false
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // OTRO SALTO: Del [19] al [25] (7 elementos)
    for (let i = 19; i <= 25; i++) decoder.skip()

    // [26]: Array de 4
    if (decoder.readArrayHeader() !== 4) return false
    decoder.skip()
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // GRAN SALTO FINAL: Del [27] al [38] (12 elementos)
    for (let i = 27; i <= 38; i++) decoder.skip()

    // [39]: Boolean (Shield)
    const b11 = decoder.buf[decoder.off]
    if (b11 !== 0xc2 && b11 !== 0xc3) return false
    decoder.skip()

    // [40]: Number timestamp
    if (!decoder.isNextNumber()) return false
    decoder.skip() // 1774484547

    // Si llegamos aquí sin que falle un "return false", es el objeto correcto
    return true
  } catch (e) {
    console.log('_isValidPlayerObject42: error', e.message)
    return false
  } finally {
    // Importante: siempre regresamos el puntero al inicio del objeto
    // por si queremos decodificarlo realmente después.
    decoder.off = startOff
  }
}

function _extractObj42Data(decoder) {
  /*

[
 ["1189748226882n"], // obj id
 [0],
 ["1189706126942n"],
 2,
 ["1206885810227n"], // clan id
 0, 325636,
 277, //kingdom
 0, 0, 0, 0, 0,
 29, // level
 9, 0, 0,
 [277,450,116], // source coord
 [277,450,116], // target coord, when attack, this changes to target: ie arena location
 0, 0, 0, 0, 0, 0, 0,
 [0,0,0,0], 0, 0, [0,0,0,[ 0 ],null, ""], 0, 0, 0, [0], [0], 0, 0, 0, 0,
 true, // is shielded ?
 1774484547, // timestamp
 null
]
*/
  // Entramos al array principal de 42
  decoder.readArrayHeader()

  // [0] ID de objeto (Está en un array de 1)
  decoder.readArrayHeader() // ["1189748226882n"]
  const objectId = decoder.decode()

  //[1]
  decoder.skip() // salta el [0]
  //  decoder.readArrayHeader()
  // const coso1 = decoder.decode()

  // [2] otro ID (Está en un array de 1)
  decoder.readArrayHeader() //["1189706126942n"]
  const playerId = decoder.decode()

  // [3] staticId
  const staticId = decoder.decode() //2

  // [4] clan ID de objeto (Está en un array de 1)
  decoder.readArrayHeader() // ["1206885810227n"],
  const clanId = decoder.decode()

  // [5] al [6] No nos interesan (0, 325636)
  decoder.skip() // salta el 0
  decoder.skip() // salta el 325636
  // const coso5 = decoder.decode()
  // const coso6 = decoder.decode()

  // [7] kingdom
  const kingdom = decoder.decode() //277

  // [8] al [12] No nos interesan (0, 0,0,0,0)
  decoder.skip()
  decoder.skip()
  decoder.skip()
  decoder.skip()
  decoder.skip()
  // const coso8 = decoder.decode()
  // const coso9 = decoder.decode()
  // const coso10 = decoder.decode()
  // const coso11= decoder.decode()
  // const coso12 = decoder.decode()

  // [13] level
  const cityLevel = decoder.decode() //29

  // [14] al [16] No nos interesan (9, 0, 0)
  decoder.skip()
  decoder.skip()
  decoder.skip()
  // const coso14 = decoder.decode()
  // const coso15 = decoder.decode()
  // const coso16 = decoder.decode()

  // [17] Posición [kingdom, x, y]
  decoder.readArrayHeader()
  const sourceKingdom = decoder.decode()
  const sourceX = decoder.decode()
  const sourceY = decoder.decode()

  // [18] target Posición [kingdom, x, y]
  decoder.readArrayHeader()
  const targetKingdom = decoder.decode()
  const targetX = decoder.decode()
  const targetY = decoder.decode()

  // [19 al 38]   No nos interesan
  for (let i = 19; i <= 25; i++) decoder.skip()
  for (let i = 26; i <= 38; i++) decoder.skip()

  // [39] shieldOn? (boolen)
  const hasShield = decoder.decode()

  // [40] timestamp
  const timestamp = decoder.decode()

  return {
    objectId,
    playerId, //
    staticId, //
    clanId,
    kingdom,
    cityLevel,
    sourceKingdom,
    sourceX,
    sourceY,
    targetKingdom,
    targetX,
    targetY,
    hasShield,
    timestamp
  }
}

// Escanea el buffer buscando todos los objetos válidos que coincidan con tus reglas
function scanPacket312(buffer) {
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length

  const results = {
    players42: [],
    // players23: [],
    objects12: []
  }

  const limit = decoder.buf.length

  while (decoder.off < limit) {
    const startOfEntry = decoder.off
    const byte = decoder.buf[decoder.off]

    // Solo nos interesan los marcadores de Array (Fixarray, Array16, Array32)
    if ((byte >= 0x90 && byte <= 0x9f) || byte === 0xdc || byte === 0xdd) {
      // 1. Intentamos validar cada estructura (El orden importa: de más compleja a menos)
      if (_isValidPlayerObject42(decoder)) {
        // this will push an array of msgpack which is the playerobjet42
        // and will need to decode that structure to get the real data
        // { objectId, playerId, staticId, clanId, kingdom, level, sourceKingdom, sourceX, sourceY, targetKingdom, targetX, targetY, isShieldActive }
        const player = _extractObj42Data(decoder)
        results.players42.push(player)

        continue // El decode ya movió el off al final del objeto
      }

      decoder.off = startOfEntry
      if (_isObject12(decoder)) {
        results.objects12.push(_extractObj12Data(decoder))
        continue
      }
    }

    // Si no fue ninguna estructura conocida, avanzamos 1 byte y seguimos buscando
    decoder.off = startOfEntry + 1
  }

  // temp code to save packet if staticid 400 in it
  // to check if there are a way to know what % remain/progress it have
  // const shouldSave = results.objects12.some(obj => obj.staticId === 400)
  // const separator = new Int8Array(10)
  // separator.fill(11)

  // if (shouldSave && counter < 20) {
  //   logStream.write(decoder.buf)
  //   logStream.write(separator)
  //   counter++
  // }
  return results
}

function scanPacket402(buffer) {
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length

  const results = {
    players23: []
  }

  const limit = decoder.buf.length

  while (decoder.off < limit) {
    const startOfEntry = decoder.off
    const byte = decoder.buf[decoder.off]

    // Solo nos interesan los marcadores de Array (Fixarray, Array16, Array32)
    if ((byte >= 0x90 && byte <= 0x9f) || byte === 0xdc || byte === 0xdd) {
      // 1. Intentamos validar cada estructura (El orden importa: de más compleja a menos)

      if (_isValidPlayerObject23(decoder)) {
        const player = _extractObj23Data(decoder)
        results.players23.push(player)
        continue // El decode ya movió el off al final del objeto
      }
    }

    // Si no fue ninguna estructura conocida, avanzamos 1 byte y seguimos buscando
    decoder.off = startOfEntry + 1
  }

  return results
}

function scanPacket24301(buffer) {
  const decoder = getDecoder(buffer)
  decoder.off = 8 //skip packet length

  const results = {
    flags: []
  }

  const startOfEntry = decoder.off
  const byte = decoder.buf[decoder.off]

  // [24301, seq] [{ "1198295910531": [ 19,1777835062] }]
  // [24301, seq] [{  }]
  /** //? someid        flagLevel, timestamp
   * "1198295910531":  [ 19, 1777835062]
   * "1198295933781": [ 19, 1777835062]
   * "1198295959826": [ 30, 1777835062]
   * "1198296104118": [ 19, 1777835062]
   * "1198296179956": [ 35, 1777835062]
   * "1198296182930": [ 35, 1777835062]
   *
   * total: 3x19 , 1x30, 2x35 =  6 flags
   */
  decoder.skip() // header [24301,seq]

  const flagsData = decoder.decode() //[{ "1198295910531": [ 19,1777835062] }]

  return flagsData
}

module.exports = {
  getDecoder,
  getEncoder,
  decodeBase64,
  encodeBase64,
  decodeMsgPack2,
  decodeMsgPackBase64,
  multiDecodeMsgPack2,
  multiDecodeMsgPackBase64,
  encodeMsgPack2MultiFragments,
  encodeMsgPack2,
  encodeMsgPack2ToBase64,
  // game functions
  findMyValuesInPacket,
  getRequestHeader,
  getChestCode,
  getChestCodeResponse,
  getTroopTrainCode,
  getMsgPack2ndBlockRequest,
  scanPacket312,
  scanPacket24301,
  scanPacket402
}

// const p312 =
//   '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'
// const bytes = decodeBase64(p312)
// const { players42, objects12 } = scanPacket312(bytes)

// console.log('testing scanPacket312', 'players', players42.length, 'objects', objects12.length)
// console.log(styleText('red', 'first 5 players'))
// players42.slice(0, 5).forEach(player => console.log(player))
// console.log(styleText('red', 'first 5 objects'))
// objects12
//   .slice(0, 5)
//   .forEach(object =>
//     console.log(
//       styleText(
//         'green',
//         `${object.kingdom}:${object.x}:${object.y} staticId = ${object.staticId} level = ${object.level}`
//       )
//     )
//   )

// const normalArray = [
//   220, 42, 0, 145, 207, 66, 59, 133, 2, 21, 1, 0, 0, 145, 0, 145, 207, 94, 214, 2, 0, 21, 1, 0, 0,
//   2, 145, 207, 51, 0, 0, 0, 25, 1, 0, 0, 0, 206, 4, 248, 4, 0, 205, 21, 1, 0, 0, 0, 0, 0, 29, 9, 0,
//   0, 147, 205, 21, 1, 205, 194, 1, 116, 147, 205, 21, 1, 205, 194, 1, 116, 0, 0, 0, 0, 0, 0, 0, 148,
//   0, 0, 0, 0, 0, 0, 150, 0, 0, 0, 145, 0, 192, 160, 0, 0, 0, 145, 0, 145, 0, 0, 0, 0, 0, 195, 206,
//   67, 124, 196, 105, 192
// ]
// const uint8 = new Uint8Array(normalArray)
// const dec = getDecoder(uint8)

// // dec.off = 1
// console.log(_isValidPlayerObject42(dec))
// console.log(_extractObj42Data(dec))

// const p402 =
//   'owAAAKMAAACSzZIBzVHwkZHcFwCRz0OeAQASAQAAq3RiOjY0NjQ2NTYwpEtBbm6iVVMIzp2WmADOrZaYAHMiEM4mla8Ekc8UAAAApgAAAM4aFAIAo0FPVwCTzJLNsgHNyAGRz+S/DgISAQAAzVcCzketIgCRksygztmr8mmWkh0BksygEpLMoReSzKIMks0sAQGSzUkBAakoVVRDKzcwMCmRAQ=='
// const bytes2 = decodeBase64(p402)
// const { players23 } = scanPacket402(bytes2)
// console.log('testing scanPacket312', 'players', players23.length)
// console.log(styleText('blue', 'first 5 players'))
// players23.slice(0, 5).forEach(player => console.log(player))

//test 313
// const p313 =
//   'BAEAAAQBAACSzTkBzbxvk9wkAJHPEwAAAPsAAADcGACRz3TPAwD7AAAAkc93AAAA+wAAAM3fJM7MiqRnAADOUUQQAM14A8z7zPuRAAEBkwAAAJMAAAAAAAAAAADOzIqkZwAAmQAAoAAAAAAAAJQAAAAAkIIQkhDOzUcZDEWSRc7gkwQAkIDAkJCAgICQkJSUzbTDAM6+PPZpzj6O92mUzbXDAM7BPPZpzkGO92mUzbbDAM7EPPZpzkSO92mUzbfDAM7HPPZpzkeO92mAgJCAgAAAxAxp6LwFRpnbz+qxzmgugICRAJHPAgAAAPsAAACQAMLAwADEDGnou/1GmdvP6rFcigs='
// const bytes313 = decodeBase64(p313)
// const { results: results313 } = multiDecodeMsgPack2(bytes313)
// console.log('decoded', JSON.stringify(results313[1]))
// console.log('userid', results313[1][0][0][0])
// console.log('token', new Uint8Array(results313[1][0][24]))
