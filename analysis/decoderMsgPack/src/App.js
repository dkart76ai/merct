import React, { useState, useCallback, useMemo } from 'react'
import JsonView from '@uiw/react-json-view'
import { githubDarkTheme } from '@uiw/react-json-view/githubDark'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
// ============================================
// MSGPACK DECODER (from browser-handler.js)
// ============================================
const Quote = JsonView.Quote

function msgpackDecode(buffer) {
  let offset = 0

  function readValue(buf, off) {
    if (off >= buf.length) return { val: null, end: buf.length }
    const byte = buf[off++]

    if (byte < 0x80) return { val: byte, end: off }
    if (byte >= 0xe0) return { val: byte - 256, end: off }

    if ((byte & 0xf0) === 0x80) {
      const size = byte & 0x0f
      const obj = {}
      let o = off
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const k = readValue(buf, o)
        o = k.end
        if (o >= buf.length) break
        const v = readValue(buf, o)
        o = v.end
        obj[k.val] = v.val
      }
      return { val: obj, end: o }
    }

    if ((byte & 0xf0) === 0x90) {
      const size = byte & 0x0f
      const arr = []
      let o = off
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const v = readValue(buf, o)
        arr.push(v.val)
        o = v.end
      }
      return { val: arr, end: o }
    }

    if ((byte & 0xe0) === 0xa0) {
      const len = byte & 0x1f
      return { val: buf.slice(off, off + len).toString('utf8'), end: off + len }
    }

    if (byte === 0xc0) return { val: null, end: off }
    if (byte === 0xc2) return { val: false, end: off }
    if (byte === 0xc3) return { val: true, end: off }

    if (byte === 0xc4) {
      const len = buf[off]
      return { val: buf.slice(off + 1, off + 1 + len), end: off + 1 + len }
    }
    if (byte === 0xc5) {
      const len = buf.readUInt16BE(off)
      return { val: buf.slice(off + 2, off + 2 + len), end: off + 2 + len }
    }
    if (byte === 0xc6) {
      const len = buf.readUInt32BE(off)
      return { val: buf.slice(off + 4, off + 4 + len), end: off + 4 + len }
    }

    if (byte === 0xca) {
      const view = new DataView(buf.buffer, buf.byteOffset + off)
      return { val: view.getFloat32(0), end: off + 4 }
    }
    if (byte === 0xcb) {
      const view = new DataView(buf.buffer, buf.byteOffset + off)
      return { val: view.getFloat64(0), end: off + 8 }
    }

    if (byte === 0xcc) return { val: buf[off], end: off + 1 }
    if (byte === 0xcd) return { val: buf.readUInt16LE(off), end: off + 2 }
    if (byte === 0xce) return { val: buf.readUInt32LE(off), end: off + 4 }

    if (byte === 0xcf) {
      let val = 0n
      for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
      return { val: Number(val), end: off + 8 }
    }

    if (byte === 0xd0) return { val: buf.readInt8(off), end: off + 1 }
    if (byte === 0xd1) return { val: buf.readInt16LE(off), end: off + 2 }
    if (byte === 0xd2) return { val: buf.readInt32LE(off), end: off + 4 }
    if (byte === 0xd3) {
      let val = 0n
      for (let i = 0; i < 8; i++) val += BigInt(buf[off + i]) << BigInt(i * 8)
      return { val: Number(val), end: off + 8 }
    }

    if (byte >= 0xd4 && byte <= 0xd8) {
      const sizes = [1, 2, 4, 8, 16]
      const size = sizes[byte - 0xd4]
      return {
        val: { type: buf[off], data: buf.slice(off + 1, off + 1 + size) },
        end: off + 1 + size
      }
    }

    if (byte === 0xd9) {
      const len = buf[off]
      return { val: buf.slice(off + 1, off + 1 + len).toString('utf8'), end: off + 1 + len }
    }
    if (byte === 0xda) {
      const len = buf.readUInt16BE(off)
      return { val: buf.slice(off + 2, off + 2 + len).toString('utf8'), end: off + 2 + len }
    }
    if (byte === 0xdb) {
      const len = buf.readUInt32BE(off)
      return { val: buf.slice(off + 4, off + 4 + len).toString('utf8'), end: off + 4 + len }
    }

    if (byte === 0xdc) {
      const size = buf.readUInt16BE(off)
      const arr = []
      let o = off + 2
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const v = readValue(buf, o)
        arr.push(v.val)
        o = v.end
      }
      return { val: arr, end: o }
    }
    if (byte === 0xdd) {
      const size = buf.readUInt32BE(off)
      const arr = []
      let o = off + 4
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const v = readValue(buf, o)
        arr.push(v.val)
        o = v.end
      }
      return { val: arr, end: o }
    }

    if (byte === 0xde) {
      const size = buf.readUInt16BE(off)
      const obj = {}
      let o = off + 2
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const k = readValue(buf, o)
        o = k.end
        if (o >= buf.length) break
        const v = readValue(buf, o)
        o = v.end
        obj[k.val] = v.val
      }
      return { val: obj, end: o }
    }
    if (byte === 0xdf) {
      const size = buf.readUInt32BE(off)
      const obj = {}
      let o = off + 4
      for (let i = 0; i < size; i++) {
        if (o >= buf.length) break
        const k = readValue(buf, o)
        o = k.end
        if (o >= buf.length) break
        const v = readValue(buf, o)
        o = v.end
        obj[k.val] = v.val
      }
      return { val: obj, end: o }
    }

    return { val: null, end: off + 1 }
  }

  function decodeFull(buf) {
    let off = 0
    if (buf.length >= 8) off = 8

    const results = []
    while (off < buf.length) {
      try {
        const result = readValue(buf, off)
        if (result.val !== null) {
          results.push(result.val)
          off = result.end
        } else {
          off++
        }
      } catch (e) {
        off++
      }
    }
    return results
  }

  return decodeFull(buffer)
}

function decodeBase64(base64String) {
  try {
    let cleanBase64 = base64String.trim()
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }

    const binaryString = atob(cleanBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return msgpackDecode(bytes)
  } catch (e) {
    throw new Error('Failed to decode: ' + e.message)
  }
}

function processBytesToString(data) {
  if (data === null) return null
  if (typeof data === 'number') {
    return data
  }
  if (typeof data === 'boolean') return data
  if (typeof data === 'string') {
    const t = data
      .split(',')
      .map(c => String.fromCharCode(c))
      .join('')
    console.log('string found ', data, t)

    return t
  }
  if (Array.isArray(data)) {
    return data.map(item => processBytesToString(item))
  }
  if (typeof data === 'object') {
    const result = {}
    for (const key of Object.keys(data)) {
      result[key] = processBytesToString(data[key])
    }
    return result
  }
  return data
}

// ============================================
// CONVERT NUMBERS TO HEX
// ============================================

function convertToHex(data) {
  if (data === null) return null
  if (typeof data === 'number') {
    // Convert to hex string representation
    if (Number.isInteger(data)) {
      if (data >= 0) {
        return '0x' + data.toString(16).toUpperCase()
      } else {
        // For negative, show unsigned interpretation
        return '0x' + (data >>> 0).toString(16).toUpperCase() + ' (-' + Math.abs(data) + ')'
      }
    }
    // Float - show as hex bytes representation
    const buf = new ArrayBuffer(8)
    const view = new DataView(buf)
    view.setFloat64(0, data)
    let hex = '0x'
    for (let i = 7; i >= 0; i--) {
      hex += view.getUint8(i).toString(16).toUpperCase().padStart(2, '0')
    }
    return hex
  }
  if (typeof data === 'boolean') return data
  if (typeof data === 'string') {
    // const t = data
    //   .split(',')
    //   .map(c => String.fromCharCode(c))
    //   .join('')
    // console.log('string found ', data, t)

    return data
  }
  if (Array.isArray(data)) {
    return data.map(item => convertToHex(item))
  }
  if (typeof data === 'object') {
    const result = {}
    for (const key of Object.keys(data)) {
      result[key] = convertToHex(data[key])
    }
    return result
  }
  return data
}

// ============================================
// MAIN APP
// ============================================

const SAMPLE_DATA = `data:application/octet-stream;base64,5wAAAOcAAACSzZIBze0ZkZHcFwCRzyUCAADRAAAAq3RiOjMzMTk0NTQ4rEVudmVsIEdyYW5hdKJTRQILzq2WmADNDQEtGc7lU54akc8nAAAA0QAAAM4HEBwAo09CVgCTzM7N4wHNNQGRz6OhfwXRAAAAzSwIznPRvQKSksyhznCr0mmSzW4Bzp/RvmncEgCSAhuSBAGSBQKSCQGSGQiSdwKSzJYBksygzJmSzKHMkZLMogqSzMEDkszUAZLNLAEBks1JAQKSzUsBAZLNUAEBks1uAQeSzqyQDQABqShVVEMtMTAwKZEB`

function App() {
  const [input, setInput] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [hexData, setHexData] = useState(null)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  const handleClear = () => {
    setDecoded(null)
    setHexData(null)
    setInput('')
  }

  const handleDecode = useCallback(() => {
    if (!input.trim()) {
      setError('Please enter a base64 string')
      setDecoded(null)
      setHexData(null)
      return
    }

    try {
      const result = decodeBase64(input)
      console.log(processBytesToString(result))
      setDecoded(result)
      setHexData(convertToHex(processBytesToString(result)))
      setError(null)
      setStats({
        items: Array.isArray(result) ? result.length : 1,
        size: input.length
      })
    } catch (e) {
      setError(e.message)
      setDecoded(null)
      setHexData(null)
      setStats(null)
    }
  }, [input])

  const handleCopyDecoded = () => {
    if (decoded) {
      navigator.clipboard.writeText(JSON.stringify(decoded, null, 2))
    }
  }

  const handleCopyHex = () => {
    if (hexData) {
      navigator.clipboard.writeText(JSON.stringify(hexData, null, 2))
    }
  }

  const handleLoadSample = () => {
    setInput(SAMPLE_DATA)
  }

  return (
    <div className='app'>
      <div className='header'>
        <h1>MsgPack Decoder</h1>
      </div>

      <div className='container'>
        <div className='panel'>
          <div className='panel-header'>
            Input (Base64)
            <button
              className='sample-btn'
              onClick={handleLoadSample}
              style={{ marginLeft: '16px' }}
            >
              Load Sample
            </button>
            <button className='sample-btn' onClick={handleDecode}>
              Decode
            </button>
            <button className='sample-btn' onClick={handleClear}>
              Clear
            </button>
          </div>
          <div className='panel-content'>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='Paste base64 data here...'
              spellCheck={false}
            />
          </div>
        </div>

        <div className='panel'>
          <div className='panel-header'>
            Decoded (JSON)
            {decoded && (
              <button className='copy-btn' onClick={handleCopyDecoded}>
                Copy
              </button>
            )}
          </div>
          <div className='panel-content'>
            {error && <div className='error'>{error}</div>}
            {decoded && (
              <div className='json-viewer'>
                <JsonView
                  value={processBytesToString(decoded)}
                  displayDataTypes={false}
                  style={githubDarkTheme}
                />
              </div>
            )}
          </div>
          {stats && <div className='stats'>Items: {stats.items}</div>}
        </div>

        <div className='panel'>
          <div className='panel-header'>
            Hex Values
            {hexData && (
              <button className='copy-btn' onClick={handleCopyHex}>
                Copy
              </button>
            )}
          </div>
          <div className='panel-content'>
            {error && <div className='error'>{error}</div>}
            {hexData && (
              <div className='json-viewer'>
                <JsonView value={hexData} displayDataTypes={false} style={vscodeTheme}>
                  <JsonView.String
                    render={({ children, ...reset }, { type, value, keyName }) => {
                      if (type === 'type') {
                        return <span />
                      }
                      if (type === 'value') {
                        if (value.startsWith('0x')) {
                          return <span>{children}</span>
                        }
                        return <span>"{children}"</span>
                      }
                    }}
                  />
                </JsonView>
              </div>
            )}
          </div>
          {stats && <div className='stats'>Numeric values as hex</div>}
        </div>
      </div>
    </div>
  )
}

export default App
