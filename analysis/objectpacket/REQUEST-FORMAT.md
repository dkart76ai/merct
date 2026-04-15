# Total Battle API - Tile Objects Request Format

## Summary

From analyzing `tools/all-captures8.json`, we've identified the request/response format for tile data.

## Request Format

**Structure (after 8-byte header):**
```
[opcode, sequence, sessionData]
```

```
Byte Offset | Size | Description
-----------+------+-----------------
0          | 8    | Network header (length, etc.)
8          | 1    | 0x94 (fixarray(3) marker)
9          | 1    | 0xCD (uint16 marker)
10-11      | 2    | opcode<<8 | pos_byte (uint16 BE)
12         | 1    | 0xCD (uint16 marker)
13-14      | 2    | sequence<<8 | 0x22 (uint16 BE)
15+        | n    | sessionData (msgpack array)
```

### Example Request Hex:
```
370100002a00000094cd3e01cd5a229291cff24600...
         └─────────────────────────────┘
         After 8-byte header
         
94 cd 3e 01 = opcode=0x3E (62), pos_byte=0x01
cd 5a 22    = sequence=0x5A (90), 0x22
```

## Opcode and Sequence Breakdown

| Field     | Location      | Value Example | Notes                          |
|-----------|---------------|---------------|--------------------------------|
| Opcode    | High byte of offset 10-11 | 0x3E (62) | Packet type identifier |
| Seq low   | Low byte of offset 10-11 | 0x01 | Usually 1, unknown purpose |
| Sequence  | High byte of offset 13-14 | 0x5A (90) | Increments by 2 per packet |
| Unknown   | Low byte of offset 13-14 | 0x22 | Constant across requests |

## Response Format

**Structure:** `[opcode, sequence, responseData]`

```
Byte Offset | Size | Description
-----------+------+-----------------
0          | 8    | Network header
8          | 1    | 0x92 (fixarray(2) marker)
9          | 1    | 0xCD (uint16 marker)
10-11      | 2    | opcode (echoed back)
12         | 1    | 0xCD (uint16 marker)
13-14      | 2    | sequence (echoed back)
15+        | n    | responseData
```

## Sequence Pattern

The sequence increments by 2 for each request:
```
Entry 0:  90 (0x5A)
Entry 1:  92 (0x5C)  +2
Entry 2:  94 (0x5E)  +2
Entry 3:  96 (0x60)  +2
Entry 4:  98 (0x62)  +2
Entry 5: 100 (0x64)  +2
...
```

## Opcode Values Observed

| Opcode | Hex   | Description              |
|--------|-------|--------------------------|
| 62     | 0x3E  | Main tile data request   |
| 58     | 0x3A  | Alternative tile request |
| 137    | 0x89  | Different tile location  |

## Session Data

The session data contains:
- Token (12 bytes, constant per session): `69D6496AAB5AB7C7234CC00E`
- Kingdom ID (appears multiple times)
- Timestamp or counter values
- Additional session identifiers

## Key Findings

1. **Opcode**: Identifies packet type (62, 58, 137 observed)
2. **Sequence**: Increments by 2 per request (90, 92, 94...)
3. **Low bytes**: Both have constant low bytes (0x01 and 0x22)
4. **Token**: Located in session data at offset ~25

## How to Build Request

```javascript
function buildTileRequest(opcode, sequence, sessionToken) {
    // Build the uint16 values
    const opcodeValue = (opcode << 8) | 0x01  // opcode + low byte
    const seqValue = (sequence << 8) | 0x22  // sequence + constant
    
    // After 8-byte header:
    const payload = Buffer.from([
        0x94,                          // fixarray(3)
        0xCD,                          // uint16 marker
        (opcodeValue >> 8) & 0xFF,    // opcode high byte
        opcodeValue & 0xFF,            // opcode low byte
        0xCD,                          // uint16 marker
        (seqValue >> 8) & 0xFF,       // sequence high byte
        seqValue & 0xFF,              // sequence low byte (0x22)
        // + session data...
    ])
}
```

## Example Requests

| Opcode | Sequence | Hex (after header)       |
|--------|----------|---------------------------|
| 62     | 90       | 94cd3e01cd5a22           |
| 58     | 92       | 94cd3a01cd5c22           |
| 137    | 96       | 94cd8901cd6022           |
