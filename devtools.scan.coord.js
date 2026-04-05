//latest scan for devtools

async function scan2(k, x, y) {
  const token = [0x69, 0xd1, 0x4a, 0x76, 0xf7, 0x58, 0x20, 0x39, 0x18, 0x5c, 0x62, 0x53]
  const gameServer = 'game-us47.totalbattle.com'
  const tileId = x * 1000 + y
  const f1 = 0x0192
  const f2 = 0x0716

  function tileEntry(tx, ty, tk) {
    const tid = tx * 1000 + ty
    return [
      0x91,
      0xcf,
      tid & 0xff,
      (tid >> 8) & 0xff,
      (tid >> 16) & 0xff,
      (tid >> 24) & 0xff,
      tk & 0xff,
      (tk >> 8) & 0xff,
      (tk >> 16) & 0xff,
      (tk >> 24) & 0xff
    ]
  }

  const extraTiles = []
  let ex = x,
    ey = y
  for (let i = 0; i < 34; i++) {
    extraTiles.push(...tileEntry(ex, ey, k))
    ey = (ey + 30) % 1000
    if (i % 10 === 9) ex = (ex + 22) % 1000
  }

  const payloadBytes = [
    0x94,
    0xcd,
    f1 & 0xff,
    (f1 >> 8) & 0xff,
    0xcd,
    f2 & 0xff,
    (f2 >> 8) & 0xff,
    0x92,
    0x91,
    0xcf,
    tileId & 0xff,
    (tileId >> 8) & 0xff,
    (tileId >> 16) & 0xff,
    (tileId >> 24) & 0xff,
    k & 0xff,
    (k >> 8) & 0xff,
    (k >> 16) & 0xff,
    (k >> 24) & 0xff,
    0xc4,
    0x0c,
    ...token,
    0xa0,
    0x91,
    0xdc,
    0x22,
    0x00,
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
    headers: {
      accept: '*/*',
      'content-type': 'application/octet-stream',
      Referer: 'https://totalbattle.com/'
    },
    body
  })

  const buf = new Uint8Array(await response.arrayBuffer())
  const text = new TextDecoder().decode(buf)
  const playerIds = [...text.matchAll(/tb:\d+/g)].map(m => m[0])
  const hex = [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ')

  console.log('Players:', playerIds.length ? playerIds : 'none')
  console.log('Response length:', buf.length)
  console.log('Hex:', hex)
  return { playerIds, hex, text }
}


async function scan(k, x, y) {
  // get fresh token from current session
  // const tokenHex = '69d14a76f7582039185c6253' // replace with current token
  // const tokenHex='69d1911cab03fd7acdf7e636'
  const tokenHex = '000000000000000000000000'
  const token = tokenHex.match(/../g).map(h => parseInt(h, 16))

  const servers = {
    175: 'game-us20.totalbattle.com',
    277: 'game-us41.totalbattle.com',
    305: 'game-us47.totalbattle.com'
  }
  const gameServer = servers[k] || servers[305]

  // center of the map view the player is currently looking at
//   f1 = 0x0192 = 402 → tileId 402 → x=0, y=402
// f2 = 0x0716 = 1814 → tileId 1814 → x=1, y=814
// The server uses them to know roughly where the player's camera is positioned on the map. They don't affect what tile data is returned — the server returns data for the specific tiles you request regardless of f1/f2.

// We confirmed this because:

// Different requests had different f1/f2 values

// The response data was always for the explicitly requested tiles, not the viewport area

// Requests with wrong f1/f2 still returned correct tile data

  const tileId = x * 1000 + y
  // const f1 = 0x0192
  // const f2 = 0x0716
  const f1 = x * 1000 + y  // use the target tile as viewport center
  const f2 = x * 1000 + y


  function tileEntry(tx, ty, tk) {
    const tid = tx * 1000 + ty
    return [
      0x91,
      0xcf,
      tid & 0xff,
      (tid >> 8) & 0xff,
      (tid >> 16) & 0xff,
      (tid >> 24) & 0xff,
      tk & 0xff,
      (tk >> 8) & 0xff,
      (tk >> 16) & 0xff,
      (tk >> 24) & 0xff
    ]
  }

  // 34 extra tiles required by server
  const extraTiles = []
  let ex = x,
    ey = y
  for (let i = 0; i < 34; i++) {
    extraTiles.push(...tileEntry(ex, ey, k))
    ey = (ey + 30) % 1000
    if (i % 10 === 9) ex = (ex + 22) % 1000
  }

//   Yes, exactly. 0x94 in MessagePack means fixarray[4] — a 4-element array. It's not a custom opcode, it's just the MessagePack encoding for an array of 4 items.

// But your intuition is right — the structure of those 4 elements defines what operation is being requested. The server likely distinguishes request types by the shape/content of the payload, not a separate opcode byte.

// Looking at what we know:

// 94           fixarray[4]  ← 4 elements = "get tile data" request
//   CD XX XX   viewport x
//   CD XX XX   viewport y
//   92         [tiles, token]
//   a0         empty

  const payloadBytes = [
    0x94,
    0xcd,
    f1 & 0xff,
    (f1 >> 8) & 0xff,
    0xcd,
    f2 & 0xff,
    (f2 >> 8) & 0xff,
    0x92,
    0x91, // fixarray[1] - 1 tile
    0xcf,
    tileId & 0xff,
    (tileId >> 8) & 0xff,
    (tileId >> 16) & 0xff,
    (tileId >> 24) & 0xff,
    k & 0xff,
    (k >> 8) & 0xff,
    (k >> 16) & 0xff,
    (k >> 24) & 0xff,
    0xc4,
    0x0c,
    ...token,
    0xa0,
    0x91,
    0xdc,
    0x22,
    0x00, // array16[34] little-endian
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
    headers: {
      accept: '*/*',
      'content-type': 'application/octet-stream',
      Referer: 'https://totalbattle.com/'
    },
    body
  })

  const buf = new Uint8Array(await response.arrayBuffer())
  const text = new TextDecoder().decode(buf)
  const playerIds = [...text.matchAll(/tb:\d+/g)].map(m => m[0])
  const hex = [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ')

  console.log('K:', k, 'X:', x, 'Y:', y)
  console.log('Players:', playerIds.length ? playerIds : 'none')
  console.log('Response length:', buf.length)
  console.log('Hex:', hex)
  return { playerIds, hex, text }
}










// get token from the most recent rubens-realm request
// just grab it fresh from the Network tab → any rubens-realm POST → Payload → find C4 0C + next 12 bytes.

function extractToken(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  for (let i = 0; i < bytes.length - 13; i++) {
    if (bytes[i] === 0xc4 && bytes[i + 1] === 0x0c) {
      const token = Array.from(bytes.slice(i + 2, i + 14))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      console.log('Token:', token)
      console.log('Array:', JSON.stringify(Array.from(bytes.slice(i + 2, i + 14))))
      return token
    }
  }
  console.log('Token not found')
}

// example: extractToken('hgIAAIEBAACUzZIBzRYH...')


function getLatestToken() {
  // intercept the next request automatically
  const origFetch = window.fetch
  window.fetch = async function(url, opts) {
    if (url.includes('rubens-realm') && opts?.body) {
      const bytes = new Uint8Array(await new Response(opts.body).arrayBuffer())
      for (let i = 0; i < bytes.length - 13; i++) {
        if (bytes[i] === 0xC4 && bytes[i+1] === 0x0C) {
          window.__latestToken = Array.from(bytes.slice(i+2, i+14))
          console.log('🔑 Token auto-updated:', window.__latestToken.map(b=>b.toString(16).padStart(2,'0')).join(''))
          break
        }
      }
      window.fetch = origFetch  // restore after first capture
    }
    return origFetch.apply(this, arguments)
  }
  console.log('Waiting for next game request to capture token...')
}

const token = window.__latestToken || [0x69, 0xD1, 0x75, 0x43, ...]

