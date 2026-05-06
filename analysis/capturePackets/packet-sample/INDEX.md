# TotalBattle Packet Documentation Index

> Auto-generated index of 69 captured opcodes from the TotalBattle game protocol.
> Each opcode links to a detailed .md file with request/response samples, type analysis, and cross-referenced IDs.
>
> **Master Field Reference:** See [FIELDS.md](FIELDS.md) for the complete catalog of ALL extractable data fields,
> database schema recommendations, bot automation strategies, and appendix ID tables.

---

## Summary

| Metric | Count |
|--------|-------|
| Total documented opcodes | 69 |
| With server description | 51 |
| Uncategorized | 11 |
| Categories | 10 |

---

## Known ID Reference

The following IDs were identified from [402.md](402.md) (Player Information Response) and are tracked across all packets:

| ID Type | Format | Example | Description |
|---------|--------|---------|-------------|
| **Player ID** (progressId) | `tb:{N} | `tb:69488593` | Persistent player identifier, stable across relogins |
| **Object ID** | Large int64 (~1.215e12) | `1215475787029` | Map object ID (city, building, troop), changes on relogin |
| **Clan ID** | Large int64 (~1.215e12) | `1215475744834` | Clan identifier in single-element array, `[0]` = no clan |

---

## Map and Objects

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 22 | *No server description* | 614B | [22.md](22.md) |
| 24 | appear when click on clan button | 685B | [24.md](24.md) |
| 311 | something with tiles | 1.3KB | [311.md](311.md) |
| 312 | list object/cities in area | 1.8KB | [312.md](312.md) |
| 402 | player detail | 9.0KB | [402.md](402.md) |
| 403 | resource detail ? / info-guide? | 796B | [403.md](403.md) |
| 601 | *No server description* | 1.8KB | [601.md](601.md) |
| 603 | city teleport inside kingdom? with 204? | 630B | [603.md](603.md) |

## Authentication and Session

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 203 | account info | 2.0KB | [203.md](203.md) |
| 204 | *No server description* | 688B | [204.md](204.md) |
| 208 | gift ? | 585B | [208.md](208.md) |
| 313 | change kingdom | 1021B | [313.md](313.md) |
| 314 | click on scroll captain ? | 585B | [314.md](314.md) |
| 318 | ping/servertime | 565B | [318.md](318.md) |

## Combat and Troops

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 701 | attack/send caravan/crypt exploration | 1.5KB | [701.md](701.md) |
| 707 | enemy/my troops detail ? | 557B | [707.md](707.md) |
| 10000 | something with attack? march lines? completed building? | 591B | [10000.md](10000.md) |
| 15042 | reinforcement request list | 563B | [15042.md](15042.md) |
| 36004 | in-progress raids list | 575B | [36004.md](36004.md) |
| 300053 | march speed up | 674B | [300053.md](300053.md) |

## Building Repair and Revive

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 804 | repair building/revive wuth gold  | 661B | [804.md](804.md) |
| 805 | revive with sacred pots  | 616B | [805.md](805.md) |

## City and Buildings

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 1001 | open city/bonus chest | 721B | [1001.md](1001.md) |
| 1002 | buy blueprints/speedup | 666B | [1002.md](1002.md) |
| 1003 | troop training | 641B | [1003.md](1003.md) |
| 1004 | complete troop training/equipment | 616B | [1004.md](1004.md) |
| 1005 | speedup troop training/equipment | 639B | [1005.md](1005.md) |
| 1007 | create equipment | 630B | [1007.md](1007.md) |
| 1101 | create building/caravan | 623B | [1101.md](1101.md) |
| 1102 | upgrade building/capitol | 617B | [1102.md](1102.md) |
| 1103 | speedup building/capitol | 627B | [1103.md](1103.md) |
| 1106 | clean terrain inside city, for buildings | 607B | [1106.md](1106.md) |
| 15000 | something with upgrade city | 1.8KB | [15000.md](15000.md) |
| 15009 | help request | 624B | [15009.md](15009.md) |
| 15013 | open chest | 624B | [15013.md](15013.md) |
| 15026 | help all | 628B | [15026.md](15026.md) |
| 15031 | clan history resource sent | 1.8KB | [15031.md](15031.md) |
| 15100 | something with upgrade city | 562B | [15100.md](15100.md) |
| 17001 | pay taxes | 573B | [17001.md](17001.md) |

## Daily Missions and Rewards

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 12002 | start daily mission | 579B | [12002.md](12002.md) |
| 12003 | complete daily mission/achievements | 618B | [12003.md](12003.md) |
| 12005 | speedup daily mission | 585B | [12005.md](12005.md) |
| 12010 | add daily mission | 622B | [12010.md](12010.md) |
| 12011 | update resources from chest | 676B | [12011.md](12011.md) |
| 12013 | collect daily reward chest | 624B | [12013.md](12013.md) |
| 13009 | premium ads | 563B | [13009.md](13009.md) |
| 48003 | advertising | 591B | [48003.md](48003.md) |

## Scrolls and Captains

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 24201 | click on scroll captain ? | 836B | [24201.md](24201.md) |
| 24301 | player flags ? | 606B | [24301.md](24301.md) |
| 24317 | *No server description* | 1.1KB | [24317.md](24317.md) |
| 24318 | *No server description* | 581B | [24318.md](24318.md) |
| 27001 | *No server description* | 572B | [27001.md](27001.md) |
| 30014 | click on scroll captain ? | 637B | [30014.md](30014.md) |

## Mini Games

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 31000 | mini game - stage completed | 585B | [31000.md](31000.md) |
| 31001 | mini game - list levels | 566B | [31001.md](31001.md) |

## Resources and Economy

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 36003 | *No server description* | 560B | [36003.md](36003.md) |
| 37006 | *No server description* | 1.8KB | [37006.md](37006.md) |
| 300052 | add resources | 679B | [300052.md](300052.md) |

## Unknown / Uncategorized

| Opcode | Description | File Size | Doc |
|--------|-------------|-----------|-----|
| 213 | *No server description* | 1.4KB | [213.md](213.md) |
| 316 | *No server description* | 1.3KB | [316.md](316.md) |
| 12006 | *No server description* | 623B | [12006.md](12006.md) |
| 12007 | *No server description* | 572B | [12007.md](12007.md) |
| 13013 | *No server description* | 569B | [13013.md](13013.md) |
| 15200 | *No server description* | 788B | [15200.md](15200.md) |
| 16003 | *No server description* | 1.8KB | [16003.md](16003.md) |
| 24203 | *No server description* | 615B | [24203.md](24203.md) |
| 41000 | click on city ? | 591B | [41000.md](41000.md) |
| 48002 | *No server description* | 578B | [48002.md](48002.md) |
| 61000 | *No server description* | 565B | [61000.md](61000.md) |
