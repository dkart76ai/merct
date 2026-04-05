fetch("https://game-us47.totalbattle.com/rubens-realm305", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/octet-stream",
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "Referer": "https://totalbattle.com/"
  },
  "body": "vgIAAL0BAACUzZIBzdMIkpHP8kYAADEBAADEDGnRJTT3WCA5GFXMdaCR3CgAkc+PlwEAMQEAAJHPRR0BADEBAACRz8HEAAAxAQAAkc8CcgAAMQEAAJHPL+IBADEBAACRz2bKAQAxAQAAkc/kLgEAMQEAAJHPGQUBADEBAACRz1MCAQAxAQAAkc9wwwAAMQEAAJHPbcEAADEBAACRzxiLAAAxAQAAkc+OLwAAMQEAAJHPkSoAADEBAACRz6UPAAAxAQAAkc9NsgEAMQEAAJHP2nsBADEBAACRz3N6AQAxAQAAkc8dNwEAMQEAAJHPchoBADEBAACRz6QCAQAxAQAAkc9U5wAAMQEAAJHPmY8AADEBAACRz4t6AAAxAQAAkc/IMQAAMQEAAJHPIh8AADEBAACRz5weAAAxAQAAkc/WFwAAMQEAAJHPfxMAADEBAACRzyHAAQAxAQAAkc/oqgEAMQEAAJHP15UBADEBAACRz7xuAQAxAQAAkc+0BQAAMQEAAJHPAeIBADEBAACRz6muAQAxAQAAkc8srgEAMQEAAJHP2qIBADEBAACRz7icAQAxAQAAkc+vnAEAMQEAAJ+SxAxp0SU091ggORhVzHQCksQMadElNPdYIDkYVcx2AJLEDGnLr8z3WCA5GM3yVACSxAxp0SU091ggORhVzHMUksQMaa6khfdYIDkYbpcYzTY3ksQMacqig/dYIDkYv/fDzV8cksQMacqig/dYIDkYv/fGApLEDGmupIX3WCA5GG6EqAKSxAxprqSD91ggORhuhJQDksQMaa6khfdYIDkYbpP1zeumksQMaa6khfdYIDkYbqk9zXl/ksQMaa6khfdYIDkYbotLzRcbksQMaa6khfdYIDkYboymzeBzksQMaa6khfdYIDkYbo00zUF5ksQMaa6khfdYIDkYbri+zX8d",
  "method": "POST"
});

tb:86287335

[total_size: uint32]
[list_size: uint32]
[header: array[4]]
  [field1: 402]        ← possibly scan area x or chunk ID
  [field2: 2259]       ← possibly scan area y or chunk ID
  [player_ids: array]  ← list of uint64 (kingdom<<32 | tileId)
  [session_token: bin12] ← 12-byte auth token
[tile_requests: array[15]]  ← pairs of [token, coordinate]


tileId = x * 1000 + y
fullId = [tileId as uint32 LE] + [kingdom as uint32 LE]
       = [0C 8F 0D 00] + [31 01 00 00]  for K:305 X:888 Y:588


[4 bytes] total body size (uint32 LE)
[4 bytes] player list size (uint32 LE)
[1 byte]  0x94 = fixarray[4]
[3 bytes] CD XX XX = uint16 (field1 - possibly chunk/area ID)
[3 bytes] CD XX XX = uint16 (field2 - possibly chunk/area ID)
[1 byte]  0x92 = fixarray[2]
  [N tiles] each tile: 91 CF [tileId uint32 LE] [kingdom uint32 LE]
  [14 bytes] C4 0C [12-byte session token]
[tile_data section] 9F ...


{
  viewportX: 37,   // current map view center x
  viewportY: 581,  // current map view center y
  tiles: [
    { kingdom: 305, x: 55, y: 121 },
    { kingdom: 305, x: 129, y: 848 },
    { kingdom: 305, x: 69, y: 372 },
    { kingdom: 305, x: 55, y: 121 },
  ],
  sessionToken: Buffer.from('69D12534F75820391855CC75', 'hex')
}

function buildTileRequest(tiles, sessionToken, viewX, viewY) {
  // Each tile entry: 91 CF [x*1000+y as uint32 LE] [kingdom as uint32 LE]
  const tileBytes = []
  for (const { k, x, y } of tiles) {
    const tileId = x * 1000 + y
    tileBytes.push(0x91, 0xCF)
    tileBytes.push(tileId & 0xFF, (tileId >> 8) & 0xFF, (tileId >> 16) & 0xFF, (tileId >> 24) & 0xFF)
    tileBytes.push(k & 0xFF, (k >> 8) & 0xFF, (k >> 16) & 0xFF, (k >> 24) & 0xFF)
  }

  const playerList = Buffer.from([
    0x94,                          // fixarray[4]
    0xCD, viewX & 0xFF, (viewX >> 8) & 0xFF,  // field1
    0xCD, viewY & 0xFF, (viewY >> 8) & 0xFF,  // field2
    0x92,                          // fixarray[2]
    ...tileBytes,
    0xC4, 0x0C, ...sessionToken    // session token
  ])

  const header = Buffer.alloc(8)
  header.writeUInt32LE(playerList.length + 8, 0)
  header.writeUInt32LE(playerList.length, 4)

  return Buffer.concat([header, playerList])
}


--
async function scanBatch(k, tiles) {
  const token = [0x69, 0xD1, 0x4A, 0x76, 0xF7, 0x58, 0x20, 0x39, 0x18, 0x5C, 0x62, 0x53]
  const gameServer = 'game-us47.totalbattle.com'
  const f1 = 0x013E
  const f2 = 0x0906

  const tileBytes = []
  for (const {x, y} of tiles) {
    const tileId = x * 1000 + y
    tileBytes.push(
      0xCF,
      tileId & 0xFF, (tileId>>8) & 0xFF, (tileId>>16) & 0xFF, (tileId>>24) & 0xFF,
      k & 0xFF, (k>>8) & 0xFF, (k>>16) & 0xFF, (k>>24) & 0xFF
    )
  }

  // fixarray for N tiles
  const tileCount = tiles.length
  const tileListHeader = tileCount <= 15 ? [0x90 | tileCount] : [0xDC, (tileCount>>8)&0xFF, tileCount&0xFF]

  const payloadBytes = [
    0x94,
    0xCD, f1 & 0xFF, (f1>>8) & 0xFF,
    0xCD, f2 & 0xFF, (f2>>8) & 0xFF,
    0x92,
      ...tileListHeader,
      ...tileBytes,
      0xC4, 0x0C, ...token,
    0xa0,
  ]

  const payload = new Uint8Array(payloadBytes)
  const header = new Uint8Array(8)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, payload.length + 8, true)
  dv.setUint32(4, payload.length, true)
  const body = new Uint8Array([...header, ...payload])

  const response = await fetch(`https://${gameServer}/rubens-realm${k}`, {
    method: 'POST',
    headers: { 'accept': '*/*', 'content-type': 'application/octet-stream', 'Referer': 'https://totalbattle.com/' },
    body
  })

  const buf = new Uint8Array(await response.arrayBuffer())
  const text = new TextDecoder().decode(buf)
  const playerIds = [...text.matchAll(/tb:\d+/g)].map(m => m[0])
  const hex = [...buf].map(b=>b.toString(16).padStart(2,'0')).join(' ')

  console.log('Players:', playerIds.length ? playerIds : 'none')
  console.log('Hex:', hex)
  return { playerIds, hex, text }
}

const tiles = []
for (let x = 880; x <= 900; x += 2)
  for (let y = 580; y <= 600; y += 2)
    tiles.push({x, y})

scanBatch(305, tiles).then(r => console.log(r))

---

async function scan(k, x, y) {
  const token = [0x69, 0xD1, 0x4A, 0x76, 0xF7, 0x58, 0x20, 0x39, 0x18, 0x5C, 0x62, 0x53]
  const gameServer = 'game-us47.totalbattle.com'
  const tileId = x * 1000 + y
  const f1 = 0x0192  // 402 - from working request
  const f2 = 0x0716  // 1814 - from working request

  // build a single tile entry: 91 CF [tileId LE] [kingdom LE]
  function tileEntry(tx, ty, tk) {
    const tid = tx * 1000 + ty
    return [0x91, 0xCF,
      tid & 0xFF, (tid>>8) & 0xFF, (tid>>16) & 0xFF, (tid>>24) & 0xFF,
      tk & 0xFF, (tk>>8) & 0xFF, (tk>>16) & 0xFF, (tk>>24) & 0xFF]
  }

  // generate 34 nearby tiles for the extra section
  const extraTiles = []
  let ex = x, ey = y
  for (let i = 0; i < 34; i++) {
    extraTiles.push(...tileEntry(ex, ey, k))
    ey = (ey + 30) % 1000
    if (i % 10 === 9) ex = (ex + 22) % 1000
  }

  const payloadBytes = [
    0x94,
    0xCD, f1 & 0xFF, (f1>>8) & 0xFF,
    0xCD, f2 & 0xFF, (f2>>8) & 0xFF,
    0x92,
      0x91,                          // fixarray[1] - main tile
        0xCF,
        tileId & 0xFF, (tileId>>8) & 0xFF, (tileId>>16) & 0xFF, (tileId>>24) & 0xFF,
        k & 0xFF, (k>>8) & 0xFF, (k>>16) & 0xFF, (k>>24) & 0xFF,
      0xC4, 0x0C, ...token,
    0xa0,                            // empty 4th element
    0x91,                            // fixarray[1]
      0xDC, 0x00, 0x22,              // array16[34] - extra tiles
      ...extraTiles
  ]

  const payload = new Uint8Array(payloadBytes)
  const header = new Uint8Array(8)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, payload.length + 8, true)
  dv.setUint32(4, payload.length, true)
  const body = new Uint8Array([...header, ...payload])

  const response = await fetch(`https://${gameServer}/rubens-realm${k}`, {
    method: 'POST',
    headers: { 'accept': '*/*', 'content-type': 'application/octet-stream', 'Referer': 'https://totalbattle.com/' },
    body
  })

  const buf = new Uint8Array(await response.arrayBuffer())
  const text = new TextDecoder().decode(buf)
  const playerIds = [...text.matchAll(/tb:\d+/g)].map(m => m[0])
  const hex = [...buf].map(b=>b.toString(16).padStart(2,'0')).join(' ')

  console.log('Players:', playerIds.length ? playerIds : 'none')
  console.log('Response length:', buf.length)
  console.log('Hex:', hex)
  return { playerIds, hex, text }
}


---

async function scan(k, x, y) {
  const token = [0x69, 0xD1, 0x4A, 0x76, 0xF7, 0x58, 0x20, 0x39, 0x18, 0x5C, 0x62, 0x53]
  const gameServer = 'game-us47.totalbattle.com'
  const tileId = x * 1000 + y
  const f1 = 0x0192
  const f2 = 0x0716

  function tileEntry(tx, ty, tk) {
    const tid = tx * 1000 + ty
    return [0x91, 0xCF,
      tid & 0xFF, (tid>>8) & 0xFF, (tid>>16) & 0xFF, (tid>>24) & 0xFF,
      tk & 0xFF, (tk>>8) & 0xFF, (tk>>16) & 0xFF, (tk>>24) & 0xFF]
  }

  const extraTiles = []
  let ex = x, ey = y
  for (let i = 0; i < 34; i++) {
    extraTiles.push(...tileEntry(ex, ey, k))
    ey = (ey + 30) % 1000
    if (i % 10 === 9) ex = (ex + 22) % 1000
  }

  const payloadBytes = [
    0x94,
    0xCD, f1 & 0xFF, (f1>>8) & 0xFF,
    0xCD, f2 & 0xFF, (f2>>8) & 0xFF,
    0x92,
      0x91,
        0xCF,
        tileId & 0xFF, (tileId>>8) & 0xFF, (tileId>>16) & 0xFF, (tileId>>24) & 0xFF,
        k & 0xFF, (k>>8) & 0xFF, (k>>16) & 0xFF, (k>>24) & 0xFF,
      0xC4, 0x0C, ...token,
    0xa0,
    0x91,
      0xDC, 0x22, 0x00,
      ...extraTiles
  ]

  const payload = new Uint8Array(payloadBytes)
  const header = new Uint8Array(8)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, payload.length + 8, true)
  dv.setUint32(4, payload.length, true)
  const body = new Uint8Array([...header, ...payload])

  const response = await fetch(`https://${gameServer}/rubens-realm${k}`, {
    method: 'POST',
    headers: { 'accept': '*/*', 'content-type': 'application/octet-stream', 'Referer': 'https://totalbattle.com/' },
    body
  })

  const buf = new Uint8Array(await response.arrayBuffer())
  const text = new TextDecoder().decode(buf)
  const playerIds = [...text.matchAll(/tb:\d+/g)].map(m => m[0])
  const hex = [...buf].map(b=>b.toString(16).padStart(2,'0')).join(' ')

  console.log('Players:', playerIds.length ? playerIds : 'none')
  console.log('Response length:', buf.length)
  console.log('Hex:', hex)
  return { playerIds, hex, text }
}

