/**
 * Direct HTTP tile scanner - bypasses Playwright navigation entirely
 * Uses the game's binary protocol to batch-scan coordinates
 * Auto-discovers and persists kingdom → game server mappings
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVERS_FILE = path.join(__dirname, 'kingdom-servers.json')

export class TileScanner {
  constructor(config) {
    this.config = config  // { workerId, kingdom }
    this.sessionToken = null  // 12-byte Buffer captured from browser
    this.kingdom = config.kingdom || 305
    this.kingdomServers = {}  // { 305: 'game-us47.totalbattle.com', 175: 'game-us20.totalbattle.com' }
    this._loadServers()
  }

  async _loadServers() {
    try {
      const raw = await readFile(SERVERS_FILE, 'utf-8')
      this.kingdomServers = JSON.parse(raw)
      console.log(`[${this.config.workerId}] 🗺️ Loaded ${Object.keys(this.kingdomServers).length} kingdom-server mappings`)
    } catch {
      this.kingdomServers = {}
    }
  }

  async _saveServers() {
    try {
      await writeFile(SERVERS_FILE, JSON.stringify(this.kingdomServers, null, 2))
    } catch (e) {
      console.error(`[${this.config.workerId}] Failed to save kingdom-servers.json:`, e.message)
    }
  }

  get gameServer() {
    return this.kingdomServers[this.kingdom] || null
  }

  /**
   * Called from browser-handler when a POST request to the game server is intercepted
   * Extracts session token, game server URL, and kingdom→server mappings from request body
   */
  captureFromRequest(url, bodyBuffer) {
    // extract game server from URL
    const serverMatch = url.match(/https?:\/\/(game-[^/]+)\//)
    if (!serverMatch) return false

    const gameServer = serverMatch[1]

    // extract kingdom from URL: /rubens-realmXXX
    const kingdomMatch = url.match(/rubens-realm(\d+)/)
    if (kingdomMatch) {
      const kingdom = parseInt(kingdomMatch[1])
      if (!this.kingdomServers[kingdom]) {
        this.kingdomServers[kingdom] = gameServer
        console.log(`[${this.config.workerId}] 🗺️ Mapped kingdom ${kingdom} → ${gameServer}`)
        this._saveServers()
      }
    }

    // also extract all kingdoms from the request body tiles
    let newMappings = false
    for (let i = 8; i < bodyBuffer.length - 9; i++) {
      if (bodyBuffer[i] === 0x91 && bodyBuffer[i + 1] === 0xCF) {
        const lo = bodyBuffer.readUInt32LE(i + 2)
        const hi = bodyBuffer.readUInt32LE(i + 6)
        const x = Math.floor(lo / 1000), y = lo % 1000
        if (x <= 999 && y <= 999 && hi > 0 && hi < 10000) {
          if (!this.kingdomServers[hi]) {
            this.kingdomServers[hi] = gameServer
            console.log(`[${this.config.workerId}] 🗺️ Mapped kingdom ${hi} → ${gameServer}`)
            newMappings = true
          }
          i += 9
        }
      }
    }
    if (newMappings) this._saveServers()

    // find session token: C4 0C followed by 12 bytes
    for (let i = 0; i < bodyBuffer.length - 13; i++) {
      if (bodyBuffer[i] === 0xC4 && bodyBuffer[i + 1] === 0x0C) {
        this.sessionToken = bodyBuffer.slice(i + 2, i + 14)
        console.log(`[${this.config.workerId}] 🔑 Session token captured: ${this.sessionToken.toString('hex')}`)
        return true
      }
    }
    return false
  }

  get isReady() {
    return !!this.sessionToken && !!this.gameServer
  }

  getServerForKingdom(kingdom) {
    return this.kingdomServers[kingdom] || this.gameServer
  }

  buildRequest(tiles, viewX = 0x0192, viewY = 0x0716) {
    const tileEntry = (x, y, k) => {
      const tileId = x * 1000 + y
      const kingdom = k || this.kingdom
      return [
        0x91, 0xCF,
        tileId & 0xFF, (tileId >> 8) & 0xFF, (tileId >> 16) & 0xFF, (tileId >> 24) & 0xFF,
        kingdom & 0xFF, (kingdom >> 8) & 0xFF, (kingdom >> 16) & 0xFF, (kingdom >> 24) & 0xFF
      ]
    }

    const tileCount = tiles.length
    const tileListHeader = tileCount <= 15
      ? [0x90 | tileCount]
      : [0xDC, tileCount & 0xFF, (tileCount >> 8) & 0xFF]
    const tileBytes = tiles.flatMap(({ k, x, y }) => tileEntry(x, y, k))

    const extraCount = 34
    const firstTile = tiles[0]
    const extraTiles = []
    let ex = firstTile.x, ey = firstTile.y
    for (let i = 0; i < extraCount; i++) {
      extraTiles.push(...tileEntry(ex, ey, firstTile.k))
      ey = (ey + 30) % 1000
      if (i % 10 === 9) ex = (ex + 22) % 1000
    }

    const payload = Buffer.from([
      0x94,
      0xCD, viewX & 0xFF, (viewX >> 8) & 0xFF,
      0xCD, viewY & 0xFF, (viewY >> 8) & 0xFF,
      0x92,
        ...tileListHeader,
        ...tileBytes,
        0xC4, 0x0C, ...this.sessionToken,
      0xa0,
      0x91,
        0xDC, extraCount & 0xFF, (extraCount >> 8) & 0xFF,
        ...extraTiles
    ])

    const header = Buffer.alloc(8)
    header.writeUInt32LE(payload.length + 8, 0)
    header.writeUInt32LE(payload.length, 4)

    return Buffer.concat([header, payload])
  }

  // Known staticIds for mercenary exchanges
  static MERCENARY_STATIC_IDS = new Set([400])

  // StaticIds to skip (terrain, resources, monsters, clan buildings)
  static SKIP_STATIC_IDS = new Set([
    1, 2, 3, 5, 6, 8, 9,                          // terrain
    101, 102, 103, 104, 105, 107, 108, 110, 111,   // terrain
    113, 114, 115, 116,                             // terrain
    73, 103, 133, 199, 210, 540,                    // resources/ruins
    10001, 10002, 10003, 10004, 10005, 10006, 10007 // clan buildings
  ])

  parseResponse(buffer) {
    const text = buffer.toString('utf-8')

    // extract tb: player IDs
    const playerIds = [...text.matchAll(/tb:(\d{8})/g)].map(m => `tb:${m[1]}`)

    // extract tile records with staticIds
    // format: 91 CF [tileId LE4] [kingdom LE4] ... then subIndex (small int or CD uint16)
    const tileObjects = []
    for (let i = 0; i < buffer.length - 9; i++) {
      if (buffer[i] === 0x91 && buffer[i + 1] === 0xCF) {
        const tileId = buffer.readUInt32LE(i + 2)
        const kingdom = buffer.readUInt32LE(i + 6)
        const x = Math.floor(tileId / 1000)
        const y = tileId % 1000
        if (x <= 999 && y <= 999 && kingdom > 0 && kingdom < 10000) {
          // read subIndex (staticId candidate) — next msgpack value after the uint64
          let staticId = null
          const next = i + 10
          if (next < buffer.length) {
            if (buffer[next] <= 0x7f) {
              staticId = buffer[next]  // fixint
            } else if (buffer[next] === 0xCD && next + 2 < buffer.length) {
              staticId = buffer.readUInt16LE(next + 1)  // uint16 LE
            } else if (buffer[next] === 0xCC) {
              staticId = buffer[next + 1]  // uint8
            }
          }
          tileObjects.push({ k: kingdom, x, y, tileId, staticId })
        }
      }
    }

    // classify tiles
    const mercenaries = tileObjects.filter(t => TileScanner.MERCENARY_STATIC_IDS.has(t.staticId))
    const players = tileObjects.filter(t => playerIds.length > 0)
    const unknown = tileObjects.filter(t =>
      t.staticId !== null &&
      !TileScanner.MERCENARY_STATIC_IDS.has(t.staticId) &&
      !TileScanner.SKIP_STATIC_IDS.has(t.staticId)
    )

    return {
      playerIds,
      tileObjects,
      mercenaries,
      unknown,  // tiles with unrecognized staticIds — log for discovery
      raw: text
    }
  }

  /**
   * Scan a batch of tiles — server only returns data for tiles with objects
   * Tiles with no data = empty terrain
   */
  async scanTiles(tiles) {
    if (!this.sessionToken) {
      throw new Error('Scanner not ready — session token not captured yet')
    }

    const kingdom = tiles[0].k || this.kingdom
    const server = this.getServerForKingdom(kingdom)
    if (!server) {
      throw new Error(`No server known for kingdom ${kingdom}`)
    }

    const body = this.buildRequest(tiles)
    const url = `https://${server}/rubens-realm${kingdom}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'content-type': 'application/octet-stream',
        'Referer': 'https://totalbattle.com/'
      },
      body
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const responseBuffer = Buffer.from(await response.arrayBuffer())
    const parsed = this.parseResponse(responseBuffer)

    if (parsed.mercenaries.length > 0) {
      console.log(`[${this.config.workerId}] ⚔️ MERCENARY FOUND at:`, parsed.mercenaries.map(t => `K:${t.k} X:${t.x} Y:${t.y}`).join(', '))
    }
    if (parsed.unknown.length > 0) {
      console.log(`[${this.config.workerId}] ❓ Unknown staticIds:`, parsed.unknown.map(t => `K:${t.k} X:${t.x} Y:${t.y} staticId:${t.staticId}`).join(', '))
    }
    if (parsed.playerIds.length > 0) {
      console.log(`[${this.config.workerId}] 👤 Players: ${parsed.playerIds.join(', ')}`)
    }

    return parsed
  }

  hasMercenary(parsed) {
    return parsed.mercenaries.length > 0
  }
}
