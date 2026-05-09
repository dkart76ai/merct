import React, { useState, useCallback, useMemo } from 'react'
import JsonView from '@uiw/react-json-view'
import { githubDarkTheme } from '@uiw/react-json-view/githubDark'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
const { MsgPackTurboDecoder, MsgPackLazyDecoder, MsgPackTurboEncoder } = require('message-pack')

// ============================================
// CONVERT NUMBERS TO HEX
// ============================================
let decoder = null
let encoder = null

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

function decodeBase64(base64String) {
  let cleanBase64 = base64String.replace(/\s/g, '')
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1]
  }

  const binaryString = atob(cleanBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes
}

function encodeBase64(buffer) {
  const b64 = btoa(String.fromCharCode(...buffer))
  return b64
}
function getDecoder(buffer) {
  if (decoder) {
    decoder.setBuffer(buffer)
    decoder.off = 0 // Reset offset to beginning
    return decoder
  }

  decoder = new MsgPackLazyDecoder(buffer)
  return decoder
}

function getEncoder(buffer) {
  if (encoder) {
    encoder.reset() //set offset to 0
    return encoder
  }

  encoder = new MsgPackTurboEncoder(buffer)
  return encoder
}
function multiDecodeMsgPack2(buff, decodeAll = false) {
  if (!buff || buff.length === 0) {
    console.warn('multiDecodeMsgPack2: Empty buffer received')
    return { results: [], bufLen: 0, len: 0 }
  }

  if (buff.length < 8) {
    console.warn('multiDecodeMsgPack2: Buffer too small for header:', buff.length, 'bytes')
    return { results: [], bufLen: 0, len: 0 }
  }

  const decoder = getDecoder(buff)

  // 2. Leemos los dos enteros del encabezado (4 buff cada uno)
  // Usamos getUint32. El primero está en offset 0, el segundo en offset 4.
  const longitud1 = decoder.view.getUint32(0, true) // Offset 0
  const longitud2 = decoder.view.getUint32(4, true) // Offset 4

  // console.log(`Longitudes del encabezado: ${longitud1}, ${longitud2}, buff.len=`, buff.length)

  decoder.off = 8 // Saltamos tu encabezado

  const results = []
  try {
    while (decoder.off < decoder.buf.length) {
      // console.log('Decodificando en offset:', decoder.off)
      if (!decodeAll) {
        if (decoder.off >= longitud2) break
      }
      const data = decoder.decode()
      if (data !== undefined) {
        results.push(data)
      }
    }
  } catch (err) {
    console.error('multiDecodeMsgPack2: Error en offset ' + decoder.off + ':', err.message)
    // Inspecciona los bytes cercanos al error
    console.log(
      'multiDecodeMsgPack2: Bytes problemáticos:',
      buff.slice(decoder.off, decoder.off + 10)
    )
  }

  // console.log(results) // Aquí tienes todo el contenido
  return { results, bufLen: longitud1, len: longitud2 }
}

function multiDecodeMsgPackBase64(base64String, decodeAll = false) {
  try {
    const bytes = decodeBase64(base64String)

    return multiDecodeMsgPack2(bytes, decodeAll)
  } catch (e) {
    throw new Error('Failed to decode: ' + e.message)
  }
}

function encodeMsgPack2MultiFragments(fragmentos = [], len = null) {
  if (!Array.isArray(fragmentos)) {
    console.error('json dont have a wrapping []')
    return
  }
  const encoder = getEncoder()

  encoder.off = 8

  fragmentos.forEach(obj => {
    encoder.encode(obj)
  })

  const finalBuf = encoder.getBuffer()
  const view = new DataView(finalBuf.buffer)

  const totalLength = finalBuf.length
  const msgpackPayloadLength = len ? len : totalLength - 8

  view.setUint32(0, totalLength, true)
  view.setUint32(4, msgpackPayloadLength, true)

  return finalBuf
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
  const [encodeInput, setEncodeInput] = useState('')
  const [encodedOutput, setEncodedOutput] = useState('')
  const [encodedOutputB64, setEncodedOutputB64] = useState('')
  const [encodeError, setEncodeError] = useState(null)
  const [decodeAll, setDecodeAll] = useState(false)

  const handleClear = () => {
    setDecoded(null)
    setHexData(null)
    setInput('')
  }

  const handleEncodeClear = () => {
    setEncodeInput('')
    setEncodedOutput('')
    setEncodedOutputB64('')
    setEncodeError(null)
  }

  const handleEncode = useCallback(() => {
    if (!encodeInput.trim()) {
      setEncodeError('Please enter JSON data')
      setEncodedOutput('')
      setEncodedOutputB64('')
      return
    }

    try {
      const data = JSON.parse(encodeInput)

      const encoded = encodeMsgPack2MultiFragments(data)

      const encodedB64 = encodeBase64(encoded)
      setEncodedOutput(encoded)
      setEncodedOutputB64(encodedB64)
      setEncodeError(null)
    } catch (e) {
      setEncodeError('Invalid JSON: ' + e.message)
      setEncodedOutput('')
      setEncodedOutputB64('')
    }
  }, [encodeInput])

  const handleLoadEncodedSample = () => {
    if (decoded) {
      setEncodeInput(JSON.stringify(decoded))
    }
  }

  const handleCopyEncoded = () => {
    if (encodedOutput) {
      navigator.clipboard.writeText(encodedOutput)
    }
  }
  const handleCopyEncodedB64 = () => {
    if (encodedOutputB64) {
      navigator.clipboard.writeText(encodedOutputB64)
    }
  }

  const handleDecode = useCallback(() => {
    if (!input.trim()) {
      setError('Please enter a base64 string')
      setDecoded(null)
      setHexData(null)
      return
    }

    try {
      let decoded = multiDecodeMsgPackBase64(input, decodeAll)

      setDecoded(decoded.results)
      setHexData(convertToHex(decoded.results))
      setError(null)
      setStats({
        items: Array.isArray(decoded) ? decoded.length : 1,
        size: input.length
      })
    } catch (e) {
      setError(e.message)
      setDecoded(null)
      setHexData(null)
      setStats(null)
    }
  }, [input, decodeAll])

  const handleCopyDecoded = () => {
    if (decoded) {
      navigator.clipboard.writeText(
        JSON.stringify(
          decoded,
          (key, value) => (typeof value === 'bigint' ? value.toString() : value),
          2
        )
      )
    }
  }

  const handleCopyHex = () => {
    if (hexData) {
      navigator.clipboard.writeText(
        JSON.stringify(
          hexData,
          (key, value) => (typeof value === 'bigint' ? value.toString() : value),
          2
        )
      )
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
            <label>
              {' '}
              Full decode (include garbage)
              <input type='checkbox' checked={decodeAll} onChange={e => setDecodeAll(!decodeAll)} />
            </label>
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

        <div className='panel-result'>
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
                  <JsonView value={decoded} displayDataTypes={false} style={githubDarkTheme} />
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

        <div className='panel'>
          <div className='panel-header'>
            Encoder (JSON to MsgPack){' '}
            <span style={{ fontSize: 12, color: 'pink' }}>
              orignal messagepack dont use a external [] wrap, here its using it to be able to
              handle it with javascript
            </span>
          </div>
          <div className='panel-content'>
            <textarea
              value={encodeInput}
              onChange={e => setEncodeInput(e.target.value)}
              placeholder='Enter JSON data to encode...'
              spellCheck={false}
              style={{
                width: '100%',
                height: '100px',
                background: '#1e1e1e',
                color: '#d4d4d4',
                border: 'none',
                padding: '10px',
                fontFamily: 'monospace'
              }}
            />
          </div>
          <div style={{ padding: '10px', display: 'flex', gap: '8px' }}>
            <button className='sample-btn' onClick={handleEncode}>
              Encode
            </button>
            <button className='sample-btn' onClick={handleLoadEncodedSample} disabled={!decoded}>
              Use Decoded
            </button>
            <button className='sample-btn' onClick={handleEncodeClear}>
              Clear
            </button>
          </div>
          {encodeError && (
            <div className='error' style={{ padding: '10px' }}>
              {encodeError}
            </div>
          )}
          {encodedOutput && (
            <>
              <div style={{ padding: '10px' }}>
                <div style={{ marginBottom: '8px', color: '#569cd6' }}>Encoded MsgPack:</div>
                <div style={{ marginBottom: '8px', color: '#569cd6' }}>
                  [total length (4 bytes)][msgpack length (4 bytes)][msgpack data]
                </div>
                <textarea
                  value={encodedOutput}
                  readOnly
                  style={{
                    width: '100%',
                    height: '60px',
                    background: '#1e1e1e',
                    color: '#4ec9b0',
                    border: 'none',
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
                <button
                  className='copy-btn'
                  onClick={handleCopyEncoded}
                  style={{ marginTop: '8px' }}
                >
                  Copy
                </button>
              </div>
              <div style={{ padding: '10px' }}>
                <div style={{ marginBottom: '8px', color: '#569cd6' }}>Encoded Base64:</div>
                <textarea
                  value={encodedOutputB64}
                  readOnly
                  style={{
                    width: '100%',
                    height: '60px',
                    background: '#1e1e1e',
                    color: '#4ec9b0',
                    border: 'none',
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
                <button
                  className='copy-btn'
                  onClick={handleCopyEncodedB64}
                  style={{ marginTop: '8px' }}
                >
                  Copy
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
