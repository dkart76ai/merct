# Tile Scanner - Captured Regions

## Kingdom 305 (us47)

| viewX | Center X | Objects |
|-------|----------|---------|
| 205 | ~269 | 5 |
| 2765 | ~91 | 5 |
| 63693 | ~247 | 5 |
| 58061 | ~468 | 5 |
| 50893 | ~530 | 5 |
| 5325 | ~530 | 5 |
| 312 | ~827 | 5 |
| 41932 | ~827 | 5 |
| 64204 | ~827 | 5 |

## Usage

### Replay captured requests:
```javascript
const https = require('https');
const { decodeObjects } = require('./scanner.cjs');
const captures = JSON.parse(fs.readFileSync('all-captures4.json'));
const template = Buffer.from(captures[0].requestB64, 'base64');

// Replay
const req = https.request(url, { method: 'POST', ... }, res => ...);
req.write(template);
```

### Query different tiles:
- Browse to different map areas in game
- Capture new requests using browser interceptor
- Replay captured requests to extract objects

## Token

Current token from all-captures4.json: `e8f758203918e42826a00339`
Server: us47
Kingdom: 305

Token expires when browser session ends. Need fresh capture for new queries.
