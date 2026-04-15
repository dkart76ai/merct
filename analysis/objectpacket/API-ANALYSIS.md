# Total Battle API Analysis - Tile Objects

## Packet Structure

### Response Format (observed)
```
[opcode, subtype, Buffer(12), seq, [], [objects]]
```

### Object Structure (inside response)
```
[id_array, staticId, 0, type, 0, level, 0, 0, [K,X,Y], [0], extra, flag]
```

| Index | Field      | Example Value | Notes                          |
|-------|------------|---------------|--------------------------------|
| 0     | id         | [60933761166] | Object ID as array            |
| 1     | staticId   | 400           | 400=mercenary, 1450+=building  |
| 2     | -          | 0             | Unknown                        |
| 3     | type       | 2             | Type marker for mercenary     |
| 4     | -          | 0             | Unknown                        |
| 5     | level      | 10            | Mercenary level               |
| 6-7   | -          | 0, 0          | Unknown                        |
| 8     | position   | [14,175,147]  | [kingdom, x, y]               |
| 9     | -          | [0]           | Unknown                        |
| 10    | extra      | 1775697895    | Computed value?               |
| 11    | flag       | false         | Boolean flag  rare cryps unlocked/key   |

## Known Opcodes

| Opcode | Direction | Description              |
|--------|-----------|--------------------------|
| 312    | Request   | GET_OBJECTS?            |
| 358    | Response  | Objects response         |
| 408    | Response  | Alternative response    |
| 3232   | Value     | Unknown (0x0CA0)        |

## Buffer(12) Pattern

The 12-byte buffer appears in both request and response:
```
69d626185c014f44a56f7bXX
```

- Bytes 0-10 appear constant
- Byte 11 varies (315 vs 200 in examples) - possibly checksum or counter

## Possible Request Formats

### Format A: [opcode, viewX, viewY, kingdom]
```
[312, 175, 147, 14]
Hex: 94cd0138ccafcc930e
```

### Format B: [opcode, combinedXY, kingdom]
```
[312, 37807, 14]  where 37807 = (147 << 8) | 175
Hex: 93cd0138cd93af0e
```

### Format C: [312, 3232] (as observed)
```
Hex: 92cd0138cd0ca0
```

## Next Steps

1. **Capture WebSocket Traffic**: Use browser DevTools or a proxy to capture actual requests
2. **Compare Requests**: Compare request parameters with returned object positions
3. **Test Different Formats**: Try each request format to see which one works
4. **Session Handling**: The Buffer(12) may need to be extracted from login/auth responses

## Testing

To request objects for tile (14, 175, 173):

```javascript
// Try Format A
send([312, 175, 173, 14])

// Try Format C (as observed)
send([312, 3232])
```

Watch for responses containing:
- Opcode 408 or 358
- Nested array with objects
- Position [14, 175, 173] in returned objects
