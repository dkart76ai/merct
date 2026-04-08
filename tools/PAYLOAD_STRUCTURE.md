# Tile Scanner Payload Structure

## Overview

The Total Battle tile scanner uses a binary msgpack-encoded request to fetch map objects (tiles) from the game server.

## Request Structure

### Endpoint
```
POST https://game-{server}.totalbattle.com/rubens-realm{kindom}
Content-Type: application/octet-stream
```

### Hardcoded Payload (42 bytes)

```
2a 00 00 00  2a 00 00 00  94 CD XX XX  CD YY YY  92 91 CF 36 DB 04 00 A6 00 00 00  C4 0C [TOKEN 12 bytes]  A0 90
|----8-byte header----|  |94| |viewX|  |viewY|  |------static data------|  |--token marker--|              |--trail-|
```

### Byte-by-byte Breakdown

| Bytes | Hex Values | Description |
|-------|------------|-------------|
| 0-7 | `2a 00 00 00 2a 00 00 00` | 8-byte header (fixed) |
| 8 | `94` | Msgpack fixarray4 marker |
| 9 | `CD` | Msgpack uint16 marker for viewX |
| 10-11 | `XX XX` | **viewX value** (uint16, little-endian) |
| 12 | `CD` | Msgpack uint16 marker for viewY |
| 13-14 | `YY YY` | **viewY value** (uint16, little-endian) |
| 15-25 | `92 91 CF 36 DB 04 00 A6 00 00 00` | Static data (unchanged) |
| 26 | `C4` | Msgpack bin marker |
| 27 | `0C` | Bin length (12 bytes) |
| 28-39 | `[TOKEN]` | **Session token** (12 bytes) |
| 40-41 | `A0 90` | Trailing bytes (fixed) |

## viewX and viewY Values

### The Formula
```
viewX = x-coordinate you want to query
viewY = y-coordinate you want to query
```

To request tile at coordinates (500, 600):
```
viewX = 500  (0x01F4 in hex)
viewY = 600  (0x0258 in hex)
```

### viewX Behavior (Critical!)

**NOT all viewX values return the same tiles!**

| viewX Type | Example Values | Tiles Returned | Description |
|------------|---------------|----------------|-------------|
| **Narrow** | 312, 402, 601, 24201 | 1 tile | Returns only the tile AT x=viewX |
| **Wide** | 311, 461, 3533, 4301 | 50-1400 tiles | Returns many tiles around x=viewX |

#### Narrow ViewX Examples
```
viewX=312, viewY=2161 → Returns tile at (312, 2161) ONLY
viewX=402, viewY=2200 → Returns tile at (402, 2200) ONLY
viewX=601, viewY=1500 → Returns tile at (601, 1500) ONLY
```

#### Wide ViewX Examples
```
viewX=311, viewY=2180 → Returns ~100-500 tiles including (311, 2180) and nearby tiles
viewX=311, viewY=2214 → Returns ~1300 tiles in that area
viewX=4301, viewY=2500 → Returns ~1000 tiles in that area
```

### Which viewX to Use?

| Goal | Use | Example |
|------|-----|---------|
| Get ONE specific tile | **Narrow** (even ending) | `viewX=500, viewY=600` |
| Get ALL tiles in an area | **Wide** (odd ending or specific) | `viewX=500, viewY=600` with wide viewX |

**To always get the single tile at (x, y):**
- Use viewX values like: 312, 402, 601, 24201, 52684
- These return exactly 1 tile (if a tile exists at that coordinate)

**To explore an area:**
- Use viewX values like: 311, 461, 3533, 4301
- These return many tiles around the coordinate

### viewX Pattern (from analysis)

Based on captured data, viewX behavior varies:

| viewX | Avg Tiles | Behavior |
|-------|-----------|----------|
| 312 | 1 | NARROW - single tile |
| 311 | 465 | WIDE - many tiles |
| 402 | 1 | NARROW - single tile |
| 401 | ~50-500 | WIDE - many tiles |
| 601 | 1 | NARROW - single tile |
| 4301 | 1079 | WIDE - many tiles |
| 52684 | 0 | NARROW - but outside range |


viewX behavior - THIS IS THE CONFUSING PART:
viewX Clarification
viewX you SET	What it RETURNS
viewX=312 (even ending)	Returns 1 tile at x=312
viewX=311 (odd ending)	Returns many tiles around x=311
viewX=401 (odd ending)	Returns many tiles around x=401
viewX=402 (even ending)	Returns 1 tile at x=402
Key insight: viewX values ending in even digits (0,2,4,6,8) = NARROW (1 tile) viewX values ending in odd digits (1,3,5,7,9) = WIDE (many tiles)

Example
getTile(146, 500, 600) with viewX=500:
- If you use viewX ending in even (like 500) → returns 1 tile at (500, 600)
- If you use viewX ending in odd (like 501) → returns many tiles around (501, 600)

## Tile Data Structure

### Kingdom Map Range
Each kingdom has a map with tiles in the range:
- **x**: 0 - ~2000
- **y**: 0 - ~3000

### Coordinate System
- Coordinates are **tile coordinates**, not pixel coordinates
- Map wraps at y=3000 (when viewY > 3000, tiles wrap)
- Tiles only exist at certain coordinates (not all positions have tiles)

### Response Format

The server returns msgpack-encoded data containing tile objects. Tiles are encoded as `[x, y]` coordinate pairs within nested arrays.

**Extraction rules:**
- Look for arrays containing `[x, y]` pairs where:
  - 200 ≤ x ≤ 2000
  - 200 ≤ y ≤ 3000
  - x ≠ y

## Token

The session token is:
- **12 bytes** long
- Unique per browser session
- **Required** for requests to work
- Expires when browser session ends

### Getting a Token

1. Open game in browser
2. Run browser interceptor script
3. Capture a tile request
4. Extract token from bytes 28-39 of the request body

## Complete Example

### Request for tile at (500, 600)

```javascript
// Token from browser (example)
const token = '69d41f2e9de6133515a270d2';

// viewX=500, viewY=600
const payload = createPayload(token, 500, 600);
// Result: 2a0000002a00000094CDF401CD58029291CF36DB0400A6000000C40C69D41F2E9DE6133515A270D2A090
//                     ^^^^viewX=500                    ^^^^viewY=600

// Send to:
// POST https://game-us17.totalbattle.com/rubens-realm146
```

## Summary

| Component | Value/Format |
|-----------|--------------|
| Payload Size | 42 bytes |
| viewX position | bytes 10-11 (uint16 LE) |
| viewY position | bytes 13-14 (uint16 LE) |
| Token position | bytes 28-39 (12 bytes) |
| viewX range | 0-65535 |
| viewY range | 0-65535 |
| Map y-wrap | at y=3000 |

## Important Notes

1. **Token is session-bound** - Must get fresh token from browser
2. **viewX determines scan mode** - Narrow returns 1 tile, Wide returns many
3. **viewY wraps at 3000** - y > 3000 wraps to 0
4. **Not all tiles exist** - Some coordinates have no tile data
5. **viewX/x,y match** - `viewX=500` queries tile at `x=500`
