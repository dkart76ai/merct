# Total Battle Protocol - Complete Analysis

## Endpoint
```
POST https://game-{server}.totalbattle.com/rubens-realm{kingdom}
Content-Type: application/octet-stream
```

## Request Structure

### Binary Layout
```
[0-3]   uint32 LE - Total payload size (header + full msgpack)
[4-7]   uint32 LE - Base msgpack size (without extra data)
[8...]  Full msgpack data
```

### Msgpack Structure
The msgpack is composed of TWO concatenated parts:

#### Part 1: Base Request (always present)
```
fixarray4[
  viewX (uint16),           // X coordinate
  viewY (uint16),           // Y coordinate  
  fixarray2[                // Session info
    fixarray1[staticId (uint64)],
    token (bin8[12])        // 12-byte auth token
  ],
  fixstr0                   // Empty string
]
```

#### Part 2: Extra Data (client cache + tile hints)
```
fixarray4[
  xCoordinates (array),     // X coords to query: [312, 313, 314]
  versions (array),         // Version numbers: [0, 0, 0] (must match xCoords length)
  unknown1 (array),         // Usually empty: []
  unknown2 (array)          // Usually empty: []
]
```

### Key Byte Positions
| Offset | Content |
|--------|---------|
| 10-11 | viewX (uint16 LE) |
| 13-14 | viewY (uint16 LE) |
| 17-24 | staticId (uint64 LE) |
| 28-39 | token (12 bytes) |

### How Extra Data Affects Response
| Extra Data | Response Size |
|-----------|--------------|
| `[]` (empty) | 17-21 bytes (minimal) |
| `[[x]]` | 66 bytes (error: chunk mismatch) |
| `[[x,y,z],[0,0,0],[],[]]` | 3000-6000+ bytes (full data) |
| Full original template | 400-150000+ bytes |

### Request Size Formula
- **Minimal** (no extra): 41 bytes
- **With extra**: 41 + extra_msgpack_size bytes

## Response Structure

### Binary Layout
```
[0-3]   uint32 LE - Response size
[4-7]   uint32 LE - Msgpack size
[8...]  Msgpack data
```

### Response Types

#### Empty Tile (17-21 bytes)
```
[viewX, viewY]
[timestamp]
```

#### Tile with Objects (100+ bytes)
Contains multiple msgpack values:
- `[viewX, viewY]`
- Object entries: `[tileBuffer(12), objectId, timestamp, type]`
- Nested object data arrays
- Kingdom info (for large responses)

## Object Extraction (FIXED)

### Object Array Structure (12-element fixarray)
```
fixarray12[
  [0]: [typeId],           // Array containing typeId (big number)
  [1]: staticId,           // uint16 LE - Object type identifier
  [2]: 0,                 // Unknown
  [3]: 2,                 // Unknown  
  [4]: 0,                 // Unknown
  [5]: level,             // uint16 LE - Object level (1-100)
  [6]: 0,                 // Unknown
  [7]: 0,                 // Unknown
  [8]: [kingdom, x, y],   // Coords as [uint16 LE, uint16 LE, uint16 LE]
  [9]: [0],               // Unknown
  [10]: timestamp,        // Last update time
  [11]: boolean           // Unknown flag
]
```

### Decoder Approach
1. Search for `0x9c` bytes (fixarray[12] marker)
2. Decode 12-element array from that position
3. Check if element [8] is a 3-element coords array
4. Validate kingdom is in range 2-2000 (actual kingdoms: 2-1028)
5. Extract: coords[8], staticId[1], level[5]

## Coordinate System
- **viewX**: 0-999 for tile coordinates
- **viewY**: 2000-3308 in captures (offset by ~2000)
- **Odd viewX**: Returns wider area
- **Even viewX**: Returns single tile

## Authentication
- **staticId**: `712964889398` (constant across all captures)
- **token**: 12 bytes, session-bound, expires with browser session
- Must be captured from active game session

## Working Request Builder

```javascript
function buildRequest(viewX, viewY, staticId, token, xRange) {
  const mainArray = [viewX, viewY, [[staticId], token], ""];
  const mainMsgpack = encodeMsgpack(mainArray);
  
  // Extra data: xRange must have matching zeros in versions
  const xCoords = xRange || [viewX];
  const extraData = [xCoords, new Array(xCoords.length).fill(0), [], []];
  const extraMsgpack = encodeMsgpack(extraData);
  
  const fullMsgpack = Buffer.concat([mainMsgpack, extraMsgpack]);
  
  const header = Buffer.alloc(8);
  header.writeUInt32LE(fullMsgpack.length + 8, 0);
  header.writeUInt32LE(mainMsgpack.length, 4);
  
  return Buffer.concat([header, fullMsgpack]);
}

// Usage:
const req = buildRequest(312, 2161, 712964889398, token, [312, 313, 314]);
// Returns ~58 byte request that gets full tile data
```

## Key Findings

1. **Minimal request (41 bytes) works** but returns minimal data
2. **Extra data with xRange + versions** triggers full object data
3. **Versions array must match xCoords length** with all zeros
4. **Token expires** with browser session - must be fresh
5. **All captures share same staticId** (712964889398)
6. **Template approach works** - copy original request, modify viewX/viewY

## Usage Instructions

### Browser Interceptor (tile-scanner-v4.js)
1. Copy `tools/tile-scanner-v4.js` to browser console
2. Navigate in game - token auto-captured
3. Use commands:
   - `YOquery(x, y)` - Query single tile
   - `YOquery(x, y, kingdom)` - Query tile in specific kingdom
   - `YOscan(cx, cy, radius)` - Scan area
   - `YOexport()` - Export token for Node.js scanner

### Node.js Scanner (scanner.cjs)
1. Get token from browser: `YOexport()` in console
2. Run: `node scanner.cjs <token> <server> <kingdom> <x> <y>`
3. Or scan area: `node scanner.cjs <token> <server> <kingdom> scan <cx> <cy> <radius>`

### Output Format
Objects have: `k` (kingdom), `x`, `y`, `staticId`, `level`, `name`
