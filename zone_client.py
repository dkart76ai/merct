#!/usr/bin/env python3
"""Headless ch312 zone subscription client.

Two main operations:

  extract   -- attach to a live Chrome tab via CDP, capture the session token
               and current page ID, save to ~/.scout_session.json
  fetch     -- send a ch312 subscription request headlessly (no browser needed)
               and print the entity snapshot

Usage:
  python3 zone_client.py extract [--port 9222] [--tab totalbattle]
  python3 zone_client.py fetch --page PAGE_ID [--session PATH]
  python3 zone_client.py fetch --coord X Y [--session PATH]
  python3 zone_client.py fetch --coord X Y --k-base -28 [--session PATH]

The saved session file contains:
  player_id   -- integer entity ID
  token       -- hex string of the auth blob
  page_id     -- last observed ch312 page ID
  realm       -- realm number (from URL)
  endpoint    -- full HTTPS POST URL
  captured_at -- ISO timestamp

The session token has been observed to be valid for the length of a browser
session.  A new token is issued each time you log in.  Re-run 'extract'
whenever the token expires (server starts returning errors).

Page ID formula (validated for K=278):
  page_id = (Y // 20) * 51 + (X // 20) + k_base
  k_base = -28  (K=278; other realms require their own capture to determine)
  Each page covers a 20×20 tile block; the server also returns entities from
  neighbouring pages (~35–40 tile spill radius around the requested area).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import struct
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import websockets
except ImportError:
    websockets = None

try:
    import urllib3  # noqa: F401 — only needed for HTTPS POST
    _has_urllib3 = True
except ImportError:
    _has_urllib3 = False

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_SESSION_PATH = Path.home() / ".scout_session.json"
DEFAULT_REALMS_PATH = Path.home() / ".scout_realms.json"
STATIC_ENTITY_TYPES_PATH = ROOT_DIR / "static_entity_types.json"
_GAME_URL_FRAGMENT = "totalbattle"

# Load static entity type labels from file, fall back to empty dict
def _load_static_entity_types() -> dict[int, str]:
    try:
        raw = json.loads(STATIC_ENTITY_TYPES_PATH.read_text())
        return {int(k): v for k, v in raw.items()}
    except Exception:
        return {}

STATIC_ENTITY_TYPES: dict[int, str] = _load_static_entity_types()


# ── MessagePack-LE encoder/decoder (subset, copied from journal_decode.py) ────

def _read_uint(data: bytes, pos: int, size: int) -> tuple[int, int]:
    end = pos + size
    if end > len(data):
        raise ValueError("unexpected EOF")
    return int.from_bytes(data[pos:end], "little", signed=False), end


def _read_int(data: bytes, pos: int, size: int) -> tuple[int, int]:
    end = pos + size
    if end > len(data):
        raise ValueError("unexpected EOF")
    return int.from_bytes(data[pos:end], "little", signed=True), end


def _decode(data: bytes, pos: int = 0, depth: int = 0):
    if pos >= len(data):
        return None, pos
    if depth > 64:
        raise ValueError("max depth exceeded")
    b = data[pos]
    pos += 1
    if b <= 0x7F:
        return b, pos
    if 0x90 <= b <= 0x9F:
        arr = []
        for _ in range(b & 0x0F):
            v, pos = _decode(data, pos, depth + 1)
            arr.append(v)
        return arr, pos
    if 0x80 <= b <= 0x8F:
        pairs = []
        for _ in range(b & 0x0F):
            k, pos = _decode(data, pos, depth + 1)
            v, pos = _decode(data, pos, depth + 1)
            pairs.append([k, v])
        return {"@map": pairs}, pos
    if 0xA0 <= b <= 0xBF:
        n = b & 0x1F
        end = pos + n
        if end > len(data):
            raise ValueError("unexpected EOF")
        try:
            return data[pos:end].decode("utf-8"), end
        except UnicodeDecodeError:
            return f"str:{data[pos:end].hex()}", end
    if b == 0xC0:
        return None, pos
    if b == 0xC2:
        return False, pos
    if b == 0xC3:
        return True, pos
    if b in (0xC4, 0xC5, 0xC6):
        n_size = {0xC4: 1, 0xC5: 2, 0xC6: 4}[b]
        n, pos = _read_uint(data, pos, n_size)
        end = pos + n
        if end > len(data):
            raise ValueError("unexpected EOF")
        return f"bin:{data[pos:end].hex()}", end
    if b == 0xCA:
        end = pos + 4
        return struct.unpack("<f", data[pos:end])[0], end
    if b == 0xCB:
        end = pos + 8
        return struct.unpack("<d", data[pos:end])[0], end
    if b == 0xCC:
        return _read_uint(data, pos, 1)
    if b == 0xCD:
        return _read_uint(data, pos, 2)
    if b == 0xCE:
        return _read_uint(data, pos, 4)
    if b == 0xCF:
        return _read_uint(data, pos, 8)
    if b == 0xD0:
        return _read_int(data, pos, 1)
    if b == 0xD1:
        return _read_int(data, pos, 2)
    if b == 0xD2:
        return _read_int(data, pos, 4)
    if b == 0xD3:
        return _read_int(data, pos, 8)
    if b == 0xD9:
        n, pos = _read_uint(data, pos, 1)
        end = pos + n
        if end > len(data):
            raise ValueError("unexpected EOF")
        try:
            return data[pos:end].decode("utf-8"), end
        except UnicodeDecodeError:
            return f"str8:{data[pos:end].hex()}", end
    if b == 0xDA:
        n, pos = _read_uint(data, pos, 2)
        end = pos + n
        if end > len(data):
            raise ValueError("unexpected EOF")
        try:
            return data[pos:end].decode("utf-8"), end
        except UnicodeDecodeError:
            return f"str16:{data[pos:end].hex()}", end
    if b == 0xDB:
        n, pos = _read_uint(data, pos, 4)
        end = pos + n
        if end > len(data):
            raise ValueError("unexpected EOF")
        try:
            return data[pos:end].decode("utf-8"), end
        except UnicodeDecodeError:
            return f"str32:{data[pos:end].hex()}", end
    if b == 0xDC:
        n, pos = _read_uint(data, pos, 2)
        arr = []
        for _ in range(n):
            v, pos = _decode(data, pos, depth + 1)
            arr.append(v)
        return arr, pos
    if b == 0xDD:
        n, pos = _read_uint(data, pos, 4)
        arr = []
        for _ in range(n):
            v, pos = _decode(data, pos, depth + 1)
            arr.append(v)
        return arr, pos
    if b == 0xDE:
        n, pos = _read_uint(data, pos, 2)
        pairs = []
        for _ in range(n):
            k, pos = _decode(data, pos, depth + 1)
            v, pos = _decode(data, pos, depth + 1)
            pairs.append([k, v])
        return {"@map": pairs}, pos
    if b == 0xDF:
        n, pos = _read_uint(data, pos, 4)
        pairs = []
        for _ in range(n):
            k, pos = _decode(data, pos, depth + 1)
            v, pos = _decode(data, pos, depth + 1)
            pairs.append([k, v])
        return {"@map": pairs}, pos
    if b >= 0xE0:
        return b - 256, pos
    return f"?0x{b:02x}", pos


def _decode_all(data: bytes) -> list[Any]:
    values = []
    pos = 0
    while pos < len(data):
        v, pos = _decode(data, pos)
        values.append(v)
    return values


def decode_frame(raw: bytes) -> dict[str, Any]:
    if len(raw) < 8:
        return {"error": "too short"}
    outer = struct.unpack_from("<I", raw, 0)[0]
    inner = struct.unpack_from("<I", raw, 4)[0]
    payload = raw[8:]
    values = []
    pos = 0
    while pos < len(payload):
        try:
            v, pos = _decode(payload, pos)
            values.append(v)
        except ValueError:
            break
    channel = None
    if values and isinstance(values[0], list) and len(values[0]) >= 2:
        if isinstance(values[0][0], int) and isinstance(values[0][1], int):
            channel = values[0][0]
    return {"frame_outer": outer, "frame_inner": inner, "channel": channel, "values": values}


# ── encoder ───────────────────────────────────────────────────────────────────

def _enc_uint(v: int, size: int) -> bytes:
    return v.to_bytes(size, "little", signed=False)


def _encode(value: Any) -> bytes:
    if value is None:
        return b"\xC0"
    if value is False:
        return b"\xC2"
    if value is True:
        return b"\xC3"
    if isinstance(value, int):
        if 0 <= value <= 0x7F:
            return bytes([value])
        if -32 <= value < 0:
            return bytes([(value + 256) & 0xFF])
        if 0 <= value <= 0xFF:
            return b"\xCC" + _enc_uint(value, 1)
        if 0 <= value <= 0xFFFF:
            return b"\xCD" + _enc_uint(value, 2)
        if 0 <= value <= 0xFFFFFFFF:
            return b"\xCE" + _enc_uint(value, 4)
        if 0 <= value <= 0xFFFFFFFFFFFFFFFF:
            return b"\xCF" + _enc_uint(value, 8)
        if -0x80 <= value <= 0x7F:
            return b"\xD0" + value.to_bytes(1, "little", signed=True)
        if -0x8000 <= value <= 0x7FFF:
            return b"\xD1" + value.to_bytes(2, "little", signed=True)
        if -0x80000000 <= value <= 0x7FFFFFFF:
            return b"\xD2" + value.to_bytes(4, "little", signed=True)
        return b"\xD3" + value.to_bytes(8, "little", signed=True)
    if isinstance(value, float):
        return b"\xCB" + struct.pack("<d", value)
    if isinstance(value, str):
        if value.startswith("bin:"):
            raw = bytes.fromhex(value[4:])
            n = len(raw)
            if n <= 0xFF:
                return b"\xC4" + _enc_uint(n, 1) + raw
            if n <= 0xFFFF:
                return b"\xC5" + _enc_uint(n, 2) + raw
            return b"\xC6" + _enc_uint(n, 4) + raw
        raw = value.encode("utf-8")
        n = len(raw)
        if n <= 0x1F:
            return bytes([0xA0 | n]) + raw
        if n <= 0xFF:
            return b"\xD9" + _enc_uint(n, 1) + raw
        if n <= 0xFFFF:
            return b"\xDA" + _enc_uint(n, 2) + raw
        return b"\xDB" + _enc_uint(n, 4) + raw
    if isinstance(value, list):
        n = len(value)
        if n <= 0x0F:
            prefix = bytes([0x90 | n])
        elif n <= 0xFFFF:
            prefix = b"\xDC" + _enc_uint(n, 2)
        else:
            prefix = b"\xDD" + _enc_uint(n, 4)
        return prefix + b"".join(_encode(item) for item in value)
    if isinstance(value, dict):
        pairs = value.get("@map", list(value.items()))
        n = len(pairs)
        if n <= 0x0F:
            prefix = bytes([0x80 | n])
        elif n <= 0xFFFF:
            prefix = b"\xDE" + _enc_uint(n, 2)
        else:
            prefix = b"\xDF" + _enc_uint(n, 4)
        parts = [prefix]
        for k, v in pairs:
            parts.append(_encode(k))
            parts.append(_encode(v))
        return b"".join(parts)
    raise TypeError(f"cannot encode {type(value)!r}")


def encode_frame(values: list[Any]) -> bytes:
    payload = b"".join(_encode(v) for v in values)
    outer = len(payload) + 8
    inner = 0
    return struct.pack("<II", outer, inner) + payload


# ── session helpers ───────────────────────────────────────────────────────────

def peek_channel(raw: bytes) -> int | None:
    if len(raw) < 9:
        return None
    try:
        first, _ = _decode(raw[8:], 0)
    except Exception:
        return None
    if isinstance(first, list) and len(first) >= 2 and isinstance(first[0], int):
        return first[0]
    return None


def _extract_session_from_bytes(raw: bytes, url: str) -> dict | None:
    """Return session dict if the frame contains auth material, else None."""
    ch = peek_channel(raw)
    if ch is None:
        return None
    fr = decode_frame(raw)
    vals = fr.get("values", [])
    if not vals or not isinstance(vals[0], list) or len(vals[0]) < 3:
        return None
    header = vals[0]
    # header = [channel, seq, [[player_id], token_blob, ""], ...]
    if not isinstance(header[2], list) or len(header[2]) < 2:
        return None
    player_ref = header[2][0]
    token_blob = header[2][1]
    if not isinstance(player_ref, list) or not player_ref:
        return None
    player_id = player_ref[0]
    if not isinstance(player_id, int) or not isinstance(token_blob, str):
        return None
    if not token_blob.startswith("bin:"):
        return None

    # inner_header is a global session sequence counter — capture it so we
    # can use a plausible value in headless requests.
    inner_header = fr.get("frame_inner", 42)

    # Extract page_id from ch312 requests
    page_id = None
    if ch == 312 and len(vals) > 1 and isinstance(vals[1], list) and vals[1]:
        page_list = vals[1][0]
        if isinstance(page_list, list) and page_list and isinstance(page_list[0], int):
            page_id = page_list[0]

    realm = None
    endpoint = url
    # rubens-realm278 → 278
    try:
        realm_str = url.rstrip("/").split("/")[-1]
        if realm_str.startswith("rubens-realm"):
            realm = int(realm_str[len("rubens-realm"):])
    except (ValueError, AttributeError):
        pass

    return {
        "player_id": player_id,
        "token": token_blob,
        "inner_header": inner_header,
        "page_id": page_id,
        "realm": realm,
        "endpoint": endpoint,
        "channel": ch,
        "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def load_session(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: session file not found: {path}", file=sys.stderr)
        print("  Run: python3 zone_client.py extract", file=sys.stderr)
        raise SystemExit(1)
    with path.open() as f:
        return json.load(f)


def load_realm_map(path: Path = DEFAULT_REALMS_PATH) -> dict[int, int]:
    """Return {realm: k_base} from the realms file, or {} if it doesn't exist."""
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text())
        return {int(k): int(v) for k, v in raw.items()}
    except Exception:
        return {}


def save_realm_map(realm_map: dict[int, int], path: Path = DEFAULT_REALMS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({str(k): v for k, v in sorted(realm_map.items())}, indent=2) + "\n")


def realm_k_base(realm: int, path: Path = DEFAULT_REALMS_PATH) -> int | None:
    """Look up k_base for a realm, returning None if unknown."""
    return load_realm_map(path).get(realm)


def save_session(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


# ── CDP session extractor ─────────────────────────────────────────────────────

def _get_tabs(port: int) -> list[dict]:
    url = f"http://localhost:{port}/json"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        print(f"ERROR: cannot reach Chrome DevTools at {url}: {exc}", file=sys.stderr)
        print(f"  Launch Chrome with: --remote-debugging-port={port}", file=sys.stderr)
        raise SystemExit(1)


def _pick_tab(tabs: list[dict], fragment: str) -> dict | None:
    for tab in tabs:
        if fragment.lower() in str(tab.get("url", "")).lower():
            return tab
    for tab in tabs:
        if tab.get("type") == "page":
            return tab
    return tabs[0] if tabs else None


async def _extract_session_cdp(port: int, tab_fragment: str, timeout: float, session_path: Path) -> None:
    if websockets is None:
        print("ERROR: 'websockets' package not installed.  Run: pip install websockets", file=sys.stderr)
        raise SystemExit(1)

    tabs = _get_tabs(port)
    tab = _pick_tab(tabs, tab_fragment)
    if not tab:
        print("ERROR: no matching tab found.", file=sys.stderr)
        raise SystemExit(1)

    ws_url = tab.get("webSocketDebuggerUrl")
    if not ws_url:
        print(f"ERROR: tab has no webSocketDebuggerUrl: {tab}", file=sys.stderr)
        raise SystemExit(1)

    print(f"Attached to: {tab.get('url', '')[:100]}")
    print(f"Watching for session token (timeout={timeout}s)...")

    async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
        # Enable Network events
        await ws.send(json.dumps({"id": 1, "method": "Network.enable", "params": {}}))
        await ws.recv()  # ack

        pending: dict[str, dict] = {}
        session: dict | None = None
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            try:
                raw_msg = await asyncio.wait_for(ws.recv(), timeout=min(2.0, deadline - time.monotonic()))
            except asyncio.TimeoutError:
                continue

            msg = json.loads(raw_msg)
            method = msg.get("method")
            params = msg.get("params") or {}

            if method == "Network.requestWillBeSent":
                rid = params.get("requestId")
                req = params.get("request") or {}
                url = str(req.get("url", ""))
                if _GAME_URL_FRAGMENT in url and "totalbattle.com" in url:
                    pending[rid] = {"url": url}

            elif method == "Network.requestWillBeSentExtraInfo":
                rid = params.get("requestId")
                # grab request body if present as raw post data
                post_data = params.get("postData") or ""
                if rid in pending and post_data and "\x00" in post_data:
                    try:
                        raw = post_data.encode("latin-1")
                        result = _extract_session_from_bytes(raw, pending[rid]["url"])
                        if result:
                            if session is None or (result.get("page_id") and not session.get("page_id")):
                                session = result
                                print(f"  Captured: player={result['player_id']} token={result['token'][:20]}... channel={result['channel']} page={result.get('page_id')}")
                    except Exception:
                        pass

            elif method == "Network.loadingFinished":
                rid = params.get("requestId")
                if rid not in pending:
                    continue
                url = pending[rid]["url"]
                try:
                    body_resp = await asyncio.wait_for(
                        _send_cdp(ws, "Network.getRequestPostData", {"requestId": rid}),
                        timeout=2.0,
                    )
                    post_data = body_resp.get("postData") or ""
                    if post_data and "\x00" in post_data:
                        raw = post_data.encode("latin-1")
                        result = _extract_session_from_bytes(raw, url)
                        if result:
                            if session is None or (result.get("page_id") and not session.get("page_id")):
                                session = result
                                print(f"  Captured: player={result['player_id']} token={result['token'][:20]}... channel={result['channel']} page={result.get('page_id')}")
                except Exception:
                    pass
                finally:
                    pending.pop(rid, None)

            if session and session.get("page_id"):
                break  # got everything we need

        if not session:
            print("ERROR: timed out waiting for a valid request. Is the game open and active?", file=sys.stderr)
            raise SystemExit(1)

        save_session(session, session_path)
        print(f"Session saved to {session_path}")
        print(f"  player_id : {session['player_id']}")
        print(f"  token     : {session['token']}")
        print(f"  page_id   : {session.get('page_id')}")
        print(f"  realm     : {session.get('realm')}")
        print(f"  endpoint  : {session.get('endpoint')}")


_cdp_seq = 1


async def _send_cdp(ws, method: str, params: dict) -> dict:
    global _cdp_seq
    _cdp_seq += 1
    msg_id = _cdp_seq
    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
    # Wait for the matching response (may not be next)
    for _ in range(30):
        raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        resp = json.loads(raw)
        if resp.get("id") == msg_id:
            return resp.get("result") or {}
    return {}


# ── ch312 request builder ─────────────────────────────────────────────────────

def build_ch312_request(
    player_id: int,
    token: str,
    page_ids: list[int],
    seq: int = 1,
    cursors: list[int] | None = None,
    inner_header: int = 42,
) -> bytes:
    """Build a ch312 zone subscription request.

    page_ids    : list of page IDs to subscribe to (use [page_id] for a single zone)
    cursors     : state cursors (one per page_id).  Use 0 (or omit) for a full dump.
    inner_header: session sequence counter captured from a live request; any value works
                  for a fresh one-shot subscription — 42 is a safe default.
    """
    if cursors is None:
        cursors = [0] * len(page_ids)
    if len(cursors) < len(page_ids):
        cursors = list(cursors) + [0] * (len(page_ids) - len(cursors))

    # Header: [ch, seq, [[player_id], token, ""], ""]
    header = [312, seq, [[player_id], token, ""], ""]

    # Page subscription block: [[page_ids...], [cursors...], [], []]
    page_block = [page_ids, cursors, [], []]

    # State hash block: empty list → server sends full entity snapshot (no delta)
    state_block: list = []

    values = [header, page_block, state_block]
    payload = b"".join(_encode(v) for v in values)
    outer = len(payload) + 8
    return struct.pack("<II", outer, inner_header) + payload


# ── page ID / coordinate helpers ─────────────────────────────────────────────

# Page geometry constants (validated for K=278)
_PAGE_SIZE = 20   # tiles per page in both X and Y
_PAGE_STRIDE = 51  # pages per row (number of page columns across the map)
_K_BASE_DEFAULT = -28  # additive offset for K=278; other realms not yet measured


def coord_to_page(x: int, y: int, k_base: int = _K_BASE_DEFAULT) -> int:
    """Convert map coordinates to a ch312 page ID.

    Formula: page_id = (Y // 20) * 51 + (X // 20) + k_base

    k_base is realm-specific (default -28 validated for K=278).  To determine
    k_base for another realm, run 'extract' while the game is open in that
    realm and check the captured page_id alongside the current map position:
        k_base = page_id - (Y // 20) * 51 - (X // 20)
    """
    return (y // _PAGE_SIZE) * _PAGE_STRIDE + (x // _PAGE_SIZE) + k_base


def page_to_coord_range(page_id: int, k_base: int = _K_BASE_DEFAULT) -> tuple[int, int, int, int]:
    """Return the (x_min, x_max, y_min, y_max) tile range covered by a page ID.

    Note: the server returns entities from neighbouring pages too, so the
    actual coverage radius in a fetch response is larger (~35–40 tiles outside
    the requested page boundary).
    """
    adjusted = page_id - k_base
    row = adjusted // _PAGE_STRIDE
    col = adjusted % _PAGE_STRIDE
    x_min = col * _PAGE_SIZE
    x_max = x_min + _PAGE_SIZE - 1
    y_min = row * _PAGE_SIZE
    y_max = y_min + _PAGE_SIZE - 1
    return x_min, x_max, y_min, y_max


# ── entity parser ─────────────────────────────────────────────────────────────

# Hard-coded labels for entity types not in the static data file
_ENTITY_TYPES_OVERRIDE: dict[int, str] = {
    1: "march",
    2: "city",
    10001: "capital",
    10002: "foreign_city",
    10006: "clan_mason",
    10007: "clan_bldg",
}


def _entity_type_label(etype: int | None) -> str:
    if etype is None:
        return "?"
    if etype in _ENTITY_TYPES_OVERRIDE:
        return _ENTITY_TYPES_OVERRIDE[etype]
    if etype in STATIC_ENTITY_TYPES:
        return STATIC_ENTITY_TYPES[etype]
    return f"#{etype}"


def _parse_entity(e: Any) -> dict | None:
    if not isinstance(e, list) or len(e) < 18:
        return None
    eid_raw = e[0]
    eid = eid_raw[0] if isinstance(eid_raw, list) and eid_raw and isinstance(eid_raw[0], int) else None
    if eid is None:
        return None
    etype = e[3] if len(e) > 3 and isinstance(e[3], int) else None
    owner_raw = e[2]
    owner = owner_raw[0] if isinstance(owner_raw, list) and owner_raw and isinstance(owner_raw[0], int) else None
    coord = e[17] if len(e) > 17 and isinstance(e[17], list) and len(e[17]) == 3 else None
    clan_tag = e[13] if len(e) > 13 and isinstance(e[13], str) and e[13].strip() else None
    depart_ts = e[21] if len(e) > 21 and isinstance(e[21], int) else None
    arrive_ts = e[22] if len(e) > 22 and isinstance(e[22], int) else None
    dest = e[18] if len(e) > 18 and isinstance(e[18], list) and len(e[18]) == 3 else None

    return {
        "entity_id": eid,
        "entity_type": etype,
        "type_label": _entity_type_label(etype),
        "owner_id": owner,
        "coord": coord,
        "dest_coord": dest,
        "clan_tag": clan_tag,
        "depart_ts": depart_ts,
        "arrive_ts": arrive_ts,
    }


def _walk_entities(node: Any, out: list) -> None:
    parsed = _parse_entity(node)
    if parsed is not None:
        out.append(parsed)
        return
    if isinstance(node, list):
        for item in node:
            _walk_entities(item, out)
    elif isinstance(node, dict):
        for item in node.values():
            _walk_entities(item, out)


def extract_entities(fr: dict) -> list[dict]:
    entities: list[dict] = []
    for val in (fr.get("values") or [])[1:]:
        _walk_entities(val, entities)
    seen: set[int] = set()
    deduped = []
    for e in entities:
        if e["entity_id"] not in seen:
            seen.add(e["entity_id"])
            deduped.append(e)
    return deduped


# ── headless HTTP POST ────────────────────────────────────────────────────────

def post_binary(endpoint: str, body: bytes) -> bytes:
    """POST binary body to endpoint, return raw response bytes."""
    import urllib.request
    headers = {
        "Content-Type": "application/octet-stream",
        "Referer": "https://totalbattle.com/",
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
        ),
        "Origin": "https://totalbattle.com",
        "sec-ch-ua-mobile": "?0",
    }
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read()


# ── CLI commands ──────────────────────────────────────────────────────────────

def cmd_extract(args) -> None:
    session_path = Path(args.session)
    asyncio.run(_extract_session_cdp(
        port=args.port,
        tab_fragment=args.tab,
        timeout=float(args.timeout),
        session_path=session_path,
    ))
    # Seed realms map with known k_base values on first extract
    if session_path.exists():
        try:
            sess = load_session(session_path)
            realm = sess.get("realm")
            if realm:
                realm_map = load_realm_map()
                if realm not in realm_map:
                    # K=278 k_base is validated; others need probe
                    known = {278: -28}
                    if realm in known:
                        realm_map[realm] = known[realm]
                        save_realm_map(realm_map)
                        print(f"Realms   : seeded k_base={known[realm]} for realm {realm} in {DEFAULT_REALMS_PATH}")
        except Exception:
            pass


def cmd_fetch(args) -> None:
    session = load_session(Path(args.session))

    player_id = session["player_id"]
    token = session["token"]
    endpoint = session["endpoint"]

    # Resolve page_id: explicit --page beats --coord beats session fallback
    page_id = args.page
    if page_id is None and args.coord:
        cx, cy = args.coord
        if args.k_base is not None:
            k_base = args.k_base
        else:
            sess_realm = session.get("realm")
            k_base = realm_k_base(sess_realm) if sess_realm else None
            if k_base is None:
                k_base = _K_BASE_DEFAULT
                print(f"Warning  : k_base not found for realm {sess_realm} in {DEFAULT_REALMS_PATH}")
                print(f"           Using default {_K_BASE_DEFAULT} (K=278 only). Run 'probe' to discover it.")
        page_id = coord_to_page(cx, cy, k_base)
        x0, x1, y0, y1 = page_to_coord_range(page_id, k_base)
        print(f"Coord    : X={cx} Y={cy}  →  page {page_id}  (page covers X={x0}-{x1} Y={y0}-{y1})")
    if page_id is None:
        page_id = session.get("page_id")

    if page_id is None:
        print("ERROR: no page_id specified and none saved in session.", file=sys.stderr)
        print("  Use --page PAGE_ID, --coord X Y, or run 'extract' with the game open.", file=sys.stderr)
        raise SystemExit(1)

    page_ids = [page_id]
    if args.extra_pages:
        page_ids += args.extra_pages

    print(f"Endpoint : {endpoint}")
    print(f"Player   : {player_id}")
    print(f"Token    : {token[:24]}...")
    print(f"Pages    : {page_ids}")

    inner_header = session.get("inner_header", 42)
    body = build_ch312_request(player_id, token, page_ids, inner_header=inner_header)
    print(f"Request  : {len(body)} bytes (ch312)")

    try:
        resp_raw = post_binary(endpoint, body)
    except Exception as exc:
        print(f"ERROR: request failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print(f"Response : {len(resp_raw)} bytes")

    fr = decode_frame(resp_raw)
    ch = fr.get("channel")
    if ch != 312:
        print(f"WARNING: unexpected response channel {ch}")
        print(json.dumps(fr.get("values", [])[:3], indent=2, default=str)[:500])
        raise SystemExit(1)

    entities = extract_entities(fr)
    print(f"\nEntities : {len(entities)}")

    for e in entities:
        coord_str = "/".join(str(v) for v in e["coord"]) if e["coord"] else "?"
        dest_str = "/".join(str(v) for v in e["dest_coord"]) if e["dest_coord"] else ""
        clan = f" [{e['clan_tag']}]" if e.get("clan_tag") else ""
        march_info = ""
        if e.get("arrive_ts"):
            now_ts = int(time.time())
            eta = e["arrive_ts"] - now_ts
            march_info = f" → {dest_str} ETA {eta}s" if dest_str else f" ETA {eta}s"
        print(f"  {e['entity_id']} [{e['type_label']}]{clan} @ {coord_str}{march_info}")

    if args.json:
        output_path = Path(args.json)
        with output_path.open("w") as f:
            json.dump({"channel": ch, "entities": entities, "raw_values": fr.get("values", [])}, f, indent=2, default=str)
        print(f"\nFull output written to {output_path}")


def _endpoint_for_realm(session: dict, realm: int) -> str:
    """Swap the realm number in a captured endpoint URL."""
    import re
    return re.sub(r"rubens-realm\d+", f"rubens-realm{realm}", session["endpoint"])


def cmd_probe(args) -> None:
    """Scan page IDs headlessly to discover k_base for a target realm.

    For each probed page that returns entities, computes:
        k_base = page_id - (entity_y // 20) * 51 - (entity_x // 20)

    The most common candidate across all entity hits is returned as k_base.
    Stops after --max-hits pages with entities (default 3) for speed.
    Use --all to scan the full range.
    """
    session = load_session(Path(args.session))
    player_id = session["player_id"]
    token = session["token"]
    inner_header = session.get("inner_header", 42)

    if args.endpoint:
        endpoint = args.endpoint
    elif args.realm:
        endpoint = _endpoint_for_realm(session, args.realm)
    else:
        print("ERROR: --realm N or --endpoint URL required", file=sys.stderr)
        raise SystemExit(1)

    start, end, step = args.start, args.end, args.step
    max_hits = None if args.all else args.max_hits
    total_pages = len(range(start, end + 1, step))

    print(f"Endpoint : {endpoint}")
    print(f"Token    : {token[:24]}...")
    print(f"Scan     : pages {start}–{end} step {step}  ({total_pages} requests)")
    if max_hits:
        print(f"Stop at  : {max_hits} page(s) with entity hits")
    print()

    k_base_votes: dict[int, int] = {}
    hit_count = 0
    first_hit_page: int | None = None
    first_hit_entities: list = []
    consecutive_403 = 0
    _403_LIMIT = 5

    for i, page_id in enumerate(range(start, end + 1, step)):
        body = build_ch312_request(player_id, token, [page_id], inner_header=inner_header)
        try:
            resp_raw = post_binary(endpoint, body)
            consecutive_403 = 0
        except Exception as exc:
            err_str = str(exc)
            print(f"  [{i+1}/{total_pages}] page {page_id:5d}: request error — {exc}", flush=True)
            if "403" in err_str:
                consecutive_403 += 1
                if consecutive_403 >= _403_LIMIT:
                    print(f"\nAborted: {_403_LIMIT} consecutive 403s — token is rejected by this endpoint.")
                    print("The session token is realm-scoped. You need a session captured from that realm:")
                    print(f"  1. Open the game logged into realm {args.realm or endpoint}")
                    print(f"  2. python3 zone_client.py extract --session ~/.scout_session_k{args.realm or 'X'}.json")
                    print(f"  3. python3 zone_client.py probe --realm {args.realm or 'X'} --session ~/.scout_session_k{args.realm or 'X'}.json")
                    return
            continue

        fr = decode_frame(resp_raw)
        ch = fr.get("channel")
        if ch != 312:
            print(f"  [{i+1}/{total_pages}] page {page_id:5d}: unexpected channel {ch}", flush=True)
            continue

        entities = extract_entities(fr)
        if not entities:
            print(f"  [{i+1}/{total_pages}] page {page_id:5d}: empty", flush=True)
            continue

        # Got entities — accumulate k_base votes
        new_votes = 0
        for e in entities:
            coord = e.get("coord")
            if coord and len(coord) == 3:
                _, ex, ey = coord
                kb = page_id - (ey // _PAGE_SIZE) * _PAGE_STRIDE - (ex // _PAGE_SIZE)
                k_base_votes[kb] = k_base_votes.get(kb, 0) + 1
                new_votes += 1

        hit_count += 1
        if first_hit_page is None:
            first_hit_page = page_id
            first_hit_entities = entities

        print(
            f"  [{i+1}/{total_pages}] page {page_id:5d}: {len(entities)} entities"
            f"  (k_base votes this page: {new_votes})",
            flush=True,
        )

        if max_hits and hit_count >= max_hits:
            print(f"\nReached --max-hits {max_hits}, stopping early.")
            break

    # ── Report ────────────────────────────────────────────────────────────────
    print()
    if not k_base_votes:
        print("No entities found in scan range.")
        print("Suggestions:")
        print("  • Try a wider range:  --start 0 --end 5000 --step 51")
        print("  • Check the endpoint (wrong server?)")
        print("  • Session token may have expired — re-run 'extract'")
        return

    sorted_votes = sorted(k_base_votes.items(), key=lambda x: -x[1])
    best_kb, best_count = sorted_votes[0]
    total_votes = sum(k_base_votes.values())

    print(f"k_base candidates  : {dict(sorted_votes)}")
    print(f"Best k_base        : {best_kb}  ({best_count}/{total_votes} votes, "
          f"{100*best_count//total_votes}% confidence)")
    print()

    # Show coord range implied by first hit page
    x0, x1, y0, y1 = page_to_coord_range(first_hit_page, best_kb)
    print(f"First hit page     : {first_hit_page}  →  X={x0}-{x1}  Y={y0}-{y1}  (with k_base={best_kb})")
    print()
    print(f"Sample entities from page {first_hit_page}:")
    for e in first_hit_entities[:10]:
        coord_str = "/".join(str(v) for v in e["coord"]) if e["coord"] else "?"
        print(f"  {e['entity_id']:15d} [{e['type_label']:12s}] @ {coord_str}")

    # Auto-save to realms map
    target_realm = args.realm or session.get("realm")
    realms_path = Path(args.session).parent / ".scout_realms.json" if args.session != str(DEFAULT_SESSION_PATH) else DEFAULT_REALMS_PATH
    if target_realm:
        realm_map = load_realm_map(realms_path)
        realm_map[int(target_realm)] = best_kb
        save_realm_map(realm_map, realms_path)
        print(f"Saved              : realm {target_realm} → k_base={best_kb} in {realms_path}")

    print()
    print("Next steps:")
    print(f"  python3 zone_client.py fetch --coord X Y --session {args.session}")
    print(f"  # k_base={best_kb} for realm {target_realm} is now looked up automatically")


def cmd_show(args) -> None:
    session_path = Path(args.session)
    if not session_path.exists():
        print("No session saved.  Run: python3 zone_client.py extract")
        return
    session = load_session(session_path)
    print(json.dumps(session, indent=2))


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Headless ch312 zone client")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # extract
    p_ext = sub.add_parser("extract", help="Capture session token from a live Chrome tab")
    p_ext.add_argument("--port", type=int, default=9222, help="Chrome DevTools port (default 9222)")
    p_ext.add_argument("--tab", default=_GAME_URL_FRAGMENT, help="URL fragment to identify the game tab")
    p_ext.add_argument("--timeout", type=float, default=30.0, help="seconds to wait for a request (default 30)")
    p_ext.add_argument("--session", default=str(DEFAULT_SESSION_PATH), help="output session file path")

    # fetch
    p_fetch = sub.add_parser("fetch", help="Send a headless ch312 request and print entities")
    p_grp = p_fetch.add_mutually_exclusive_group()
    p_grp.add_argument("--page", type=int, default=None, help="raw page ID to subscribe to")
    p_grp.add_argument("--coord", type=int, nargs=2, metavar=("X", "Y"),
                       help="map coordinates — converted to page ID automatically")
    p_fetch.add_argument("--k-base", type=int, default=None,
                         help=f"realm page-ID offset (default {_K_BASE_DEFAULT}, validated for K=278)")
    p_fetch.add_argument("--extra-pages", type=int, nargs="+", metavar="PAGE", help="additional page IDs")
    p_fetch.add_argument("--session", default=str(DEFAULT_SESSION_PATH), help="session file path")
    p_fetch.add_argument("--json", metavar="PATH", default=None, help="write full decoded output to JSON file")

    # probe
    p_probe = sub.add_parser(
        "probe",
        help="Scan page IDs to discover k_base for a realm without a live capture",
    )
    p_probe_tgt = p_probe.add_mutually_exclusive_group(required=True)
    p_probe_tgt.add_argument("--realm", type=int, metavar="N",
                              help="realm number to probe (e.g. 142); endpoint server is taken from session")
    p_probe_tgt.add_argument("--endpoint", metavar="URL",
                              help="explicit endpoint URL (overrides --realm)")
    p_probe.add_argument("--start", type=int, default=500,
                         help="first page ID to probe (default 500)")
    p_probe.add_argument("--end", type=int, default=3000,
                         help="last page ID to probe (default 3000)")
    p_probe.add_argument("--step", type=int, default=51,
                         help="step between page IDs (default 51 = one per map row)")
    p_probe.add_argument("--max-hits", type=int, default=3,
                         help="stop after this many pages return entities (default 3)")
    p_probe.add_argument("--all", action="store_true",
                         help="scan full range regardless of hits")
    p_probe.add_argument("--session", default=str(DEFAULT_SESSION_PATH), help="session file path")

    # show
    p_show = sub.add_parser("show", help="Print saved session info")
    p_show.add_argument("--session", default=str(DEFAULT_SESSION_PATH), help="session file path")

    args = parser.parse_args()
    if args.cmd == "extract":
        cmd_extract(args)
    elif args.cmd == "fetch":
        cmd_fetch(args)
    elif args.cmd == "probe":
        cmd_probe(args)
    elif args.cmd == "show":
        cmd_show(args)


if __name__ == "__main__":
    main()
