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
