const { MsgPackTurboDecoder, MsgPackLazyDecoder, MsgPackTurboEncoder } = require('message-pack')

// class MsgPackGame extends MsgPackLazyDecoder {

// }
// Capture error: MsgPackLazyDecoder is not a constructor

let decoder = null

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
  decoder.readArrayHeader()

  // [0] ID de objeto (Está en un array de 1)
  decoder.readArrayHeader()
  const objectId = decoder.decode()

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
function _isPlayerObject23(decoder) {
  const startOff = decoder.off
  try {
    const len = decoder.readArrayHeader()
    if (len !== 23) return false

    // [0] Array de 1
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [1], [2], [3] deben ser Strings (0xa0-0xbf, 0xd9-0xdb)
    if (!decoder.isNextString()) return false
    decoder.skip()
    if (!decoder.isNextString()) return false
    decoder.skip()
    if (!decoder.isNextString()) return false
    decoder.skip()

    // ... saltar hasta el [8]
    for (let i = 4; i <= 7; i++) decoder.skip()

    // [8] Number (Level)
    if (!decoder.isNextNumber()) return false

    return true // Si pasa estas pruebas críticas, es el objeto
  } catch (e) {
    return false
  } finally {
    decoder.off = startOff
  }
}

function _isValidPlayerObject42(decoder) {
  const startOff = decoder.off
  try {
    const len = decoder.readArrayHeader()
    if (len !== 42) return false

    // [0]: Array de 1 (ObjectId)
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [1]: Desconocido (Saltamos)
    decoder.skip()

    // [2]: Array de 1
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [3]: Number (StaticId)
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    // [4]: Array de 1
    if (decoder.readArrayHeader() !== 1) return false
    decoder.skip()

    // [5, 6]: Saltamos
    decoder.skip()
    decoder.skip()

    // [7]: Number (Kingdom)
    if (!decoder.isNextNumber()) return false
    decoder.skip()

    // [8-10]: Saltamos
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // [11]: Boolean (Shield)
    const b11 = decoder.buf[decoder.off]
    if (b11 !== 0xc2 && b11 !== 0xc3) return false
    decoder.skip()

    // [12]: Saltamos
    decoder.skip()

    // [13]: Number (Level)
    if (!decoder.isNextNumber()) return false

    // SALTO GRANDE: Del [14] al [16] (3 elementos)
    for (let i = 14; i <= 16; i++) decoder.skip()

    // [17]: Array de 3 (Coord A)
    if (decoder.readArrayHeader() !== 3) return false
    decoder.skip()
    decoder.skip()
    decoder.skip()

    // [18]: Array de 3 (Coord B)
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

    // [39]: Array de 1
    if (decoder.readArrayHeader() !== 1) return false

    // Si llegamos aquí sin que falle un "return false", es el objeto correcto
    return true
  } catch (e) {
    return false
  } finally {
    // Importante: siempre regresamos el puntero al inicio del objeto
    // por si queremos decodificarlo realmente después.
    decoder.off = startOff
  }
}

function _extractObj42Data(decoder) {
  /*
  [[1189808496191],1590,     0,2,0, 1,   0,0, [277,418,82] ,[0] ,1776856789 ,false]
   objectId,       staticId, 0,2,0,level,0,0, [kingdom,x,y], [0], unknown, isUnlocked
*/
  // Entramos al array principal de 12
  decoder.readArrayHeader()

  // [0] ID de objeto (Está en un array de 1)
  decoder.readArrayHeader()
  const objectId = decoder.decode()

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
// Auxiliares de ultra velocidad
function isNextString(decoder) {
  const b = decoder.buf[decoder.off]
  return (b >= 0xa0 && b <= 0xbf) || b === 0xd9 || b === 0xda || b === 0xdb
}

// isNextNumber() {
//   const b = this.buf[this.off]
//   // FixInt (+/-), marcadores de int8-64, y marcadores de floats
//   return b <= 0x7f || b >= 0xe0 || (b >= 0xca && b <= 0xd3) || (b >= 0xcc && b <= 0xce)
// }
function isNextNumber(decoder) {
  const b = decoder.buf[decoder.off]
  return (
    b <= 0x7f || b >= 0xe0 || (b >= 0xca && b <= 0xd3) || b === 0xcc || b === 0xcd || b === 0xce
  )
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
        results.players42.push(decoder.decode())
        continue // El decode ya movió el off al final del objeto
      }

      decoder.off = startOfEntry
      if (_isValidObject12(decoder)) {
        results.objects12.push(_extractObj12Data(decoder))
        continue
      }
    }

    // Si no fue ninguna estructura conocida, avanzamos 1 byte y seguimos buscando
    decoder.off = startOfEntry + 1
  }

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
        results.players23.push(decoder.decode())
        continue
      }
    }

    // Si no fue ninguna estructura conocida, avanzamos 1 byte y seguimos buscando
    decoder.off = startOfEntry + 1
  }

  return results
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
  getRequestHeader,
  getMsgPack2ndBlockRequest,
  // findFirstInt,
  // isObject12,
  // extractObj12Data,
  // isPlayerObject23,
  // isValidPlayerObject42,
  // extractObj42Data,
  scanPacket312,
  scanPacket402
}
