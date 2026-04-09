const fs = require('fs')
const path = require('path')

const captureContent = fs.readFileSync(path.join(__dirname, 'packets.players.cap'), 'utf8')

// Extract all base64 data sections
const base64Matches = captureContent.match(
  /data:application\/octet-stream;base64,([A-Za-z0-9+\/=]+)/g
)

console.log(`Found ${base64Matches ? base64Matches.length : 0} base64 data sections`)

if (!base64Matches) {
  console.log('No base64 data found in capture file')
  process.exit(1)
}

// Copy of readValue from decode.response.js (msgpack decoder)
function readValue(buf, off) {
  if (off >= buf.length) return { val: null, end: buf.length }
  const byte = buf[off++]

  // Positive fixint (0xxxxxxx)
  if (byte < 0x80) return { val: byte, end: off }

  // Negative fixint (111xxxxx)
  if (byte >= 0xe0) return { val: byte - 256, end: off }

  // Fixmap (1000xxxx)
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

  // Fixarray (1001xxxx)
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

  // Fixstr (101xxxxx)
  if ((byte & 0xe0) === 0xa0) {
    const len = byte & 0x1f
    return { val: buf.slice(off, off + len).toString('utf8'), end: off + len }
  }

  // 0xc0 - nil
  if (byte === 0xc0) return { val: null, end: off }

  // 0xc1 - never used

  // 0xc2 - false
  if (byte === 0xc2) return { val: false, end: off }

  // 0xc3 - true
  if (byte === 0xc3) return { val: true, end: off }

  // 0xc4 - bin8
  if (byte === 0xc4) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len }
  }

  // 0xc5 - bin16
  if (byte === 0xc5) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len }
  }

  // 0xc6 - bin32
  if (byte === 0xc6) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len }
  }

  // 0xc7 - ext8, 0xc8 - ext16, 0xc9 - ext32
  if (byte >= 0xc7 && byte <= 0xc9) {
    let len, dataOff
    if (byte === 0xc7) {
      len = buf[off]
      dataOff = off + 2
    } else if (byte === 0xc8) {
      len = buf.readUInt16BE(off)
      dataOff = off + 3
    } else {
      len = buf.readUInt32BE(off)
      dataOff = off + 5
    }
    const type = buf[dataOff]
    const data = buf.slice(dataOff + 1, dataOff + 1 + len - 1)
    return { val: { type, data }, end: dataOff + len }
  }

  // 0xca - float32
  if (byte === 0xca) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat32(0), end: off + 4 }
  }

  // 0xcb - float64
  if (byte === 0xcb) {
    const view = new DataView(buf.buffer, buf.byteOffset + off)
    return { val: view.getFloat64(0), end: off + 8 }
  }

  // 0xcc - uint8
  if (byte === 0xcc) return { val: buf[off], end: off + 1 }

  // 0xcd - uint16 (LE for coordinates)
  if (byte === 0xcd) return { val: buf.readUInt16LE(off), end: off + 2 }

  // 0xce - uint32 (LE for coordinates)
  if (byte === 0xce) return { val: buf.readUInt32LE(off), end: off + 4 }

  // 0xcf - uint64
  if (byte === 0xcf) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  // 0xd0 - int8
  if (byte === 0xd0) return { val: buf.readInt8(off), end: off + 1 }

  // 0xd1 - int16 (LE)
  if (byte === 0xd1) return { val: buf.readInt16LE(off), end: off + 2 }

  // 0xd2 - int32 (LE)
  if (byte === 0xd2) return { val: buf.readInt32LE(off), end: off + 4 }

  // 0xd3 - int64 (LE)
  if (byte === 0xd3) {
    let val = 0n
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
    return { val: Number(val), end: off + 8 }
  }

  // 0xd4 - fixext1, 0xd5 - fixext2, 0xd6 - fixext4, 0xd7 - fixext8, 0xd8 - fixext16
  if (byte >= 0xd4 && byte <= 0xd8) {
    const sizes = [1, 2, 4, 8, 16]
    const size = sizes[byte - 0xd4]
    return {
      val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) },
      end: off + 1 + size
    }
  }

  // 0xd9 - str8
  if (byte === 0xd9) {
    const len = buf[off]
    return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len }
  }

  // 0xda - str16
  if (byte === 0xda) {
    const len = buf.readUInt16BE(off)
    return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len }
  }

  // 0xdb - str32
  if (byte === 0xdb) {
    const len = buf.readUInt32BE(off)
    return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len }
  }

  // 0xdc - array16
  if (byte === 0xdc) {
    const size = buf.readUInt16BE(off)
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

  // 0xdd - array32
  if (byte === 0xdd) {
    const size = buf.readUInt32BE(off)
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

  // 0xde - map16
  if (byte === 0xde) {
    const size = buf.readUInt16BE(off)
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

  // 0xdf - map32
  if (byte === 0xdf) {
    const size = buf.readUInt32BE(off)
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
function decodeFull(buf) {
  const results = []
  let off = 8 // Skip 8-byte header

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

// Process each base64 response
const decodedObjects = []

for (let i = 0; i < base64Matches.length; i++) {
  const base64Data = base64Matches[i].replace('data:application/octet-stream;base64,', '')

  try {
    const binaryData = Buffer.from(base64Data, 'base64')
    console.log(`\nPacket ${i + 1}: ${binaryData.length} bytes`)

    if (binaryData.length > 8) {
      // Skip 8-byte header and decode
      const decoded = decodeFull(binaryData)
      console.log(`  Decoded ${decoded.length} msgpack values`)

      if (decoded.length > 0) {
        decodedObjects.push({
          packetIndex: i + 1,
          dataLength: binaryData.length,
          decoded: decoded
        })
      }
    }
  } catch (e) {
    console.log(`  Error decoding packet ${i + 1}: ${e.message}`)
  }
}

// Write results to JSON file
const outputPath = path.join(__dirname, 'msgobjects.json')
fs.writeFileSync(outputPath, JSON.stringify(decodedObjects, null, 2))
console.log(`\nWrote ${decodedObjects.length} decoded packets to ${outputPath}`)
