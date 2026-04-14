class MsgPackDecoder {
  constructor(buffer) {
    this.buf = new Uint8Array(buffer)
    this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength)
    this.off = 0
    this.decoder = new TextDecoder()
  }

  decode() {
    const byte = this.buf[this.off++]

    // 1. Enteros Positivos (0x00 - 0x7f)
    if (byte <= 0x7f) return byte

    // 2. Mapas Pequeños (0x80 - 0x8f)
    if (byte >= 0x80 && byte <= 0x8f) return this.readMap(byte & 0x0f)

    // 3. Arrays Pequeños (0x90 - 0x9f)
    if (byte >= 0x90 && byte <= 0x9f) return this.readArray(byte & 0x0f)

    // 4. Strings Pequeños (0xa0 - 0xbf)
    if (byte >= 0xa0 && byte <= 0xbf) return this.readString(byte & 0x1f)

    // 5. Tipos Especiales (Nulos, Booleanos, etc.)
    switch (byte) {
      case 0xc0:
        return null
      case 0xc2:
        return false
      case 0xc3:
        return true

      // 6. Binarios (Raw bytes)
      case 0xc4:
        return this.readBinary(this.view.getUint8(this.off++))
      case 0xc5:
        return this.readBinary(this.view.getUint16((this.off += 2) - 2))
      case 0xc6:
        return this.readBinary(this.view.getUint32((this.off += 4) - 4))

      // 7. Floats (IEEE 754)
      case 0xca:
        return this.view.getFloat32((this.off += 4) - 4)
      case 0xcb:
        return this.view.getFloat64((this.off += 8) - 8)

      // 8. Enteros (8, 16, 32, 64 bits)
      case 0xcc:
        return this.view.getUint8(this.off++)
      case 0xcd:
        return this.view.getUint16((this.off += 2) - 2)
      case 0xce:
        return this.view.getUint32((this.off += 4) - 4)
      case 0xcf:
        return this.view.getBigUint64((this.off += 8) - 8)
      case 0xd0:
        return this.view.getInt8(this.off++)
      case 0xd1:
        return this.view.getInt16((this.off += 2) - 2)
      case 0xd2:
        return this.view.getInt32((this.off += 4) - 4)
      case 0xd3:
        return this.view.getBigInt64((this.off += 8) - 8)

      // 9. Strings largos
      case 0xd9:
        return this.readString(this.view.getUint8(this.off++))
      case 0xda:
        return this.readString(this.view.getUint16((this.off += 2) - 2))
      case 0xdb:
        return this.readString(this.view.getUint32((this.off += 4) - 4))

      // 10. Arrays y Mapas largos
      case 0xdc:
        return this.readArray(this.view.getUint16((this.off += 2) - 2))
      case 0xdd:
        return this.readArray(this.view.getUint32((this.off += 4) - 4))
      case 0xde:
        return this.readMap(this.view.getUint16((this.off += 2) - 2))
      case 0xdf:
        return this.readMap(this.view.getUint32((this.off += 4) - 4))
    }

    // 11. Enteros Negativos (0xe0 - 0xff)
    if (byte >= 0xe0) return byte - 0x100

    throw new Error(`Tipo no soportado: 0x${byte.toString(16)}`)
  }

  readString(len) {
    const val = this.decoder.decode(this.buf.subarray(this.off, this.off + len))
    this.off += len
    return val
  }

  readBinary(len) {
    const val = this.buf.slice(this.off, this.off + len)
    this.off += len
    return val
  }

  readArray(len) {
    const arr = new Array(len)
    for (let i = 0; i < len; i++) arr[i] = this.decode()
    return arr
  }

  readMap(len) {
    const obj = {}
    for (let i = 0; i < len; i++) {
      const key = this.decode()
      obj[key] = this.decode()
    }
    return obj
  }
}

// Ejemplo de uso:
// const decoder = new MsgPackDecoder(miBuffer);
// console.log(decoder.decode());

function readValue(buf, off) {
  if (off >= buf.length) return { val: null, end: buf.length }
  const byte = buf[off++]

  // Create DataView for multi-byte reads
  const dataView = new DataView(buf.buffer, buf.byteOffset)

  // Helper functions for DataView reads
  const readUint16BE = offset => dataView.getUint16(offset, false)
  const readUint32BE = offset => dataView.getUint32(offset, false)
  const readUint16LE = offset => dataView.getUint16(offset, true)
  const readUint32LE = offset => dataView.getUint32(offset, true)
  const readInt8 = offset => dataView.getInt8(offset)
  const readInt16LE = offset => dataView.getInt16(offset, true)
  const readInt32LE = offset => dataView.getInt32(offset, true)
  const readFloat32 = offset => dataView.getFloat32(offset, false)
  const readFloat64 = offset => dataView.getFloat64(offset, false)

  if ((byte & 0x80) === 0) return { val: byte, end: off }
  if ((byte & 0xe0) === 0xe0) return { val: byte - 256, end: off }

  if ((byte & 0xf0) === 0x80) {
    const size = byte & 0x0f
    const obj = {}
    let o = off
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  if ((byte & 0xf0) === 0x90) {
    const size = byte & 0x0f
    const arr = []
    let o = off
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if ((byte & 0xe0) === 0xa0) {
    const len = byte & 0x1f
    return { val: buf.slice(off, off + len).toString('utf8'), end: off + len }
  }

  if (byte === 0xc0) return { val: null, end: off }
  if (byte === 0xc2) return { val: false, end: off }
  if (byte === 0xc3) return { val: true, end: off }

  if (byte === 0xc4) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len }
  }
  if (byte === 0xc5) {
    const len = readUint16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len }
  }
  if (byte === 0xc6) {
    const len = readUint32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len }
  }

  if (byte >= 0xc7 && byte <= 0xc9) {
    let len, dataOff
    if (byte === 0xc7) {
      len = buf[off]
      dataOff = off + 2
    } else if (byte === 0xc8) {
      len = readUint16BE(off)
      dataOff = off + 3
    } else {
      len = readUint32BE(off)
      dataOff = off + 5
    }
    const type = buf[dataOff]
    const data = buf.slice(dataOff + 1, dataOff + 1 + len - 1)
    return { val: { type, data }, end: dataOff + len }
  }

  if (byte === 0xca) {
    return { val: readFloat32(off), end: off + 4 }
  }
  if (byte === 0xcb) {
    return { val: readFloat64(off), end: off + 8 }
  }

  if (byte === 0xcc) return { val: buf[off], end: off + 1 }
  if (byte === 0xcd) return { val: readUint16LE(off), end: off + 2 }
  if (byte === 0xce) return { val: readUint32LE(off), end: off + 4 }
  if (byte === 0xcf) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  if (byte === 0xd0) return { val: readInt8(off), end: off + 1 }
  if (byte === 0xd1) return { val: readInt16LE(off), end: off + 2 }
  if (byte === 0xd2) return { val: readInt32LE(off), end: off + 4 }
  if (byte === 0xd3) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  if (byte >= 0xd4 && byte <= 0xd8) {
    const sizes = [1, 2, 4, 8, 16]
    const size = sizes[byte - 0xd4]
    return {
      val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) },
      end: off + 1 + size
    }
  }

  if (byte === 0xd9) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len }
  }
  if (byte === 0xda) {
    const len = readUint16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len }
  }
  if (byte === 0xdb) {
    const len = readUint32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len }
  }

  if (byte === 0xdc) {
    const size = readUint16BE(off)
    const arr = []
    let o = off + 2
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if (byte === 0xdd) {
    const size = readUint32BE(off)
    const arr = []
    let o = off + 4
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const v = readValue(buf, o)
      arr.push(v.val)
      o = v.end
    }
    return { val: arr, end: o }
  }

  if (byte === 0xde) {
    const size = readUint16BE(off)
    const obj = {}
    let o = off + 2
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  if (byte === 0xdf) {
    const size = readUint32BE(off)
    const obj = {}
    let o = off + 4
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break
      const k = readValue(buf, o)
      o = k.end
      if (o >= buf.length) break
      const v = readValue(buf, o)
      o = v.end
      obj[k.val] = v.val
    }
    return { val: obj, end: o }
  }

  return { val: null, end: off + 1 }
}

// Decode a full buffer starting from offset 8 (skip 8-byte header)
export function decodeMsgPack(buf) {
  const results = []
  let off = 8
  while (off < buf.length) {
    try {
      const result = readValue(buf, off)
      if (result.val !== null) {
        results.push(result.val)
        off = result.end
      } else {
        off++
      }
    } catch (e) {
      off++
    }
  }
  return results
}

export function decodeMsgPackBase64(base64String) {
  try {
    let cleanBase64 = base64String.replace(/\s/g, '')
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }

    const binaryString = atob(cleanBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return decodeMsgPack(bytes)
  } catch (e) {
    throw new Error('Failed to decode: ' + e.message)
  }
}

/// usando el msgpack decoder de gooogleAI
export function decodeMsgPack2(buff) {
  // 1. Instanciamos el decoder
  const decoder = new MsgPackDecoder(bytes)

  // 2. Leemos los dos enteros del encabezado (4 bytes cada uno)
  // Usamos getUint32. El primero está en offset 0, el segundo en offset 4.
  const longitud1 = decoder.view.getUint32(0) // Offset 0
  const longitud2 = decoder.view.getUint32(4) // Offset 4

  console.log(`Longitudes del encabezado: ${longitud1}, ${longitud2}`)

  // 3. Posicionamos el offset en 8 para saltar el encabezado
  decoder.off = 8

  // 4. Decodificamos el payload MessagePack
  const data = decoder.decode()
  console.log('Contenido:', data)
  return data
}

export function multiDecodeMsgPack2(buff) {
  const decoder = new MsgPackDecoder(bytes)
  // 2. Leemos los dos enteros del encabezado (4 bytes cada uno)
  // Usamos getUint32. El primero está en offset 0, el segundo en offset 4.
  const longitud1 = decoder.view.getUint32(0) // Offset 0
  const longitud2 = decoder.view.getUint32(4) // Offset 4

  console.log(`Longitudes del encabezado: ${longitud1}, ${longitud2}`)

  decoder.off = 8 // Saltamos tu encabezado

  const results = []

  // Mientras no hayamos llegado al final del buffer
  while (decoder.off < bytes.length) {
    results.push(decoder.decode())
  }

  console.log(results) // Aquí tienes todo el contenido
  return results
}

//-------------
class MsgPackEncoder {
  constructor() {
    this.buffer = new Uint8Array(1024) // Buffer inicial
    this.view = new DataView(this.buffer.buffer)
    this.off = 0
    this.encoder = new TextEncoder()
  }

  // Asegura que haya espacio suficiente en el buffer
  ensureSpace(bytes) {
    if (this.off + bytes > this.buffer.length) {
      let newLength = this.buffer.length * 2
      while (this.off + bytes > newLength) newLength *= 2
      let newBuffer = new Uint8Array(newLength)
      newBuffer.set(this.buffer)
      this.buffer = newBuffer
      this.view = new DataView(this.buffer.buffer)
    }
  }

  encode(val) {
    // 1. Nulos y Booleanos
    if (val === null) return this.writeUint8(0xc0)
    if (val === false) return this.writeUint8(0xc2)
    if (val === true) return this.writeUint8(0xc3)

    const type = typeof val

    // 2. Números
    if (type === 'number') {
      if (Number.isInteger(val)) {
        if (val >= 0 && val <= 127) return this.writeUint8(val) // positive fixint
        if (val < 0 && val >= -32) return this.writeUint8(0xe0 | (val + 32)) // negative fixint

        // Enteros más grandes (simplificado a 32 bits para este ejemplo)
        if (val > 0) {
          this.writeUint8(0xce)
          return this.writeUint32(val)
        } else {
          this.writeUint8(0xd2)
          return this.writeInt32(val)
        }
      } else {
        // Flotantes (double)
        this.writeUint8(0xcb)
        return this.writeFloat64(val)
      }
    }

    // Dentro de encode(val)
    if (type === 'bigint') {
      if (val >= 0n) {
        this.writeUint8(0xcf) // uint 64
        this.writeBigUint64(val)
      } else {
        this.writeUint8(0xd3) // int 64
        this.writeBigInt64(val)
      }
      return
    }

    // 3. Strings
    if (type === 'string') {
      const bytes = this.encoder.encode(val)
      const len = bytes.length
      if (len <= 31) {
        this.writeUint8(0xa0 | len)
      } else if (len <= 255) {
        this.writeUint8(0xd9)
        this.writeUint8(len)
      } else if (len <= 65535) {
        this.writeUint8(0xda)
        this.writeUint16(len)
      } else {
        this.writeUint8(0xdb)
        this.writeUint32(len)
      }
      this.ensureSpace(len)
      this.buffer.set(bytes, this.off)
      this.off += len
      return
    }

    // 4. Arrays
    if (Array.isArray(val)) {
      const len = val.length
      if (len <= 15) this.writeUint8(0x90 | len)
      else if (len <= 65535) {
        this.writeUint8(0xdc)
        this.writeUint16(len)
      } else {
        this.writeUint8(0xdd)
        this.writeUint32(len)
      }

      for (const item of val) this.encode(item)
      return
    }

    // 5. Mapas (Objetos)
    if (type === 'object') {
      const keys = Object.keys(val)
      const len = keys.length
      if (len <= 15) this.writeUint8(0x80 | len)
      else if (len <= 65535) {
        this.writeUint16(0xde)
        this.writeUint16(len)
      } else {
        this.writeUint8(0xdf)
        this.writeUint32(len)
      }

      for (const key of keys) {
        this.encode(key)
        this.encode(val[key])
      }
      return
    }
  }

  // Métodos auxiliares de escritura
  writeUint8(v) {
    this.ensureSpace(1)
    this.view.setUint8(this.off++, v)
  }
  writeUint16(v) {
    this.ensureSpace(2)
    this.view.setUint16(this.off, v)
    this.off += 2
  }
  writeUint32(v) {
    this.ensureSpace(4)
    this.view.setUint32(this.off, v)
    this.off += 4
  }
  writeBigUint64(v) {
    this.ensureSpace(8)
    this.view.setBigUint64(this.off, v)
    this.off += 8
  }

  writeBigInt64(v) {
    this.ensureSpace(8)
    this.view.setBigInt64(this.off, v)
    this.off += 8
  }

  writeInt32(v) {
    this.ensureSpace(4)
    this.view.setInt32(this.off, v)
    this.off += 4
  }
  writeFloat64(v) {
    this.ensureSpace(8)
    this.view.setFloat64(this.off, v)
    this.off += 8
  }

  getFinalBuffer() {
    return this.buffer.subarray(0, this.off)
  }
}

export function encodeMsgPack2(value) {
  const encoder = new MsgPackEncoder()

  // 1. Escribir manualmente tu encabezado de 8 bytes
  // (Por ejemplo, si longitud1 y longitud2 eran los valores originales)
  encoder.writeUint32(longitud1)
  encoder.writeUint32(longitud2)

  // 2. Codificar el objeto JS de vuelta a MessagePack
  encoder.encode(value)

  // 3. Obtener el resultado final
  return encoder.getFinalBuffer()
}

export function encodeMsgPack2ToBase64(value) {
  const b64 = btoa(String.fromCharCode(...encodeMsgPack2(value)))
  return b64
}

// ============================================================
// MessagePack Encoder
// ============================================================

export function encodeMsgPack(value) {
  const chunks = []

  function encode(val) {
    const type = typeof val

    // null
    if (val === null || val === undefined) {
      chunks.push(0xc0)
      return
    }

    // Boolean
    if (type === 'boolean') {
      chunks.push(val ? 0xc3 : 0xc2)
      return
    }

    // Number
    if (type === 'number') {
      if (Number.isInteger(val)) {
        // Integer handling
        if (val >= 0) {
          if (val < 128) {
            // Positive fixnum
            chunks.push(val)
          } else if (val < 256) {
            // uint8
            chunks.push(0xcc, val)
          } else if (val < 65536) {
            // uint16 LE (to match decoder)
            chunks.push(0xcd, val & 0xff, (val >>> 8) & 0xff)
          } else if (val < 4294967296) {
            // uint32 LE (to match decoder)
            chunks.push(
              0xce,
              val & 0xff,
              (val >>> 8) & 0xff,
              (val >>> 16) & 0xff,
              (val >>> 24) & 0xff
            )
          } else {
            // uint64
            encodeBigInt(BigInt(val))
          }
        } else {
          // Negative integers
          if (val >= -32) {
            // Negative fixnum
            chunks.push(val & 0xff)
          } else if (val >= -128) {
            // int8
            chunks.push(0xd0, val & 0xff)
          } else if (val >= -32768) {
            // int16
            chunks.push(0xd1, val & 0xff, (val >>> 8) & 0xff)
          } else if (val >= -2147483648) {
            // int32
            chunks.push(
              0xd2,
              val & 0xff,
              (val >>> 8) & 0xff,
              (val >>> 16) & 0xff,
              (val >>> 24) & 0xff
            )
          } else {
            // int64
            encodeBigInt(BigInt(val))
          }
        }
      } else {
        // Float64 BE (standard)
        const buf = new ArrayBuffer(8)
        new DataView(buf).setFloat64(0, val, false)
        const arr = new Uint8Array(buf)
        chunks.push(0xcb, ...arr)
      }
      return
    }

    // BigInt
    if (type === 'bigint') {
      encodeBigInt(val)
      return
    }

    // String
    if (type === 'string') {
      const bytes = new TextEncoder().encode(val)
      const len = bytes.length

      if (len < 32) {
        // Fixstr
        chunks.push(0xa0 | len, ...bytes)
      } else if (len < 256) {
        // str8
        chunks.push(0xd9, len, ...bytes)
      } else if (len < 65536) {
        // str16
        chunks.push(0xda, (len >>> 8) & 0xff, len & 0xff, ...bytes)
      } else {
        // str32
        chunks.push(
          0xdb,
          (len >>> 24) & 0xff,
          (len >>> 16) & 0xff,
          (len >>> 8) & 0xff,
          len & 0xff,
          ...bytes
        )
      }
      return
    }

    // Array
    if (Array.isArray(val)) {
      const len = val.length

      if (len < 16) {
        // Fixarray
        chunks.push(0x90 | len)
      } else if (len < 65536) {
        // Array16
        chunks.push(0xdc, (len >>> 8) & 0xff, len & 0xff)
      } else {
        // Array32
        chunks.push(0xdd, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff)
      }

      for (const item of val) {
        encode(item)
      }
      return
    }

    // Object (Map)
    if (type === 'object' && val !== null && !ArrayBuffer.isView(val)) {
      const keys = Object.keys(val)
      const len = keys.length

      if (len < 16) {
        // Fixmap
        chunks.push(0x80 | len)
      } else if (len < 65536) {
        // Map16
        chunks.push(0xde, (len >>> 8) & 0xff, len & 0xff)
      } else {
        // Map32
        chunks.push(0xdf, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff)
      }

      for (const key of keys) {
        encode(key)
        encode(val[key])
      }
      return
    }

    // Binary data (Uint8Array, ArrayBuffer, Buffer)
    if (ArrayBuffer.isView(val) || val instanceof ArrayBuffer) {
      const bytes = val instanceof ArrayBuffer ? new Uint8Array(val) : val
      const len = bytes.length

      if (len < 256) {
        // Bin8
        chunks.push(0xc4, len, ...bytes)
      } else if (len < 65536) {
        // Bin16
        chunks.push(0xc5, (len >>> 8) & 0xff, len & 0xff, ...bytes)
      } else {
        // Bin32
        chunks.push(
          0xc6,
          (len >>> 24) & 0xff,
          (len >>> 16) & 0xff,
          (len >>> 8) & 0xff,
          len & 0xff,
          ...bytes
        )
      }
      return
    }

    throw new Error(`Unsupported type: ${type}`)
  }

  function encodeBigInt(val) {
    const negative = val < 0n
    const absVal = negative ? -val : val

    // Convert to bytes (up to 8 bytes for 64-bit)
    const bytes = []
    let temp = absVal
    for (let i = 0; i < 8; i++) {
      bytes.unshift(Number(temp & 0xffn))
      temp >>= 8n
    }

    if (negative) {
      chunks.push(0xd3, ...bytes)
    } else {
      chunks.push(0xcf, ...bytes)
    }
  }

  encode(value)

  return new Uint8Array(chunks)
}

export function encodeMsgPackToBase64(value) {
  const bytes = encodeMsgPack(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function encodeMsgPackMultiple(values) {
  const chunks = []
  for (const value of values) {
    const encoded = encodeMsgPack(value)
    chunks.push(...encoded)
  }
  return new Uint8Array(chunks)
}

export function encodeMsgPackMultipleToBase64(values) {
  const bytes = encodeMsgPackMultiple(values)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Encode multiple values with 8-byte header (like the game server expects)
export function encodeMsgPackWithHeader(values) {
  const header = new Uint8Array([0x71, 0x00, 0x00, 0x00, 0x30, 0x00, 0x00, 0x00])
  const body = encodeMsgPackMultiple(values)
  const result = new Uint8Array(header.length + body.length)
  result.set(header)
  result.set(body, header.length)
  return result
}

export function encodeMsgPackWithHeaderToBase64(values) {
  const bytes = encodeMsgPackWithHeader(values)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Round-trip test
export function testEncodeDecode(value) {
  const encoded = encodeMsgPack(value)
  const decoded = decodeMsgPack(new Uint8Array([...Array(8).fill(0), ...encoded]))
  return {
    original: value,
    encoded: Array.from(encoded),
    decoded: decoded[0],
    matches: JSON.stringify(value) === JSON.stringify(decoded[0])
  }
}

// CommonJS exports for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    readValue,
    decodeMsgPack,
    decodeMsgPackBase64,
    encodeMsgPack,
    encodeMsgPackToBase64,
    encodeMsgPackMultiple,
    encodeMsgPackMultipleToBase64,
    encodeMsgPackWithHeader,
    encodeMsgPackWithHeaderToBase64,
    testEncodeDecode
  }
}
