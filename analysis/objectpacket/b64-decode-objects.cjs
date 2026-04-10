const fs = require('fs')
const path = require('path')

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

function extractObjects(data) {
  const objects = []

  function isValidObject(arr) {
    if (!Array.isArray(arr) || arr.length !== 12) return false

    // First element: array with 1 element
    if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false

    // 9th element (index 8): array with 3 elements
    if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false

    // 10th element (index 9): array with 1 element
    if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false

    // Last element (index 11): boolean
    if (typeof arr[11] !== 'boolean') return false

    return true
  }

  function findObjects(arr, depth = 0) {
    if (depth > 20) return // Prevent infinite recursion

    for (const item of arr) {
      if (Array.isArray(item)) {
        if (isValidObject(item)) {
          objects.push({
            objectId: item[0][0],
            staticId: item[1],
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
          })
        } else {
          // Recurse into nested arrays
          findObjects(item, depth + 1)
        }
      }
    }
  }

  findObjects(data)
  return objects
}

// Process each base64 response

const base64 =
  'data:application/octet-stream;base64,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'

const base64Data = base64.replace('data:application/octet-stream;base64,', '')

let decoded = ''
try {
  const binaryData = Buffer.from(base64Data, 'base64')
  console.log(`\nPacket ${binaryData.length} bytes`)

  if (binaryData.length > 8) {
    // Skip 8-byte header and decode
    decoded = decodeFull(binaryData)
    console.log(`  Decoded ${decoded.length} msgpack values`)
  }
} catch (e) {
  console.log(`  Error decoding packet   ${e.message}`)
}

// Write results to JSON file
if (decoded.length > 0) {
  const outputPath = path.join(__dirname, 'decoded_objects.json')
  fs.writeFileSync(outputPath, JSON.stringify(decoded, null, 2))
  console.log(`\nwrote decoded packets to ${outputPath}`)
} else {
  console.log('decoded failed, no data found')
}

// extract objects data

const objects = extractObjects(decoded)

console.log('Found ' + objects.length + ' objects\n')

// Find mercenaries (staticId = 400)
const mercs = objects.filter(function (o) {
  return o.staticId === 400
})
console.log('\nMercenaries (staticId=400): ' + mercs.length)
mercs.forEach(function (m) {
  console.log('  Lv' + m.level + ' | k' + m.kingdom + ',' + m.x + ',' + m.y + ' | ID:' + m.objectId)
})

// Save to JSON
fs.writeFileSync('./extracted-objects.json', JSON.stringify(objects, null, 2))
console.log('\nSaved to extracted-objects.json')

/*
example result


const decodedSample = [
  [312, 3232],
  [
    [
      [
        358,
        235,
        new Uint8Array([105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 184, 227]),
        217,
        [],
        [
          [[60933730201], 1512, 0, 2, 0, 26, 0, 0, [14, 175, 147], [0], 1775697895, false],
          [[60933732790], 1657, 0, 2, 0, 27, 0, 0, [14, 169, 159], [0], 1775697568, false],
          [[60933734604], 2111, 0, 2, 0, 5, 0, 0, [14, 172, 144], [0], 0, false],
          [[60933736246], 1466, 0, 2, 0, 14, 0, 0, [14, 171, 153], [0], 1775697736, false],
          [[60933736248], 1473, 0, 2, 0, 17, 0, 0, [14, 173, 157], [0], 1775699017, false],
          [[60933736249], 1509, 0, 2, 0, 25, 0, 0, [14, 177, 153], [0], 1775698479, false],
          [[60933740673], 1594, 0, 2, 0, 5, 0, 0, [14, 177, 143], [0], 1775700339, false],
          [[60933743382], 1621, 0, 2, 0, 19, 0, 0, [14, 161, 159], [0], 1775702210, false],
          [[60933744250], 2107, 0, 2, 0, 5, 0, 0, [14, 163, 147], [0], 0, false],
          [[60933750348], 1591, 0, 2, 0, 2, 0, 0, [14, 167, 149], [0], 1775701809, false],
          [[60933752900], 1452, 0, 2, 0, 3, 0, 0, [14, 173, 147], [0], 1775703116, false],
          [[60933753117], 50000, 0, 2, 0, 5, 0, 0, [14, 162, 152], [0], 0, false],
          [[60933759397], 1636, 0, 2, 0, 23, 0, 0, [14, 178, 158], [0], 1775706018, false],
          [[60933760047], 1648, 0, 2, 0, 25, 0, 0, [14, 164, 142], [0], 1775705664, false],
          [[60933760723], 1450, 0, 2, 0, 1, 0, 0, [14, 165, 143], [0], 1775706882, false],
          [[60933760927], 1634, 0, 2, 0, 22, 0, 0, [14, 169, 153], [0], 1775705846, false],
          [
            408,
            399,
            {
              type: 'Buffer',
              data: [105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 184, 79]
            },
            369,
            [],
            [
              [[60933725319], 1467, 0, 2, 0, 14, 0, 0, [14, 160, 164], [0], 1775697644, false],
              [[60933732791], 1610, 0, 2, 0, 16, 0, 0, [14, 160, 172], [0], 1775697770, false],
              [[60933736874], 1454, 0, 2, 0, 5, 0, 0, [14, 170, 172], [0], 1775699429, false],
              [[60933739044], 2424, 0, 2, 0, 20, 0, 0, [14, 174, 168], [0], 0, false],
              [[60933740506], 1476, 0, 2, 0, 18, 0, 0, [14, 179, 177], [0], 1775700340, false],
              [[60933741187], 2509, 0, 2, 0, 25, 0, 0, [14, 176, 164], [0], 0, false],
              [[60933741579], 1452, 0, 2, 0, 3, 0, 0, [14, 165, 167], [0], 1775702158, false],
              [[60933741582], 1628, 0, 2, 0, 21, 0, 0, [14, 165, 173], [0], 1775699829, false],
              [[60933751490], 1695, 0, 2, 0, 35, 0, 0, [14, 161, 177], [0], 1775702663, false],
              [[60933751875], 2839, 0, 2, 0, 45, 0, 0, [14, 170, 162], [0], 1775702867, false],
              [[60933752487], 1490, 0, 2, 0, 22, 0, 0, [14, 169, 163], [0], 1775703425, false],
              [[60933753110], 1450, 0, 2, 0, 1, 0, 0, [14, 179, 169], [0], 1775703670, false],
              [[60933758036], 1592, 0, 2, 0, 3, 0, 0, [14, 160, 168], [0], 1775704643, false],
              [[60933758528], 1474, 0, 2, 0, 17, 0, 0, [14, 168, 178], [0], 1775705219, false],
              [[60933759816], 1453, 0, 2, 0, 4, 0, 0, [14, 173, 177], [0], 1775704390, false],
              [[60933761166], 400, 0, 2, 0, 10, 0, 0, [14, 175, 173], [0], 0, false],
              [
                458,
                214,
                {
                  type: 'Buffer',
                  data: [105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 183, 185]
                },
                198,
                [],
                [
                  [[60933726899], 1473, 0, 2, 0, 17, 0, 0, [14, 161, 183], [0], 1775697865, false],
                  [[60933729490], 1452, 0, 2, 0, 3, 0, 0, [14, 174, 182], [0], 1775698473, false],
                  [[60933729957], 1468, 0, 2, 0, 15, 0, 0, [14, 167, 193], [0], 1775698217, false],
                  [[60933733731], 1502, 0, 2, 0, 24, 0, 0, [14, 169, 197], [0], 1775699304, false],
                  [[60933734149], 2838, 0, 2, 0, 45, 0, 0, [14, 160, 188], [0], 1775698825, false],
                  [[60933734832], 133, 0, 2, 0, 24, 0, 0, [14, 173, 197], [0], 0, false],
                  [[60933736881], 2816, 0, 2, 0, 40, 0, 0, [14, 172, 188], [0], 1775697847, false],
                  [[60933737534], 1454, 0, 2, 0, 5, 0, 0, [14, 177, 193], [0], 1775698542, false],
                  [[60933744792], 125, 0, 2, 0, 16, 0, 0, [14, 167, 187], [0], 0, false],
                  [[60933747419], 2916, 0, 2, 0, 40, 0, 0, [14, 165, 183], [0], 1775701342, false],
                  [[60933748425], 1467, 0, 2, 0, 14, 0, 0, [14, 171, 193], [0], 1775701124, false],
                  [[60933749775], 1655, 0, 2, 0, 27, 0, 0, [14, 177, 189], [0], 1775701532, false],
                  [[60933752274], 1537, 0, 2, 0, 31, 0, 0, [14, 161, 197], [0], 1775703750, false],
                  [[60933753941], 1469, 0, 2, 0, 15, 0, 0, [14, 162, 192], [0], 1775703787, false],
                  [[60933755389], 1486, 0, 2, 0, 21, 0, 0, [14, 178, 182], [0], 1775706159, false],
                  [[60933756654], 2749, 0, 2, 0, 35, 0, 0, [14, 178, 198], [0], 0, false],
                  [
                    359,
                    222,
                    {
                      type: 'Buffer',
                      data: [105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 187, 245]
                    },
                    206,
                    [],
                    [
                      [
                        [60933736875],
                        1594,
                        0,
                        2,
                        0,
                        5,
                        0,
                        0,
                        [14, 187, 153],
                        [0],
                        1775699416,
                        false
                      ],
                      [[60933736877], 2740, 0, 2, 0, 15, 0, 0, [14, 181, 157], [0], 0, false],
                      [
                        [60933740499],
                        2801,
                        0,
                        2,
                        0,
                        36,
                        0,
                        0,
                        [14, 181, 153],
                        [0],
                        1775698710,
                        false
                      ],
                      [[60933741189], 2330, 0, 2, 0, 15, 0, 0, [14, 182, 142], [0], 0, false],
                      [
                        [60933741384],
                        1453,
                        0,
                        2,
                        0,
                        4,
                        0,
                        0,
                        [14, 188, 142],
                        [0],
                        1775698718,
                        false
                      ],
                      [
                        [60933742139],
                        1470,
                        0,
                        2,
                        0,
                        16,
                        0,
                        0,
                        [14, 194, 152],
                        [0],
                        1775700984,
                        false
                      ],
                      [[60933743028], 2430, 0, 2, 0, 20, 0, 0, [14, 190, 148], [0], 0, false],
                      [
                        [60933743216],
                        1607,
                        0,
                        2,
                        0,
                        14,
                        0,
                        0,
                        [14, 198, 152],
                        [0],
                        1775700796,
                        false
                      ],
                      [
                        [60933749240],
                        1454,
                        0,
                        2,
                        0,
                        5,
                        0,
                        0,
                        [14, 185, 147],
                        [0],
                        1775701952,
                        false
                      ],
                      [
                        [60933751485],
                        1540,
                        0,
                        2,
                        0,
                        32,
                        0,
                        0,
                        [14, 182, 148],
                        [0],
                        1775702032,
                        false
                      ],
                      [
                        [60933754163],
                        1466,
                        0,
                        2,
                        0,
                        14,
                        0,
                        0,
                        [14, 192, 142],
                        [0],
                        1775704225,
                        false
                      ],
                      [
                        [60933756255],
                        1470,
                        0,
                        2,
                        0,
                        16,
                        0,
                        0,
                        [14, 199, 157],
                        [0],
                        1775703563,
                        false
                      ],
                      [
                        [60933756461],
                        1623,
                        0,
                        2,
                        0,
                        20,
                        0,
                        0,
                        [14, 195, 147],
                        [0],
                        1775704895,
                        false
                      ],
                      [
                        [60933758278],
                        1479,
                        0,
                        2,
                        0,
                        19,
                        0,
                        0,
                        [14, 195, 143],
                        [0],
                        1775707268,
                        false
                      ],
                      [
                        [60933759179],
                        1631,
                        0,
                        2,
                        0,
                        22,
                        0,
                        0,
                        [14, 186, 158],
                        [0],
                        1775705864,
                        false
                      ],
                      [[60933760926], 32, 0, 2, 0, 23, 0, 0, [14, 192, 158], [0], 0, false],
                      [
                        409,
                        258,
                        new Uint8Array([105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 180, 178]),
                        238,
                        [],
                        [
                          [
                            [60933730204],
                            1523,
                            0,
                            2,
                            0,
                            28,
                            0,
                            0,
                            [14, 183, 179],
                            [0],
                            1775697763,
                            false
                          ],
                          [
                            [60933731884],
                            1483,
                            0,
                            2,
                            0,
                            20,
                            0,
                            0,
                            [14, 193, 167],
                            [0],
                            1775697646,
                            false
                          ],
                          [
                            [60933734835],
                            1465,
                            0,
                            2,
                            0,
                            13,
                            0,
                            0,
                            [14, 190, 174],
                            [0],
                            1775697957,
                            false
                          ],
                          [[60933737318], 2433, 0, 2, 0, 20, 0, 0, [14, 180, 172], [0], 0, false],
                          [
                            [60933737322],
                            1521,
                            0,
                            2,
                            0,
                            28,
                            0,
                            0,
                            [14, 197, 169],
                            [0],
                            1775698326,
                            false
                          ],
                          [
                            [60933739048],
                            1465,
                            0,
                            2,
                            0,
                            13,
                            0,
                            0,
                            [14, 183, 163],
                            [0],
                            1775700506,
                            false
                          ],
                          [
                            [60933739247],
                            2814,
                            0,
                            2,
                            0,
                            39,
                            0,
                            0,
                            [14, 198, 178],
                            [0],
                            1775698811,
                            false
                          ],
                          [
                            [60933739458],
                            1593,
                            0,
                            2,
                            0,
                            4,
                            0,
                            0,
                            [14, 186, 178],
                            [0],
                            1775699086,
                            false
                          ],
                          [[60933742865], 2107, 0, 2, 0, 5, 0, 0, [14, 199, 163], [0], 0, false],
                          [
                            [60933745113],
                            1592,
                            0,
                            2,
                            0,
                            3,
                            0,
                            0,
                            [14, 193, 163],
                            [0],
                            1775702827,
                            false
                          ],
                          [[60933746024], 112, 0, 2, 0, 3, 0, 0, [14, 185, 173], [0], 0, false],
                          [[60933749605], 3502, 0, 2, 0, 25, 0, 0, [14, 191, 177], [0], 0, true],
                          [[60933753750], 33, 0, 2, 0, 24, 0, 0, [14, 185, 167], [0], 0, false],
                          [[60933754987], 2137, 0, 2, 0, 5, 0, 0, [14, 181, 169], [0], 0, false],
                          [[60933757673], 105, 0, 2, 0, 21, 0, 0, [14, 196, 174], [0], 0, false],
                          [
                            [60933761407],
                            1481,
                            0,
                            2,
                            0,
                            19,
                            0,
                            0,
                            [14, 185, 163],
                            [0],
                            1775707701,
                            false
                          ],
                          [
                            459,
                            222,
                            {
                              type: 'Buffer',
                              data: [105, 214, 38, 24, 92, 1, 79, 68, 165, 199, 186, 7]
                            },
                            206,
                            [],
                            [
                              [
                                [60933731375],
                                1608,
                                0,
                                2,
                                0,
                                15,
                                0,
                                0,
                                [14, 182, 194],
                                [0],
                                1775698069,
                                false
                              ],
                              [
                                [60933731890],
                                1462,
                                0,
                                2,
                                0,
                                12,
                                0,
                                0,
                                [14, 196, 194],
                                [0],
                                1775698691,
                                false
                              ],
                              [
                                [60933733734],
                                2105,
                                0,
                                2,
                                0,
                                5,
                                0,
                                0,
                                [14, 191, 197],
                                [0],
                                0,
                                false
                              ],
                              [[60933735766], 83, 0, 2, 0, 24, 0, 0, [14, 182, 198], [0], 0, false],
                              [
                                [60933735986],
                                1592,
                                0,
                                2,
                                0,
                                3,
                                0,
                                0,
                                [14, 199, 189],
                                [0],
                                1775698431,
                                false
                              ],
                              [
                                [60933742676],
                                2805,
                                0,
                                2,
                                0,
                                37,
                                0,
                                0,
                                [14, 196, 198],
                                [0],
                                1775700386,
                                false
                              ],
                              [
                                [60933745849],
                                1450,
                                0,
                                2,
                                0,
                                1,
                                0,
                                0,
                                [14, 187, 199],
                                [0],
                                1775701304,
                                false
                              ],
                              [
                                [60933746018],
                                1454,
                                0,
                                2,
                                0,
                                5,
                                0,
                                0,
                                [14, 180, 182],
                                [0],
                                1775702372,
                                false
                              ],
                              [
                                [60933746977],
                                1467,
                                0,
                                2,
                                0,
                                14,
                                0,
                                0,
                                [14, 189, 187],
                                [0],
                                1775701364,
                                false
                              ],
                              [[60933748027], 18, 0, 2, 0, 9, 0, 0, [14, 199, 183], [0], 0, false],
                              [
                                [60933748835],
                                1465,
                                0,
                                2,
                                0,
                                13,
                                0,
                                0,
                                [14, 190, 182],
                                [0],
                                1775701663,
                                false
                              ],
                              [
                                [60933750343],
                                1454,
                                0,
                                2,
                                0,
                                5,
                                0,
                                0,
                                [14, 183, 187],
                                [0],
                                1775703436,
                                false
                              ],
                              [
                                [60933750345],
                                1616,
                                0,
                                2,
                                0,
                                18,
                                0,
                                0,
                                [14, 190, 188],
                                [0],
                                1775703743,
                                false
                              ],
                              [
                                [60933752085],
                                1472,
                                0,
                                2,
                                0,
                                16,
                                0,
                                0,
                                [14, 187, 193],
                                [0],
                                1775705141,
                                false
                              ],
                              [
                                [60933757267],
                                1477,
                                0,
                                2,
                                0,
                                18,
                                0,
                                0,
                                [14, 188, 182],
                                [0],
                                1775704565,
                                false
                              ],
                              [
                                [60933761168],
                                1614,
                                0,
                                2,
                                0,
                                17,
                                0,
                                0,
                                [14, 193, 193],
                                [0],
                                1775704733,
                                false
                              ],
                              [],
                              [],
                              []
                            ]
                          ]
                        ]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
]
*/
