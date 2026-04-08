// YO: Standalone Tile Scanner - Use captured token from browser
// Usage: node scanner.cjs <token> <server> <kingdom> [x] [y]

const https = require('https');
const fs = require('fs');

const TILE_NAMES = {
  17: 'Pueblo', 34: 'Pueblo', 69: 'Aserradero', 73: 'Aserradero',
  79: 'Aserradero', 84: 'Aserradero', 104: 'Mina', 109: 'Mina',
  124: 'Cantera', 211: 'Ruinas de manantial',
  1450: 'Esc.muerto', 1451: 'Esc.elfo', 1452: 'Esc.maldito', 1454: 'Esc.infernal',
  1455: 'Esc.muerto', 1462: 'Esc.maldito', 1463: 'Esc.barbaro', 1465: 'Esc.muerto',
  1467: 'Esc.maldito', 1468: 'Esc.muerto', 1470: 'Esc.muerto', 1473: 'Esc.barbaro',
  1482: 'Esc.maldito', 1484: 'Esc.infernal', 1489: 'Esc.infernal', 1492: 'Esc.maldito',
  1508: 'Esc.barbaro', 1511: 'Esc.elfo', 1514: 'Esc.infernal', 1519: 'Esc.infernal',
  1591: 'Esc.raro.elfo', 1592: 'Esc.raro.maldito', 1593: 'Esc.raro.barbaro',
  1595: 'Esc.raro.muerto', 1598: 'Esc.raro.maldito', 1600: 'Esc.raro.muerto',
  1604: 'Esc.raro.infernal', 1606: 'Esc.raro.elfo', 1615: 'Esc.raro.muerto',
  1617: 'Esc.raro.maldito', 1639: 'Esc.raro.infernal', 1644: 'Esc.raro.infernal',
  1658: 'Esc.raro.infernal', 1659: 'Esc.raro.infernal', 1668: 'Esc.raro.barbaro',
  1684: 'Esc.raro.barbaro', 1699: 'Esc.raro.infernal',
  1812: 'Ciudadela.elfa', 1816: 'Ciudadela.maldita', 1817: 'Ciudadela.elfa',
  2102: 'Cripta', 2108: 'Cripta', 2206: 'Cripta', 2211: 'Cripta',
  2302: 'Cripta', 2304: 'Cripta', 2309: 'Cripta', 2410: 'Cripta',
  2753: 'Cripta.epica', 3201: 'Cripta.rara', 3301: 'Cripta.rara',
  3511: 'Cripta.rara', 3512: 'Cripta.rara', 4000: 'Spawn'
};

// Complete msgpack decoder with LE for coordinates

function readValue(buf, off) {
  if (off >= buf.length) return { val: null, end: buf.length };
  const byte = buf[off++];
  
  // Positive fixint (0xxxxxxx)
  if (byte < 0x80) return { val: byte, end: off };
  
  // Negative fixint (111xxxxx)
  if (byte >= 0xe0) return { val: byte - 256, end: off };
  
  // Fixmap (1000xxxx)
  if ((byte & 0xf0) === 0x80) {
    const size = byte & 0x0f;
    const obj = {};
    let o = off;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const k = readValue(buf, o);
      o = k.end;
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      o = v.end;
      obj[k.val] = v.val;
    }
    return { val: obj, end: o };
  }
  
  // Fixarray (1001xxxx)
  if ((byte & 0xf0) === 0x90) {
    const size = byte & 0x0f;
    const arr = [];
    let o = off;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      arr.push(v.val);
      o = v.end;
    }
    return { val: arr, end: o };
  }
  
  // Fixstr (101xxxxx)
  if ((byte & 0xe0) === 0xa0) {
    const len = byte & 0x1f;
    return { val: buf.slice(off, off + len).toString('utf8'), end: off + len };
  }
  
  // 0xc0 - nil
  if (byte === 0xc0) return { val: null, end: off };
  
  // 0xc1 - never used
  
  // 0xc2 - false
  if (byte === 0xc2) return { val: false, end: off };
  
  // 0xc3 - true
  if (byte === 0xc3) return { val: true, end: off };
  
  // 0xc4 - bin8
  if (byte === 0xc4) {
    const len = buf[off];
    return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len };
  }
  
  // 0xc5 - bin16
  if (byte === 0xc5) {
    const len = buf.readUInt16BE(off);
    return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len };
  }
  
  // 0xc6 - bin32
  if (byte === 0xc6) {
    const len = buf.readUInt32BE(off);
    return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len };
  }
  
  // 0xc7 - ext8, 0xc8 - ext16, 0xc9 - ext32
  if (byte >= 0xc7 && byte <= 0xc9) {
    let len, dataOff;
    if (byte === 0xc7) { len = buf[off]; dataOff = off + 2; }
    else if (byte === 0xc8) { len = buf.readUInt16BE(off); dataOff = off + 3; }
    else { len = buf.readUInt32BE(off); dataOff = off + 5; }
    const type = buf[dataOff];
    const data = buf.slice(dataOff + 1, dataOff + 1 + len - 1);
    return { val: { type, data }, end: dataOff + len };
  }
  
  // 0xca - float32
  if (byte === 0xca) {
    const view = new DataView(buf.buffer, buf.byteOffset + off);
    return { val: view.getFloat32(0), end: off + 4 };
  }
  
  // 0xcb - float64
  if (byte === 0xcb) {
    const view = new DataView(buf.buffer, buf.byteOffset + off);
    return { val: view.getFloat64(0), end: off + 8 };
  }
  
  // 0xcc - uint8
  if (byte === 0xcc) return { val: buf[off], end: off + 1 };
  
  // 0xcd - uint16 (LE for coordinates)
  if (byte === 0xcd) return { val: buf.readUInt16LE(off), end: off + 2 };
  
  // 0xce - uint32 (LE for coordinates)
  if (byte === 0xce) return { val: buf.readUInt32LE(off), end: off + 4 };
  
  // 0xcf - uint64
  if (byte === 0xcf) {
    let val = 0n;
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8);
    return { val: Number(val), end: off + 8 };
  }
  
  // 0xd0 - int8
  if (byte === 0xd0) return { val: buf.readInt8(off), end: off + 1 };
  
  // 0xd1 - int16 (LE)
  if (byte === 0xd1) return { val: buf.readInt16LE(off), end: off + 2 };
  
  // 0xd2 - int32 (LE)
  if (byte === 0xd2) return { val: buf.readInt32LE(off), end: off + 4 };
  
  // 0xd3 - int64 (LE)
  if (byte === 0xd3) {
    let val = 0n;
    for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8);
    return { val: Number(val), end: off + 8 };
  }
  
  // 0xd4 - fixext1, 0xd5 - fixext2, 0xd6 - fixext4, 0xd7 - fixext8, 0xd8 - fixext16
  if (byte >= 0xd4 && byte <= 0xd8) {
    const sizes = [1, 2, 4, 8, 16];
    const size = sizes[byte - 0xd4];
    return { val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) }, end: off + 1 + size };
  }
  
  // 0xd9 - str8
  if (byte === 0xd9) {
    const len = buf[off];
    return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len };
  }
  
  // 0xda - str16
  if (byte === 0xda) {
    const len = buf.readUInt16BE(off);
    return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len };
  }
  
  // 0xdb - str32
  if (byte === 0xdb) {
    const len = buf.readUInt32BE(off);
    return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len };
  }
  
  // 0xdc - array16
  if (byte === 0xdc) {
    const size = buf.readUInt16BE(off);
    const arr = [];
    let o = off + 2;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      arr.push(v.val);
      o = v.end;
    }
    return { val: arr, end: o };
  }
  
  // 0xdd - array32
  if (byte === 0xdd) {
    const size = buf.readUInt32BE(off);
    const arr = [];
    let o = off + 4;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      arr.push(v.val);
      o = v.end;
    }
    return { val: arr, end: o };
  }
  
  // 0xde - map16
  if (byte === 0xde) {
    const size = buf.readUInt16BE(off);
    const obj = {};
    let o = off + 2;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const k = readValue(buf, o);
      o = k.end;
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      o = v.end;
      obj[k.val] = v.val;
    }
    return { val: obj, end: o };
  }
  
  // 0xdf - map32
  if (byte === 0xdf) {
    const size = buf.readUInt32BE(off);
    const obj = {};
    let o = off + 4;
    for (let i = 0; i < size; i++) {
      if (o >= buf.length) break;
      const k = readValue(buf, o);
      o = k.end;
      if (o >= buf.length) break;
      const v = readValue(buf, o);
      o = v.end;
      obj[k.val] = v.val;
    }
    return { val: obj, end: o };
  }
  
  return { val: null, end: off + 1 };
}

function decodeObjects(buf) {
  const objects = [];
  for (let off = 8; off < buf.length - 50; off++) {
    if (buf[off] !== 0x9c) continue;
    const v = readValue(buf, off);
    if (!Array.isArray(v.val) || v.val.length !== 12) continue;
    const coords = v.val[8];
    if (!Array.isArray(coords) || coords.length !== 3) continue;
    const [k, x, y] = coords;
    if (k < 2 || k > 2000) continue;
    objects.push({
      k, x, y,
      staticId: v.val[1],
      level: v.val[5],
      name: TILE_NAMES[v.val[1]] || 'Unknown'
    });
  }
  return objects;
}

function buildPayload(x, y, staticId, token) {
  const payload = Buffer.alloc(41);
  payload.writeUInt32LE(41, 0);
  payload.writeUInt32LE(33, 4);
  payload[8] = 0x94;
  payload.writeUInt16LE(x, 10);
  payload.writeUInt16LE(y, 13);
  payload[16] = 0x92;
  payload[17] = 0x91;
  const sid = BigInt(staticId);
  for (let i = 0; i < 8; i++) payload[18 + i] = Number((sid >> BigInt(i * 8)) & 0xffn);
  payload[26] = 0xc4; payload[27] = 0x0c;
  const tokenBytes = Buffer.from(token, 'base64');
  tokenBytes.copy(payload, 28);
  payload[40] = 0xa0;
  return payload;
}

async function query(server, kingdom, staticId, token, x, y) {
  return new Promise((resolve, reject) => {
    const payload = buildPayload(x, y, staticId, token);
    const url = `https://game-${server}.totalbattle.com/rubens-realm${kingdom}`;
    
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf[0] === 0x3c) {
          resolve({ error: 'HTML response (token expired?)', objects: [] });
          return;
        }
        const objects = decodeObjects(buf);
        resolve({ x, y, status: res.statusCode, objects, size: buf.length });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function scanArea(server, kingdom, staticId, token, cx, cy, radius, delay = 300) {
  console.log(`YO: Scanning kingdom ${kingdom} around (${cx},${cy}) radius ${radius}`);
  const results = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = cx + dx, y = cy + dy;
      try {
        const result = await query(server, kingdom, staticId, token, x, y);
        if (result.objects.length > 0) {
          results.push(result);
          console.log(`  YO: (${x},${y}) -> ${result.objects.length} objects`);
        }
        await new Promise(r => setTimeout(r, delay));
      } catch (e) {
        console.log(`  YO: (${x},${y}) ERROR: ${e.message}`);
      }
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--help' || args.length < 4) {
    console.log('YO: Tile Scanner');
    console.log('');
    console.log('Usage:');
    console.log('  node scanner.cjs <token_b64> <server> <kingdom> <x> <y>');
    console.log('  node scanner.cjs <token_b64> <server> <kingdom> scan <cx> <cy> <radius>');
    console.log('');
    console.log('Get token from browser: YOexport() in tile-scanner-v4.js');
    return;
  }

  const token = args[0];
  const server = args[1];
  const kingdom = parseInt(args[2]);
  const cmd = args[3];

  const staticId = 712964889398;

  if (cmd === 'scan') {
    const cx = parseInt(args[4]);
    const cy = parseInt(args[5]);
    const radius = parseInt(args[6] || '1');
    const results = await scanArea(server, kingdom, staticId, token, cx, cy, radius);
    console.log(`\nYO: Found objects in ${results.length} tiles`);
    fs.writeFileSync(`scan-results-k${kingdom}.json`, JSON.stringify(results, null, 2));
    console.log(`YO: Saved to scan-results-k${kingdom}.json`);
  } else {
    const x = parseInt(args[3]);
    const y = parseInt(args[4]);
    const result = await query(server, kingdom, staticId, token, x, y);
    
    if (result.error) {
      console.log(`YO: Error - ${result.error}`);
    } else {
      console.log(`YO: (${x},${y}) -> ${result.objects.length} objects (${result.size} bytes)`);
      result.objects.slice(0, 30).forEach(o => {
        console.log(`  [${o.name}] lvl${o.level} at (${o.x},${o.y}) staticId=${o.staticId}`);
      });
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { query, scanArea, decodeObjects };
