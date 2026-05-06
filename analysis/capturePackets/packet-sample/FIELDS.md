# TotalBattle -- Complete Extractable Fields Reference

> Comprehensive catalog of ALL identifiable data fields from captured TotalBattle protocol packets.
> Based on deep analysis of 69 opcode .dec files, server-side decoders (messagePack.js), and server logic (server-v2.cjs).

---

## Table of Contents

1. [Universal Packet Structure](#1-universal-packet-structure)
2. [Opcode 203 -- Account Login](#2-opcode-203--account-login)
3. [Opcode 213 -- Full Game State Sync](#3-opcode-213--full-game-state-sync)
4. [Opcode 312 -- Map Objects](#4-opcode-312--map-objects)
5. [Opcode 402 -- Player Detail](#5-opcode-402--player-detail)
6. [Opcode 701 -- Attack / March / Caravan](#6-opcode-701--attack--march--caravan)
7. [Opcode 311 -- Tile Data](#7-opcode-311--tile-data)
8. [Opcode 15000 -- Clan Info](#8-opcode-15000--clan-info)
9. [Opcode 15031 -- Clan History](#9-opcode-15031--clan-history)
10. [Opcode 16003 / 37006 -- Leaderboard](#10-opcode-16003--37006--leaderboard)
11. [Opcode 24301 -- Player Flags](#11-opcode-24301--player-flags)
12. [Other Opcodes Summary](#12-other-opcodes-summary)
13. [Token / Auth Pattern](#13-token--auth-pattern)
14. [ID Cross-Reference](#14-id-cross-reference)
15. [Database Schema Recommendations](#15-database-schema-recommendations)
16. [Bot Automation Opportunities](#16-bot-automation-opportunities)
---

## 1. Universal Packet Structure

### Binary Wire Format
```
[4 bytes: total_length (LE uint32)]
[4 bytes: payload_length (LE uint32)]
[MsgPack data...]
```

### Decoded Request: `[header, payload]`
| Path | Type | Description |
|------|------|-------------|
| `req[0][0]` | int | **opcode** -- message type |
| `req[0][1]` | int | **sequence** -- auto-incrementing per session |
| `req[0][2][0]` | array | `[[objectId]]` or `[]` |
| `req[0][2][1]` | bytes[12] | **tokenBuffer** -- session auth token, changes per request |
| `req[0][3]` | string | Always `""` |

### Decoded Response
| Path | Type | Description |
|------|------|-------------|
| `res[0][0]` | int | Echoes request opcode |
| `res[0][1]` | int | Echoes request sequence |

---

## 2. Opcode 203 -- Account Login

**File:** `203.dec` | **Server desc:** `account info` | **Triggers:** On login / re-login
**Significance:** Single richest source of complete player state.

### 2.1 Request (`req[1]`) -- Login Credentials
| Index | Field | Type | Example | Description |
|-------|-------|------|---------|-------------|
| 0 | progressId | array | `["tb:71415620"]` | Stable player ID |
| 2 | authHash | string | `"712fe83e..."` | SHA256 hex (64 chars) |
| 3 | loginMeta | array[28] | -- | Browser/IP/email data |
| 7 | fingerprint | string | `"fpc69f4bbc..."` | Fingerprint cookie |
| 9 | flag | int | `1` | 1 = login |
| 11 | accountInfo | array[2] | `[82811283, 1764862041]` | [id, creationTs] |
| 12 | browserInfo | array[12] | -- | Browser/GPU/screen data |

#### 2.1.1 Login Meta Array (`req[1][3]`, 28 elements)
| Index | Field | Example |
|-------|-------|---------|
| 0 | presentCode | `"present:rm65649016820614116771"` |
| 2 | site | `"site2"` |
| 3 | ipAddress | `"38.250.154.244"` |
| 4 | continent | `"SA"` |
| 5 | country | `"PE"` |
| 10 | language | `"es"` |
| 11 | email | `"ajuegar5+3@outlook.com"` |
| 14 | referrer | `"https://totalbattle.com/es/"` |
| 15 | renderMode | `"webgl"` |
| 16 | browser | `"chrome"` |
| 18 | tokenType | `"auth_token"` |
| 19 | authToken | `"3778265473"` |
| 20 | timestamp | `1777646531` |
| 24 | userAgent | `"Mozilla/5.0 ..."` |
| 25 | fpCookie | `"fpc69f4bbc21eb8d9.35789590"` |
| 27 | isMobile | `false` |

#### 2.1.2 Browser Info (`req[1][12]`, 12 elements)
| Index | Field | Example |
|-------|-------|---------|
| 0 | browserName | `"Chrome 146.0.0.0"` |
| 1 | osName | `"Windows 10"` |
| 2 | engine | `"Chrome"` |
| 3 | screenRes | `[1360, 1024]` |
| 4 | dpr | `96` (pixel ratio x100) |
| 6 | sysLang | `"ES"` |
| 7 | tzOffset | `-18000` (seconds) |
| 8 | gpuTexSize | `16384` |
| 9 | gpuTexUnits | `1023` |
| 10 | gpuRenderer | `"OpenGL ES 3.0 (WebGL 2.0)"` |

### 2.2 Response (`res[1]`) -- Account Data
| Index | Field | Type | Description |
|-------|-------|------|-------------|
| 0 | objectId | array | `[1215476012623]` |
| 1 | statusCode | int | 0 = success |
| 2 | newToken | bytes[12] | New auth token |
| 4 | serverTime | int | Server timestamp |
| 5 | hash | string | SHA256 verification hash |
| 6 | accountData | array[8] | Nested account data (see 2.2.1) |
| 7 | profile | array[25] | Player profile (see 2.2.2) |
| 8 | counter | int | Some counter/level |
| 11 | featureFlagsV1 | map | ~60 boolean keys (5-58, 30000-60002) |
| 12 | featureFlagsV2 | map | ~120 boolean keys (11-87, 10000-70000) |
| 13 | serverState | array[3] | `[timestamp, 1, false]` |
| 14 | hash2 | string | Second verification hash |
| 16 | jwtToken | string | JWT string |

#### 2.2.1 Account Data (`res[1][6]`) -- 8 nested elements
**`[6][1]` -- Account Metadata (16 elements):**
| Index | Field | Example |
|-------|-------|---------|
| [0][0] | progressId | `"tb:71415620"` |
| [1] | accountType | `1` |
| [2] | accountCreated | `1764862043` |
| [3] | kingdom | `283` |
| [4] | site | `"site2"` |
| [5] | referralSource | `"organic"` |
| [6] | presentCode | `"present:gold"` |
| [7] | serverIP | `"38.250.154.193"` |
| [8] | continent | `"SA"` |
| [9] | country | `"PE"` |
| [14][0] | email | `"ajuegar5+3@outlook.com"` |

**`[6][2]` -- Session Info (25 elements):**
| Index | Field | Example |
|-------|-------|---------|
| [0] | playerName | `"Elrond"` |
| [1][0] | clanId | `1215475744968` (0=none) |
| [2] | lastLoginIP | `"38.250.154.244"` |
| [3] | sessionExpiry | `1777648253` |
| [4] | loginTimestamp | `1777646548` |
| [5] | site | `"site2"` |
| [9] | language | `"es"` |
| [13] | loginCount | `617` (increments each login) |
| [15] | email | `"ajuegar5+3@outlook.com"` |
| [17] | userAgent | `"Mozilla/5.0 ..."` |
| [18] | persistentId | `82811283` |
| [23] | fbPixel | `"fb.1.1777646532672..."` |
| [24] | accountCreated | `1764862041` |

**`[6][3]` -- Player Settings (key-value map):**
| Key | Value Type | Example |
|-----|------------|---------|
| `heroes_levels` | JSON string | `"{\"1\":7, \"3\":7, \"2\":7, \"5\":6, \"18\":1}"` |
| `help_showed` | comma-separated | `"18_PVE_Mobs,18_empty_point_on_map,24_Academy,..."` |
| `flag_tutor` | string/int | `"1"` |
| `marches_9` | string/int | `"1"` |
| `mobile_clicks` | string/int | `"100"` |
| `monster_lvl_5` | string/int | `"1"` |
| `play_music_and_sounds` | string/int | `"1"` |
| `tutor_finished` | string/int | `"1"` |
| `deny_subscribe_to_newsletter` | string/int | `"3"` |
| `first_login_count_s2s` | string/int | `"3"` |
| `newsletter_show_window_last_time` | timestamp | `"1771527438"` |
| `show_crypt_stage_feature_tutor` | string/int | `"1"` |
| `show_mini_games_tutorial_arrow` | string/int | `"1"` |
| `valor_Monster1000` | string/int | `"1"` |
| 20+ more keys | ... | ... |

**`[6][7]` -- Pending Notifications:**
Map of objectId to `[[objectId], timestamp]`

#### 2.2.2 Player Profile (`res[1][7]`, 25 elements)
| Index | Field | Type | Example |
|-------|-------|------|---------|
| 0 | objectId | array | `[1215476012623]` |
| 1 | progressId | string | `"tb:71415620"` |
| 2 | playerName | string | `"Elrond"` |
| 3 | country | string | `"PE"` |
| 4 | heroTypeId | int | `12` |
| 7 | heroLevel | int | `7` |
| 8 | cityLevel | int | `10` |
| 10 | might | int | `8701` |
| 11 | clanId | array | `[1215475744968]` |
| 12 | clanInternalId | int | `1645832` |
| 13 | clanName | string | `"WLF"` |
| 15 | coords | array[3] | `[283, 202, 658]` [kingdom, x, y] |
| 16 | objectId2 | array | `[1215524141642]` |
| 17 | gold | int | `102` |

#### 2.2.3 Feature Flags
- **`res[1][11]`** (v1): ~60 boolean entries, keys 5-58, 30000-60002
  - `false` entries: 11, 12, 35, 40000
- **`res[1][12]`** (v2): ~120 boolean entries, keys 11-87, 10000-70000
  - `false` entries: 11, 31, 41, 40005, 50002, 50003, 50005, 75
- Likely represent building/feature unlocks, tutorial completion, game mode availability |

---

## 3. Opcode 213 -- Full Game State Sync

**File:** `213.dec` | **Size:** 492KB (largest packet) | **Triggers:** After login (203)
**Significance:** Complete game state snapshot -- resources, troops, commanders, buildings, buffs, achievements, tasks, timers.

### 3.1 Main Game State (`res[1][0][0]`)
| Index | Content | Description |
|-------|---------|-------------|
| 0 | objectId | Player object ID `[1215524141642]` |
| 1 | marchState[25] | Current march state (coords, timestamps, clans, ETAs) |
| 2 | empty | `[0,0,"",0,0,0,0,0,0]` |
| 3 | marchInfo | `[marchSlotCount, flags, 0, 0]` e.g. `[9,1,0,0]` |
| 5 | **resources** | Resource balances map (see 3.2) |
| 9 | **marchSlots** | Array of 5 troop/march slots (see 3.3) |
| 10 | **commanders** | Array of 4 commanders (see 3.4) |
| 12 | **buildings** | Map of 24 buildings (see 3.5) |
| 13 | buildingUpgrades | Upgrade status map |
| 14 | lootRewards | Array of `[itemId, qty, tier]` (30+ entries) |
| 16 | **activeTimers** | `[[timerId, 0, start, end], ...]` (see 3.6) |
| 17 | **buffs** | Map of buffId -> `[buffId, qty]` (see 3.7) |
| 19 | notifications | Pending notifications |
| 22 | counter1 | int (2021) |
| 23 | counter2 | int (4059) |
| 24 | token | 12-byte token buffer |
| 25 | counter3 | int (2966) |
| 27 | **achievements** | Achievement progress (see 3.8) |
| 30 | **tasks** | Daily task progress (see 3.9) |
| 35 | timestamp | int |

### 3.2 Resource Balances (`res[1][0][0][5]`)
Format: `{"resourceId": [resourceId, amount], ...}` (200+ entries)

| ID | Example | Likely Type |
|----|---------|-------------|
| 1 | 21,789 | Food |
| 2 | 4,678,105 | Wood |
| 3 | 162,322 | Stone |
| 4 | 640,190 | Iron |
| 5 | 759,293 | Silver/Gold |
| 6 | 268,819 | Resource 6 |
| 7 | 810 | Resource 7 |
| 8 | 19,747 | Resource 8 |
| 9 | 877 | Resource 9 |
| 13 | 25,627 | Resource 13 |
| 14 | 956 | Resource 14 |
| 16 | 235 | Resource 16 |
| 30 | 8,645 | Resource 30 |
| 32 | 863 | Resource 32 |
| 34 | 2,556 | Resource 34 |
| 35 | 10,996 | Resource 35 |
| 55 | 100 | Special resource |
| 68 | 1,750 | Special resource |
| 125 | 17 | Rare resource |
| 126 | 5 | Rare resource |
| 500-550 | 1-6 | Items/consumables |
| 1045-1338 | 1-17 | Equipment blueprints |
| 1504-1598 | 1-19 | Building materials |
| 2001-2106 | 1-112 | Troop items |
| 41600 | 3,885 | Premium currency |
| 41606 | 120 | Premium currency |
| 601005 | 17,185 | High-tier currency |
| 700021-702036 | 1-30 | Commander/scroll items |

### 3.3 March Slots (`res[1][0][0][9]`)
5 troop slots observed:

| Slot | Category | Type | Troop IDs | Total Count | Speed Class |
|------|----------|------|-----------|-------------|-------------|
| 1 | 1 | Infantry | 17-22 | 57,152 | 7 |
| 2 | 2 | Ranged | 33-38 | 24,791 | 7 |
| 3 | 3 | Cavalry | 49-54 | 27,166 | 7 |
| 5 | 5 | Siege | 81-86 | 18,943 | 6 |
| 18 | 18 | Special | 289-294 | 0 | 1 |

Each slot (20 elements):
`[slotNum, unk, targetType, [ownerId], flag, 0,0,0,0, totalCount, speedClass, 0, [troops], 0, [formations], [unk,type], timestamp, 0, 0, []]`

**Troop composition** (`[category, troopTypeId, specialId, health%]`):
- `specialId` = 0 for regular troops, string for commanders (e.g. `"79657418409671867"`) |
- `health%` = 100 means full health |

**Formations** (`[formationId, count, commanderInfo[6]]`):
- Commander info: `[0,0,0,commanderId,0,0]` for active commander, all zeros otherwise |

### 3.4 Commanders (`res[1][0][0][10]`)
`[commanderId, marchSpeed, [ownerObjId], 1000, 0, level, 0, 0, [], unk]`

| commanderId | marchSpeed | level | unk |
|-------------|------------|-------|-----|
| 79657418409671867 | 4000 | 25 | 16 |
| 79657418409671873 | 4008 | 30 | 0 |
| 79657418409671876 | 4216 | 30 | 0 |
| 79657418409671877 | 4100 | 30 | 0 |

### 3.5 Buildings (`res[1][0][0][12]`)
Map of 24 buildings (IDs 1-24):
`{"buildingId": [id, level, unk, 0, 0, staticId, unk2, 0], ...}`

| Building ID | Level | Static ID | unk2 |
|-------------|-------|-----------|------|
| 1 | 15 | 26 | 7 |
| 2 | 6 | 36 | 22 |
| 3 | 9 | 27 | 22 |
| 4 | 17 | 17 | 23 |
| 5 | 16 | 24 | 43 |
| 6 | 18 | 46 | 21 |
| ... | ... | ... | ... |
| 24 | 10 | 19 | 28 |

### 3.6 Active Timers (`res[1][0][0][16]`)
`[[timerId, 0, startTime, endTime], ...]`

| Timer ID | Start | End | Duration |
|----------|-------|-----|----------|
| 10202 | 1777642243 | 1778000401 | ~358158s (~4 days) |
| 50100 | 1777687660 | 1777774060 | 86400s (24hr) |
| 50101 | 1777687647 | 1777774047 | 86400s (24hr) |
| 50102 | 1777668495 | 1777754895 | 86400s (24hr) |

### 3.7 Buffs/Boosts (`res[1][0][0][17]`)
Map: `{"buffId": [buffId, quantity], ...}`

| Buff ID | Qty | Likely Category |
|---------|-----|----------------|
| 130 | 1 | Basic buff |
| 1000 | 1 | Basic buff |
| 1197-1200 | 1 | Building buffs |
| 1400 | 1 | Buff |
| 1418 | 2 | Buff |
| 1498-1501 | 1 | Buffs |
| 1800, 1900 | 1 | Buffs |
| 25000-25010 | 1-8 | Speed boosts |
| 10000001 | 1 | Special buff |

### 3.8 Achievements (`res[1][0][0][27]`)
Array of `[[achievementId], value]` or `[[category, subId], value]`
Hundreds of entries tracking progress across all achievement categories.
Nested sub-achievements for categories 71-1007.

### 3.9 Tasks (`res[1][0][0][30]`)
Array of `[taskId, progress, completed]` or `[taskId, category, subId, completed]`
Tracks daily/ongoing task progress.

### 3.10 Active Buffs List (`res[1][1]`)
Array of timed buffs: `[buffId, startTime, 0, 0, startTime, duration, endTime, 0, 0, [], 0, 0, [source], []]`
100+ entries with durations of 3600s (1hr), 1200s (20min), etc.
Common buff IDs: 11150-11526, 12361-12368, 13500+, 20000+.
Source types: `[12]` (common), `[20]`, `[4]`, `[3]`.

---

## 4. Opcode 312 -- Map Objects

**File:** `312.dec` | **Size:** 475KB | **Server desc:** `list object/cities in area`
Decoded by server `scanPacket312()` function. Contains Obj12 (buildings) and Obj42 (map players).

### 4.1 Obj12 -- Buildings (from `_extractObj12Data()` in messagePack.js)
```
[[objectId], staticId, 0, 2, 0, level, 0, 0, [kingdom, x, y], [0], timestamp, isUnlocked]
```

| Field | Path | Type | Example | Description |
|-------|------|------|---------|-------------|
| objectId | `msg[0][0]` | int64 | `1189808496191` | Map object ID |
| staticId | `msg[1]` | int | `1590` | Building type (400=crypt?) |
| unk2 | `msg[2]` | int | `0` | -- |
| unk3 | `msg[3]` | int | `2` | -- |
| unk4 | `msg[4]` | int | `0` | -- |
| level | `msg[5]` | int | `1` | Building level |
| unk6 | `msg[6]` | int | `0` | -- |
| unk7 | `msg[7]` | int | `0` | -- |
| kingdom | `msg[8][0]` | int | `277` | Kingdom |
| x | `msg[8][1]` | int | `418` | Map X |
| y | `msg[8][2]` | int | `82` | Map Y |
| unk9 | `msg[9][0]` | int | `0` | -- |
| timestamp | `msg[10]` | int | `1776856789` | Last updated |
| isUnlocked | `msg[11]` | bool | `false` | Visible on map |

### 4.2 Obj42 -- Map Players (from `_extractObj42Data()` in messagePack.js)
42-element array containing player city data on the map.

| Field | Path | Type | Description |
|-------|------|------|-------------|
| objectId | `msg[0][0]` | int64 | Player object ID |
| playerId | `msg[2][0]` | int64 | Player ID |
| staticId | `msg[3]` | int | Player type/class |
| clanId | `msg[4][0]` | int64 | Clan ID (0=none) |
| unk5 | `msg[5]` | int | 0 |
| unk6 | `msg[6]` | int | Variable (32583) |
| kingdom | `msg[7]` | int | Kingdom |
| unk8-12 | `msg[8-12]` | int | All zeros |
| cityLevel | `msg[13]` | int | City level (e.g. 29) |
| unk14 | `msg[14]` | int | 9 |
| unk15-16 | `msg[15-16]` | int | Zeros |
| sourceKingdom | `msg[17][0]` | int | March source kingdom |
| sourceX | `msg[17][1]` | int | March source X |
| sourceY | `msg[17][2]` | int | March source Y |
| targetKingdom | `msg[18][0]` | int | March target kingdom |
| targetX | `msg[18][1]` | int | March target X |
| targetY | `msg[18][2]` | int | March target Y |
| unk19-25 | `msg[19-25]` | -- | Zeros/empty arrays |
| unk26 | `msg[26]` | array[4] | `[0,0,0,0]` |
| unk27-38 | `msg[27-38]` | -- | Various zeros/arrays |
| hasShield | `msg[39]` | bool | Peace shield active |
| timestamp | `msg[40]` | int | Last updated |
| unk41 | `msg[41]` | null | -- |

**Key insight:** If source coords != target coords, the player is currently marching/attacking.

---

## 5. Opcode 402 -- Player Detail

**Server desc:** `player detail`
Contains Obj23 structures decoded by `scanPacket402()` / `_extractObj23Data()`.`

### 5.1 Obj23 -- Player Object (23 elements)
| Field | Path | Type | Description |
|-------|------|------|-------------|
| objectId | `msg[16][0]` | int64 | Player object ID |
| playerId | `msg[0][0]` | int64 | Player ID |
| progressId | `msg[1]` | string | `"tb:{N}"` |
| playerName | `msg[2]` | string | Display name |
| country | `msg[3]` | string | Country code |
| heroType | `msg[4]` | int | 2=Alrick, 3=Thaddeus |
| unk5 | `msg[5]` | -- | -- |
| unk6 | `msg[6]` | -- | -- |
| heroLevel | `msg[7]` | int | Hero level |
| cityLevel | `msg[8]` | int | City level |
| unk9 | `msg[9]` | -- | -- |
| might | `msg[10]` | int | Power score |
| clanId | `msg[11][0]` | int64 | Clan ID |
| unk12 | `msg[12]` | -- | -- |
| clanName | `msg[13]` | string | Clan name |
| unk14 | `msg[14]` | -- | -- |
| kingdom | `msg[15][0]` | int | Kingdom |
| x | `msg[15][1]` | int | Map X |
| y | `msg[15][2]` | int | Map Y |
| gold | `msg[17]` | int | Gold amount |
| unk18 | `msg[18]` | -- | -- |
| unk19-20 | `msg[19-20]` | array | Empty arrays |
| timezone | `msg[21]` | string | `"(UTC-50-30)"` |
| unk22 | `msg[22]` | array | `[0]` |

---

## 6. Opcode 701 -- Attack / March / Caravan

**File:** `701.dec` | **Server desc:** `attack/send caravan/crypt exploration`

### 6.1 Request (`req[1]`, 16 elements)
| Index | Field | Example | Description |
|-------|-------|---------|-------------|
| 0 | targetType | `12` | 12=city, others=tile/crypt |
| 1 | flag | `1` | -- |
| 2-3 | zeros | `0, 0` | -- |
| 4 | sourceObjId | `[1215524141642]` | Sender city |
| 5 | targetObjId | `[1215524141642]` | Target |
| 6 | coords | `[283, 733, 323]` | [kingdom, x, y] |
| 7 | null | `null` | -- |
| 8 | troopType | `[1]` | Troop filter (1=infantry) |
| 9 | maxTroops | `50000` | Max troops to send |
| 10 | null | `null` | -- |
| 11 | zero | `0` | -- |
| 12 | empty | `[]` | -- |
| 13 | zero | `0` | -- |
| 14 | resources | `{"55": 1}` | Resources to carry (caravan) |
| 15 | empty | `[]` | -- |

### 6.2 Response Key Fields
| Path | Content | Description |
|------|---------|-------------|
| `res[1][0][1][0]` | marchObjId | `[1215576629583]` new march ID |
| `res[1][0][1][1]` | marchDetails[27] | Coords, timestamps, kingdoms, ETAs |
| `res[1][0][1][2]` | params | `[12, 12, "", 1, 0, 50000, 0, 0, 64]` |
| `res[1][0][1][5]` | resources | `{"55": [55, 1]}` |
| `res[1][0][1][9][0]` | troopSlot[20] | Full troop slot data |
| `res[1][0][1][9][0][9]` | troopCount | `55194` |
| `res[1][0][1][9][0][10]` | speedClass | `7` |
| `res[1][0][1][9][0][12]` | troops[] | `[[cat, type, specialId, health%], ...]` |
| `res[1][0][1][9][0][14]` | formations[] | `[[formationId, count, cmdInfo], ...]` |
| `res[1][0][1][9][0][16]` | timestamp | `1764862073` |
| `res[1][0][1][10][0]` | commander | `[cmdId, speed, [owner], 1000, 0, level, ...]` |
| `res[1][0][1][14]` | loot[] | `[[itemId, qty, tier], ...]` (30+ entries) |
| `res[1][0][1][16]` | timers[] | `[[timerId, 0, start, end], ...]` |

### 6.3 Troop Categories
| Category | Type | Troop IDs | Example Count |
|----------|------|-----------|----------------|
| 1 | Infantry | 17-22 | 57,152 |
| 2 | Ranged | 33-38 | 24,791 |
| 3 | Cavalry | 49-54 | 27,166 |
| 5 | Siege | 81-86 | 18,943 |
| 18 | Special | 289-294 | 0 |

**Note:** One troop entry has a string `specialId` instead of `0` -- this is the commander unit:
`[1, 20, "79657418409671867", 100]`

---

## 7. Opcode 311 -- Tile Data

**Server desc:** `something with tiles`

### 7.1 Request
`[[734, 784, 834, 884, 934, 984, 985, 986, 987]]` -- Y-coordinates of tile rows to fetch

### 7.2 Response
341KB of tile data for requested Y-coordinates.
Each tile likely contains: type, resource, level, defense value.

---

## 8. Opcode 15000 -- Clan Info

**Size:** 305KB | Contains:
- Clan description (English text)
- Member list (200+ members in large clans)
- Per-member numeric arrays (rank, might, contribution)
- Clan rules
- Reset schedules

---

## 9. Opcode 15031 -- Clan History

**Server desc:** `clan history resource sent` | **Size:** 298KB
**Request:** `[[clanId], 0]`
**Response:** Timestamped clan events (resources, joins/leaves, wars, donations)

---

## 10. Opcode 16003 / 37006 -- Leaderboard

### 16003
| Field | Path | Description |
|-------|------|-------------|
| rankType | `res[1][0]` | int (`3` = ranking category) |
| timestamp | `res[1][1]` | Last update |
| rankedPlayers | `res[1][2]` | `[[[objectId], rank, timestamp], ...]` (1000+) |
| orderedIds | `res[1][3]` | `[[objectId], ...]` in rank order |
| scores | `res[1][4]` | `[[[objectId], score], ...]` (up to 106 billion) |

### 37006
- 200KB, similar ranking structure but different type |

---

## 11. Opcode 24301 -- Player Flags

**Server desc:** `player flags ?`
**Response:** `[{"objectId": [flagLevel, timestamp], ...}]`
Decoded by `scanPacket24301()` in messagePack.js.

Example: `
  "1198295910531": [19, 1777835062]
  "1198295959826": [30, 1777835062]`

---

## 12. Other Opcodes Summary

| Opcode | Server Description | Key Fields |
|--------|-------------------|------------|
| 10000 | attack? march lines? completed building? | Notifications on march/building events |
| 313 | change kingdom | Teleport within kingdom |
| 707 | enemy/my troops detail ? | Troop composition detail |
| 1001 | open city/bonus chest | Chest opening |
| 1002 | buy blueprints/speedup | Item purchase |
| 1003 | troop training | Start training |
| 1004 | complete troop training/equipment | Finish training |
| 1005 | speedup troop training/equipment | Apply speedup |
| 1007 | create equipment | Forge equipment |
| 1101 | create building/caravan | Start construction |
| 1102 | upgrade building/capitol | Upgrade building |
| 1103 | speedup building/capitol | Speed up construction |
| 1106 | clean terrain inside city | Clear terrain |
| 12002 | start daily mission | Begin mission |
| 12003 | complete daily mission/achievements | Complete mission |
| 12005 | speedup daily mission | Apply speedup |
| 12010 | add daily mission | Refresh missions |
| 12011 | update resources from chest | Collect chest |
| 12012 | complete daily task | Complete task |
| 12013 | collect daily reward chest | Claim reward |
| 15042 | reinforcement request list | Incoming requests |
| 36004 | in-progress raids list | Active raids |
| 300053 | march speed up | Accelerate march |
| 300052 | add resources | Add resources from items |
| 17001 | pay taxes | Clan/kingdom taxes |
| 15100 | something with upgrade city | City upgrade |
| 15009 | help request | Help system |
| 15026 | help all | Help all pending |
| 15013 | open chest | Open chest |
| 804 | repair building/revive with gold | Gold repair |
| 805 | revive with sacred pots | Sacred pot revive |
| 31000 | mini game - stage completed | Report completion |
| 31001 | mini game - list levels | Get levels |
| 314/24201/30014 | click on scroll captain ? | Captain interaction |
| 13009/48003 | premium ads / advertising | Ad watching |
| 41000 | click on city ? | City click detail |
| 14003 | clan wealth detail | Clan wealth info |
| 403 | resource detail ? / info-guide? | Resource rates |
| 318 | ping/servertime | Ping |
| 208 | gift ? | Gift |
| 204/603 | teleport | City teleport |
| 24 | click on clan button | Clan UI |
| 2 | click on clan button/claim chest | Clan chest |

### Uncategorized (no server description)
316, 24317, 24318, 27001, 12006, 12007, 13013, 15200, 48002, 61000

### Newly discovered from server-v2.cjs
801: `repair building status ?/temple troops revive`
14003: `clan wealth detail`
12012: `complete daily task`
27002: `something with scroll captain ?`

---

## 13. Token / Auth Pattern

### 13.1 12-byte Token Buffer (`req[0][2][1]`)
- **Bytes 0-1:** Constant prefix (`105, 244` or `105, 247` or `105, 242` or `105, 246` or `105, 245`)
- **Bytes 2-10:** Session-derived data
- **Byte 11:** Incrementing counter (changes per request)

### 13.2 JWT Structure (from `res[1][16]` of opcode 203)
```
Header: {"typ":"JWT","kid":"keyid","alg":"HS256"}
Payload: {"aud":"Journal","exp":<expiry>,"name":"<objectId>","role":"Player"}
```

### 13.3 Auth Flow
1. Login (203) -> get JWT + tokenBuffer
2. Use tokenBuffer in subsequent requests (byte 11 increments)
3. Re-login when JWT expires (check `exp` field)

---

## 14. ID Cross-Reference

| ID Type | Format | Example | Stable? | Used In |
|---------|--------|---------|---------|---------|
| progressId | `tb:{N}` | `tb:71415620` | YES | 203, 213, 312, 402 |
| objectId | int64 (~1.215e12) | `1215476012623` | NO (relogin) | 203, 213, 312, 402, 701 |
| clanId | int64 (~1.215e12) | `1215475744968` | NO (relogin) | 203, 213, 312, 402, 15000 |
| commanderId | string (large int) | `"79657418409671867"` | YES | 213, 701 |
| marchObjId | int64 | `1215576629583` | NO (per-march) | 701, 10000 |
| kingdom | int | `283` | YES | 203, 213, 312, 311 |
| staticId (building) | int | `1590, 400` | YES | 312 |
| troop type | int | `17-22, 33-38, 49-54, 81-86` | YES | 213, 701 |
| resource type | int | `1-9, 13-16, 30-35, 55, 68...` | YES | 213 |

---

## 15. Database Schema Recommendations

### 15.1 Core Tables
```sql
-- Player master record (updated from opcode 203, 402)
CREATE TABLE players (
  progress_id VARCHAR(50) PRIMARY KEY,
  object_id BIGINT,
  player_name VARCHAR(100),
  country VARCHAR(2),
  hero_type_id INT,
  hero_level INT,
  city_level INT,
  might BIGINT,
  clan_id BIGINT,
  clan_name VARCHAR(100),
  kingdom INT, coord_x INT, coord_y INT,
  gold INT, account_created_at TIMESTAMP,
  login_count INT, email VARCHAR(255),
  jwt_token TEXT, hero_levels JSON,
  tutorial_flags TEXT,
  feature_flags_v1 JSON, feature_flags_v2 JSON,
  last_ip VARCHAR(45), user_agent TEXT,
  fingerprint VARCHAR(100), language VARCHAR(5),
  timezone VARCHAR(50), site VARCHAR(20),
  referral_source VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Resource balances (updated from opcode 213)
CREATE TABLE player_resources (
  progress_id VARCHAR(50),
  resource_type_id INT,
  amount BIGINT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (progress_id, resource_type_id)
);

-- Map buildings Obj12 (updated from opcode 312)
CREATE TABLE map_objects (
  object_id BIGINT PRIMARY KEY,
  static_id INT, level INT,
  kingdom INT, x INT, y INT,
  updated_at TIMESTAMP, is_unlocked BOOLEAN,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_location (kingdom, x, y)
);

-- Map players Obj42 (updated from opcode 312)
CREATE TABLE map_players (
  object_id BIGINT PRIMARY KEY,
  player_id BIGINT, static_id INT,
  clan_id BIGINT, kingdom INT, city_level INT,
  source_kingdom INT, source_x INT, source_y INT,
  target_kingdom INT, target_x INT, target_y INT,
  has_shield BOOLEAN, updated_at TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_marching (target_kingdom, target_x, target_y)
);

-- Marches (updated from opcode 701, 10000)
CREATE TABLE marches (
  march_id BIGINT PRIMARY KEY,
  source_object_id BIGINT, target_object_id BIGINT,
  march_type INT, target_type INT,
  source_kingdom INT, source_x INT, source_y INT,
  target_kingdom INT, target_x INT, target_y INT,
  commander_id VARCHAR(50), march_speed INT,
  city_level INT, created_at TIMESTAMP,
  eta TIMESTAMP, status VARCHAR(20) DEFAULT 'active'
);

-- March troops
CREATE TABLE march_troops (
  march_id BIGINT, category INT,
  troop_type_id INT, special_id VARCHAR(50),
  health_pct INT, count INT,
  PRIMARY KEY (march_id, category, troop_type_id)
);

-- Commanders (from opcode 213, 701)
CREATE TABLE commanders (
  commander_id VARCHAR(50) PRIMARY KEY,
  owner_id VARCHAR(50), march_speed INT,
  level INT
);

-- Player buildings (from opcode 213)
CREATE TABLE player_buildings (
  player_id VARCHAR(50), building_id INT,
  level INT, static_id INT,
  updated_at TIMESTAMP,
  PRIMARY KEY (player_id, building_id)
);

-- Active timers (from opcode 213, 701)
CREATE TABLE active_timers (
  player_id VARCHAR(50), timer_id INT,
  start_time TIMESTAMP, end_time TIMESTAMP,
  PRIMARY KEY (player_id, timer_id)
);

-- Buffs (from opcode 213)
CREATE TABLE player_buffs (
  player_id VARCHAR(50), buff_id INT,
  quantity INT, PRIMARY KEY (player_id, buff_id)
);

-- Achievements (from opcode 213)
CREATE TABLE player_achievements (
  player_id VARCHAR(50), achievement_id INT,
  sub_id INT, progress BIGINT,
  PRIMARY KEY (player_id, achievement_id, sub_id)
);

-- Tasks (from opcode 213)
CREATE TABLE player_tasks (
  player_id VARCHAR(50), task_id INT,
  category INT, sub_id INT,
  progress INT, completed BOOLEAN,
  PRIMARY KEY (player_id, task_id, sub_id)
);

-- Clans (from opcode 15000)
CREATE TABLE clans (
  clan_id BIGINT PRIMARY KEY,
  clan_name VARCHAR(100), description TEXT,
  rules TEXT, member_count INT,
  total_might BIGINT, reset_schedule VARCHAR(50),
  updated_at TIMESTAMP
);

-- Clan members
CREATE TABLE clan_members (
  clan_id BIGINT, player_id VARCHAR(50),
  player_name VARCHAR(100), rank INT,
  might BIGINT, joined_at TIMESTAMP,
  PRIMARY KEY (clan_id, player_id)
);

-- Clan events (from opcode 15031)
CREATE TABLE clan_events (
  clan_id BIGINT, event_type INT,
  event_timestamp TIMESTAMP,
  player_id VARCHAR(50), details JSON,
  PRIMARY KEY (clan_id, event_timestamp, player_id)
);

-- Leaderboard (from opcode 16003, 37006)
CREATE TABLE leaderboard (
  rank_type INT, player_object_id BIGINT,
  rank INT, score BIGINT,
  updated_at TIMESTAMP,
  PRIMARY KEY (rank_type, player_object_id)
);

-- Map tiles (from opcode 311)
CREATE TABLE map_tiles (
  kingdom INT, x INT, y INT,
  tile_type INT, resource_type INT,
  level INT, defense_value INT,
  last_updated TIMESTAMP,
  PRIMARY KEY (kingdom, x, y)
);
```

---

## 16. Bot Automation Opportunities

### 16.1 Complete Login Flow

```
Step 1: POST /api/auth (or equivalent) -> Receive JWT (HS256)
Step 2: Send opcode 203 with token derived from JWT -> Receive account metadata, feature flags, GPU fingerprint
Step 3: Send opcode 213 with objectId -> Receive full game state (492KB snapshot)
Step 4: Send opcode 312 with coords -> Receive map objects (buildings + nearby players)
Step 5: Repeat opcode 312 to expand map coverage
Step 6: Send opcode 402 for specific players -> Get detailed player profiles
Step 7: Send opcode 311 for tile details -> Get resource tile info
Step 8: Send opcode 15000 for clan data -> Get clan membership, rules, might
Step 9: Send opcode 16003 / 37006 for leaderboards -> Get ranked players
Step 10: Poll opcode 213 periodically for state deltas -> Track changes
```

### 16.2 High-Value Automated Actions

| Action | Required Opcodes | Data Source | Notes |
|--------|-----------------|-------------|-------|
| **Target Selection** | 312, 402, 16003 | Obj42 marching players, Obj23 might/coords | Filter by shield status, might range, distance |
| **Resource Farming** | 312, 311 | Obj12 unguarded buildings, tile resource_type | Identify undefended high-level resource tiles |
| **March Timing** | 701, 213 | March slots, troop composition, ETA | Maximize 5 march slots, stagger departures |
| **Building Optimization** | 213 (buildings + timers) | `res[1][0][5]` building levels | Queue upgrades in optimal order |
| **Clan Intelligence** | 15000, 15031 | Member list, clan events, might rankings | Track rival clan activity, war timing |
| **Achievement Hunting** | 213 (achievements + tasks) | `res[1][0][13]` progress, `res[1][0][14]` task status | Identify near-complete achievements for fast XP |
| **Leaderboard Tracking** | 16003, 37006 | Rank entries with scores | Monitor player rank changes over time |

### 16.3 Anti-Detection Considerations

| Vector | Risk | Mitigation |
|--------|------|------------|
| **Request Timing** | High | Randomize intervals between opcodes (2-8s); mimic human pacing |
| **Token Generation** | Critical | The 12-byte tokenBuffer changes per request; must derive correctly from JWT or risk immediate ban |
| **GPU Fingerprint** | Medium | Opcode 203 sends full browser GPU info; consider spoofing if running headless |
| **Coordinate Scanning** | Medium | Opcode 312 scans reveal map exploration patterns; spread scans across time |
| **Sequence Number** | Low | `req[0][1]` increments per session; must be sequential and consistent |
| **ObjectId Changes** | Low | `objectId` changes on relogin; must fetch fresh value via opcode 213 after each login |
| **Request Payload** | Medium | `req[0][2][0]` contains [[objectId]]; must match current session |

### 16.4 State Tracking Strategy

```
1. After login (opcode 203), cache: jwt, progressId, sessionSettings, featureFlags
2. After game state sync (opcode 213), cache: resources, buildings, timers, marches, achievements
3. On each map scan (opcode 312), store: Obj12 buildings, Obj42 players with march state
4. On player detail (opcode 402), update: Obj23 profiles in database
5. Poll opcode 213 every N minutes for: resource deltas, new timers, march completions
6. Cross-reference with opcode 15031 (clan history) for: resource sent/received logs
```

---

## Appendix A: Resource / Item Type IDs

> Extracted from opcode 213 resource balances (`res[1][0][3]`).
> Format: `[id, quantity]`. Values are sorted by observed ID ranges.

### Core Resources (IDs 1-99)
| ID | Inferred Type | Sample Qty | Notes |
|----|--------------|------------|-------|
| 1 | Gold/Coin | 21,789 | Primary currency |
| 2 | Wood | 4,678,105 | Basic resource |
| 3 | Stone/Ore | 162,322 | Basic resource |
| 4 | Food | 640,190 | Basic resource |
| 5 | Iron | 759,293 | Basic resource |
| 6 | Silver | 268,819 | Secondary currency |
| 7 | Gems | 810 | Premium currency (low qty) |
| 8 | Knowledge Points | 19,747 | XP / research currency |
| 9 | Honor | 877 | PvP / clan currency |
| 13 | Unknown Resource | 25,627 | -- |
| 14 | Unknown Resource | 956 | -- |
| 16 | Unknown Resource | 235 | -- |
| 30 | Unknown Resource | 8,645 | -- |
| 32 | Unknown Resource | 863 | -- |
| 34 | Unknown Resource | 2,556 | -- |
| 35 | Unknown Resource | 10,996 | -- |
| 55 | Energy/Stamina | 100 | Capped resource |
| 68 | Unknown Resource | 1,750 | -- |
| 125 | Unknown Resource | 17 | Rare item |
| 126 | Unknown Resource | 5 | Rare item |

### Speedups and Boosts (IDs 500-599)
| ID Range | Inferred Type | Notes |
|----------|--------------|-------|
| 500-509 | Building Speedups | Various tiers (1min, 5min, 15min, 1hr, etc.) |
| 512-520 | Research Speedups | Various tiers |
| 523-538 | Training Speedups | Various tiers |
| 540-549 | March/Heal Speedups | Various tiers |
| 551 | Unknown Boost | Single qty |
| 564 | Unknown Boost | Single qty |

### Special Items (IDs 1000-1999)
| ID Range | Inferred Type | Notes |
|----------|--------------|-------|
| 1045-1046 | Equipment/Blueprints | Low qty (1-2) |
| 1080 | Equipment/Blueprints | Qty 2 |
| 1100-1127 | Commander Shards | Various commanders (qty 1-17) |
| 1140, 1146 | Special Items | Qty 1 |
| 1152, 1154 | Special Items | Qty 1-3 |
| 1205 | Special Item | Qty 1 |
| 1301-1338 | Equipment/Artifacts | Various tiers (qty 1-8) |
| 1382 | Special Item | Qty 1 |
| 1504-1598 | Equipment/Materials | Various tiers (qty 1-19) |
| 1600-1659 | Rare Equipment | Qty 1-5 |

### High-Tier Items (IDs 2000-4999)
| ID Range | Inferred Type | Notes |
|----------|--------------|-------|
| 2001-2010 | Troop Types / Units | Various troop categories (qty 1-112) |
| 2050-2056 | Special Troops | Elite units (qty 1-11) |
| 2102, 2106 | Special Units | High qty (99, 1) |
| 2406 | Special Item | Qty 2 |
| 3006, 3009 | Special Items | Qty 1-10 |
| 3517, 3520 | Special Items | Qty 4-22 |
| 4003-4009 | Rare Items | Qty 1 each |

### Premium / Event Items (IDs 7000+)
| ID Range | Inferred Type | Notes |
|----------|--------------|-------|
| 7800-7804 | Event Items | Qty 7-9 |
| 8000 | Premium Item | Qty 1 |
| 8723, 8728 | Special Items | Qty 1 |
| 40000 | Currency / Points | Qty 11 |
| 41600 | Event Currency | Qty 3,885 (high) |
| 41606 | Event Currency | Qty 120 |
| 50002 | Special Item | Qty 3 |
| 71006-71012 | Premium Items | Qty 2-5 |
| 72001-72046 | Event Materials | Qty 1-160 |
| 100023 | Rare Item | Qty 9 |
| 320003 | Rare Item | Qty 39 |
| 400000 | Legendary Item | Qty 1 |
| 601005 | Common Currency | Qty 17,185 (very high) |
| 700021-700029 | Event Items | Qty 1-30 |
| 700051, 702011, 702036 | Event Items | Qty 1-5 |

---

## Appendix B: Timer ID Ranges

> Extracted from opcode 213 active timers. Each timer entry has structure:
> `[id, startTime, 0, 0, startTime, duration, endTime, 0, 0, [], 0, 0, [associatedId], []]`
> Timestamps are Unix epoch (seconds). Duration is in seconds.

### Timer ID Ranges Observed

| Range Start | Range End | Pattern | Likely Type | Duration Pattern |
|------------|-----------|---------|-------------|-----------------|
| 888100 | 888237 | 8881xx, 8882xx | Resource Production / Building timers | 3600s (1hr) |
| 888900 | 888902 | 8889xx | Buff/Boost timers | 3600s (1hr) |
| 889011 | 889040 | 8890xx | Active Buffs / Shield / Effects | 3600s (1hr) |
| 8888098 | 8888100 | 8888xxx | Special timers | 3600s (1hr) |
| 8889912 | 8889912 | 8889xxx | Special event timer | 3600s (1hr) |
| 8890111 | 8890111 | 8890xxx | Daily Buff (24hr) | 86401s (~24hr) |
| 88900011 | 88900100 | 88900xxx | Extended buff set | 3600s (1hr) |
| 88900111 | 88900112 | 88900xxx | Extended buff set | 3600s (1hr) |

### Timer Structure Breakdown
| Index | Field | Type | Example |
|-------|-------|------|---------|
| 0 | timerId | int | 888100 |
| 1 | startTime | unix timestamp | 1777732473 |
| 2 | unknown1 | int | 0 |
| 3 | unknown2 | int | 0 |
| 4 | effectiveStart | unix timestamp | 1777732473 |
| 5 | durationSec | int | 3600 |
| 6 | endTime | unix timestamp | 1777736073 |
| 7 | unknown3 | int | 0 |
| 8 | unknown4 | int | 0 |
| 9 | unknown5 | array | [] |
| 10 | unknown6 | int | 0 |
| 11 | unknown7 | int | 0 |
| 12 | associatedIds | array[int] | [1] or [270341] |
| 13 | historyTimestamps | array[int] | [] or [1775676461] |

**Note:** `endTime = startTime + duration` (always holds). The `associatedIds` array links the timer to a specific buff, building, or resource.

---

## Appendix C: Buff / Boost ID Patterns

> Buff entries use the same timer structure as Appendix B, but with specific ID ranges.
> They can be distinguished by their `associatedIds` linking to buff type definitions.

### Known Buff ID Ranges (from timer associatedIds and resource balances)
| Pattern | Description | Evidence |
|---------|-------------|----------|
| `8889xx` | Production Buffs | Resource production boost timers (3600s duration) |
| `8890xx` | Combat/Defense Buffs | Attack/defense boost effects |
| `8890111` | Daily 24hr Buff | Long-duration buff (86401s), associatedId=[270341] |
| `88900xxx` | Stacking Buff Set | Multiple concurrent buffs (100+ entries) |
| Resource IDs 500-599 | Speedup Items | Consumable speedups in inventory |
| Resource IDs 1500-1600 | Equipment Buffs | Equipped items providing passive bonuses |

### Feature Flag Maps (from opcode 203)
| Map | Key Count | Purpose |
|-----|-----------|---------|
| First flag map | ~60 keys | Feature toggles (UI visibility, feature availability) |
| Second flag map | ~120 keys | Extended feature toggles, event flags, A/B test groups |

---

## Appendix D: Achievement and Task ID Ranges

### Achievements (opcode 213, `res[1][0][13]`)
> Structure: `{ "key": [id, subId, progress, ...] }` or progress tracking arrays.

| ID Range | Inferred Category | Notes |
|----------|------------------|-------|
| 1-99 | Core Achievements | Building, resource milestones |
| 100-199 | Combat Achievements | Kill counts, march victories |
| 200-299 | Exploration Achievements | Map discovery, tile scanning |
| 300-399 | Clan Achievements | Clan donations, wars, membership |
| 400-499 | Event Achievements | Limited-time event progress |

### Daily Tasks (opcode 213, `res[1][0][14]`)
> Structure: `[taskId, categoryId, subId, progress, completedFlag]`

| Category ID | Inferred Type | Notes |
|-------------|--------------|-------|
| 1 | Resource Tasks | Collect/gather resources |
| 2 | Building Tasks | Construct/upgrade buildings |
| 3 | Combat Tasks | Attack, defend, kill troops |
| 4 | March Tasks | Send marches, explore tiles |
| 5 | Clan Tasks | Donate, request help, clan events |

---

## Appendix E: Troop Category/Type IDs

> Extracted from opcode 213 troop formations and opcode 701 march data.
> Format: `[category, type, specialId, health%]`

| Category | Inferred Meaning |
|----------|-----------------|
| 1 | Infantry / Melee units |
| 2 | Ranged / Archer units |
| 3 | Cavalry / Mounted units |
| 4 | Siege / Artillery units |
| 5 | Special / Hero units |
| 16 | Commander slot 1 |
| 17 | Commander slot 2 |
| 18 | Commander slot 3 |
| 19 | Commander slot 4 |

### Troop Type IDs (observed within categories)
| Type | Notes |
|------|-------|
| 17-22 | Individual troop types within a category |
| 0 | Empty slot / no commander assigned |

---

## Appendix F: Coordinate System

> TotalBattle uses a 2D grid coordinate system for the world map.

| Field | Range | Description |
|-------|-------|-------------|
| kingdom | 1-500+ | Server/cluster ID (e.g., 283 in `game-us43.totalbattle.com/rubens-realm283`) |
| x | 0-5000 | Horizontal grid position |
| y | 0-5000 | Vertical grid position |

### Example from opcode 213 player position
```
res[1][0][1] = [
  [...],  // objectId array
  [...],  // position data
  ...,
  3997,   // x coordinate
  2488,   // y coordinate
  283,    // kingdom ID
  283,    // home kingdom ID
  ...
]
```

---

## Appendix G: Quick Reference -- Field Paths to Database Columns

This table maps the most commonly extracted field paths to recommended database columns for rapid parser development.

| Field Path | Table | Column | Type |
|-----------|-------|--------|------|
| `res[1][0][1][1][0]` | players | progress_id | VARCHAR(50) |
| `res[1][0][1][1][5]` | players | x | INT |
| `res[1][0][1][1][6]` | players | y | INT |
| `res[1][0][1][1][7]` | players | kingdom | INT |
| `res[1][0][1][1][10]` | players | level | INT |
| `res[1][0][1][3]` | player_resources | (key-value) | JSONB |
| `res[1][0][5]` | player_buildings | (array) | JSONB |
| `res[1][0][6]` | active_timers | (array) | JSONB |
| `res[1][0][7]` | player_buffs | (array) | JSONB |
| `res[1][0][8]` | march_slots | (array) | JSONB |
| `res[1][0][13]` | player_achievements | (object) | JSONB |
| `res[1][0][14]` | player_tasks | (array) | JSONB |
| `res[1][0][15]` | player_flags | (array) | JSONB |
| `res[1][0][16]` | player_settings | (object) | JSONB |
| `res[1][0][24]` | obj42_players | (array) | JSONB |

---

*Document generated from analysis of 69 opcode .dec files, server-v2.cjs decoder logic, and messagePack.js hand-written extractors. Last updated: 2026-05-06.*
