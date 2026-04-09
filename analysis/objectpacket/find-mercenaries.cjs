const fs = require('fs');
const path = require('path');

function readUint64LE(buf, off) {
  let val = 0n;
  for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8);
  return Number(val);
}

function parsePacket(data) {
  const buf = Buffer.from(data, 'base64');
  const objects = [];
  let off = 8;

  while (off < buf.length - 30) {
    if (buf[off] === 0x9c && buf[off + 1] === 0x91 && buf[off + 2] === 0xcf) {
      const objectId = readUint64LE(buf, off + 3);
      
      const staticId = buf.readUInt16LE(off + 12);
      const unknown1 = buf[off + 11]; 
      const unknown2 = buf[off + 14]; 
      const unknown3 = buf[off + 15]; 
      const unknown4 = buf[off + 16]; 
      const unknown5 = buf[off + 17]; 
      const unknown6 = buf[off + 18]; 
      const unknown7 = buf[off + 19]; 
      const unknown8 = buf[off + 20]; 
      const unknown9 = buf[off + 21]; 
      
      const kingdom = buf[off + 23];
      const x = buf[off + 24];
      const y = buf[off + 25];
      
      const innerArr1Len = buf[off + 26];
      const innerArr1Val = buf[off + 27];
      
      const extra = buf.readUInt32LE(off + 28);
      
      const lastField = buf[off + 32] === 0xc2 ? false : buf[off + 32] === 0xc3 ? true : buf[off + 32];
      
      objects.push({
        objectId,
        staticId,
        level: unknown2,
        unknown: { unknown1, unknown3, unknown4, unknown5, unknown6, unknown7, unknown8, unknown9 },
        coords: { k: kingdom, x, y },
        innerArr: { len: innerArr1Len, val: innerArr1Val },
        extra,
        lastField
      });
    }
    off++;
  }
  
  return objects;
}

const b64Data = fs.readFileSync(path.join(__dirname, 'packetwithmerc.b64'), 'utf8')
  .replace(/[^A-Za-z0-9+/=]/g, '');

console.log('Parsing mercenary packet...');
const objects = parsePacket(b64Data);

console.log(`Found ${objects.length} total objects`);

const mercenaries = objects.filter(o => o.staticId === 400);
console.log(`Found ${mercenaries.length} mercenaries (staticId=400)\n`);

mercenaries.forEach((m, i) => {
  console.log(`Mercenary ${i + 1}:`);
  console.log(`  objectId: ${m.objectId}`);
  console.log(`  staticId: ${m.staticId}`);
  console.log(`  level: ${m.level}`);
  console.log(`  coords: k${m.coords.k}, x:${m.coords.x}, y:${m.coords.y}`);
  console.log();
});

const output = {
  totalObjects: objects.length,
  uniqueStaticIds: [...new Set(objects.map(o => o.staticId))].sort((a, b) => a - b),
  mercenaries,
  allObjects: objects
};

fs.writeFileSync(
  path.join(__dirname, 'mercenaries-found.json'),
  JSON.stringify(output, null, 2)
);

console.log('Saved to mercenaries-found.json');
