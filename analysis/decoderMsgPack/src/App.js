import React, { useState, useCallback, useMemo } from 'react'
import JsonView from '@uiw/react-json-view'
import { githubDarkTheme } from '@uiw/react-json-view/githubDark'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
import {
  decodeMsgPackBase64,
  multiDecodeMsgPackBase64,
  multiDecodeMsgPack2,
  encodeMsgPack2,
  encodeMsgPack2MultiFragments,
  decodeBase64,
  decodeMsgPack2
} from '../../common/messagePack'

// ============================================
// MSGPACK DECODER (browser-compatible)
// ============================================
const Quote = JsonView.Quote

// ============================================
// MSGPACK ENCODER
// ============================================

function encodeValue(value) {
  const chunks = []

  function writeUint8(val) {
    chunks.push(val)
  }

  function writeUint16BE(val) {
    chunks.push((val >> 8) & 0xff)
    chunks.push(val & 0xff)
  }

  function writeUint32BE(val) {
    chunks.push((val >> 24) & 0xff)
    chunks.push((val >> 16) & 0xff)
    chunks.push((val >> 8) & 0xff)
    chunks.push(val & 0xff)
  }

  function writeBytes(arr) {
    for (const b of arr) {
      chunks.push(b)
    }
  }

  function writeFloat32(val) {
    const buf = new ArrayBuffer(4)
    new DataView(buf).setFloat32(0, val, false)
    for (let i = 0; i < 4; i++) {
      chunks.push(new DataView(buf).getUint8(i))
    }
  }

  function writeFloat64(val) {
    const buf = new ArrayBuffer(8)
    new DataView(buf).setFloat64(0, val, false)
    for (let i = 0; i < 8; i++) {
      chunks.push(new DataView(buf).getUint8(i))
    }
  }

  function encode(val) {
    if (val === null) {
      writeUint8(0xc0)
    } else if (val === false) {
      writeUint8(0xc2)
    } else if (val === true) {
      writeUint8(0xc3)
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        if (val >= 0) {
          if (val < 0x80) {
            writeUint8(val)
          } else if (val < 0x100) {
            writeUint8(0xcc)
            writeUint8(val)
          } else if (val < 0x10000) {
            writeUint8(0xcd)
            writeUint16BE(val)
          } else if (val < 0x100000000) {
            writeUint8(0xce)
            writeUint32BE(val)
          } else if (val < 0x10000000000000000) {
            writeUint8(0xcf)
            for (let i = 0; i < 8; i++) {
              chunks.push((BigInt(val) >> BigInt(i * 8)) & 0xffn)
            }
          } else {
            writeFloat64(val)
          }
        } else {
          if (val >= -0x20) {
            writeUint8(val)
          } else if (val >= -0x80) {
            writeUint8(0xd0)
            writeUint8(val + 256)
          } else if (val >= -0x8000) {
            writeUint8(0xd1)
            writeUint16BE(val + 65536)
          } else if (val >= -0x80000000) {
            writeUint8(0xd2)
            writeUint32BE(val + 4294967296)
          } else if (val >= -0x8000000000000000) {
            writeUint8(0xd3)
            const v = BigInt(val)
            for (let i = 0; i < 8; i++) {
              chunks.push((v >> BigInt(i * 8)) & 0xffn)
            }
          } else {
            writeFloat64(val)
          }
        }
      } else {
        writeUint8(0xcb)
        writeFloat64(val)
      }
    } else if (typeof val === 'string') {
      const bytes = new TextEncoder().encode(val)
      const len = bytes.length
      if (len < 0x20) {
        writeUint8(0xa0 | len)
        writeBytes(bytes)
      } else if (len < 0x100) {
        writeUint8(0xd9)
        writeUint8(len)
        writeBytes(bytes)
      } else if (len < 0x10000) {
        writeUint8(0xda)
        writeUint16BE(len)
        writeBytes(bytes)
      } else {
        writeUint8(0xdb)
        writeUint32BE(len)
        writeBytes(bytes)
      }
    } else if (Array.isArray(val)) {
      const len = val.length
      if (len < 0x10) {
        writeUint8(0x90 | len)
      } else if (len < 0x10000) {
        writeUint8(0xdc)
        writeUint16BE(len)
      } else {
        writeUint8(0xdd)
        writeUint32BE(len)
      }
      for (const item of val) {
        encode(item)
      }
    } else if (typeof val === 'object') {
      const keys = Object.keys(val)
      const len = keys.length
      if (len < 0x10) {
        writeUint8(0x80 | len)
      } else if (len < 0x10000) {
        writeUint8(0xde)
        writeUint16BE(len)
      } else {
        writeUint8(0xdf)
        writeUint32BE(len)
      }
      for (const key of keys) {
        encode(key)
        encode(val[key])
      }
    } else if (val instanceof Uint8Array) {
      const len = val.length
      if (len < 0x100) {
        writeUint8(0xc4)
        writeUint8(len)
      } else if (len < 0x10000) {
        writeUint8(0xc5)
        writeUint16BE(len)
      } else {
        writeUint8(0xc6)
        writeUint32BE(len)
      }
      writeBytes(val)
    }
  }

  encode(value)
  return new Uint8Array(chunks)
}

function encodeToBase64(data) {
  const bytes = encodeValue(data)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ============================================
// OPCODE 312 REQUEST BUILDER
// ============================================

const HEADER_312 = new Uint8Array([0x71, 0x00, 0x00, 0x00, 0x30, 0x00, 0x00, 0x00])

function writeUint16LE(val, chunks) {
  chunks.push(val & 0xff)
  chunks.push((val >> 8) & 0xff)
}

function writeUint64LE(val, chunks) {
  const v = BigInt(val)
  for (let i = 0; i < 8; i++) {
    chunks.push(Number((v >> BigInt(i * 8)) & 0xffn))
  }
}

function buildOpCode312Request(opCode, seqNum, playerObjId, playerExtData, tileIds, tileVals) {
  const chunks = []

  chunks.push(...HEADER_312)

  chunks.push(0x94)

  chunks.push(0xcd)
  writeUint16LE(opCode, chunks)

  if (seqNum < 0x80) {
    chunks.push(seqNum)
  } else {
    chunks.push(0xcc)
    chunks.push(seqNum & 0xff)
  }

  chunks.push(0x92)
  chunks.push(0x91)
  chunks.push(0xcf)
  writeUint64LE(playerObjId, chunks)

  chunks.push(0xc4)
  chunks.push(0x0c)
  chunks.push(0x69)
  for (let i = 0; i < 12; i++) {
    chunks.push(playerExtData[i] || 0)
  }

  chunks.push(0xa0)

  chunks.push(0x94)
  chunks.push(0x91)
  chunks.push(0x90 | Math.min(tileIds.length, 15))
  for (const tileId of tileIds) {
    chunks.push(0xcd)
    writeUint16LE(tileId, chunks)
  }

  chunks.push(0x91)
  chunks.push(0x90 | Math.min(tileVals.length, 15))
  for (const val of tileVals) {
    if (val < 0x80) {
      chunks.push(val)
    } else {
      chunks.push(0xcc)
      chunks.push(val & 0xff)
    }
  }

  chunks.push(0x90)
  chunks.push(0x90)

  return new Uint8Array(chunks)
}

function encodeOpCode312Request(opCode, seqNum, playerObjId, playerExtData, tileIds, tileVals) {
  const bytes = buildOpCode312Request(opCode, seqNum, playerObjId, playerExtData, tileIds, tileVals)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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
  const [encodeInput, setEncodeInput] = useState('')
  const [encodedOutput, setEncodedOutput] = useState('')
  const [encodeError, setEncodeError] = useState(null)

  const [op312OpCode, setOp312OpCode] = useState(312)
  const [op312SeqNum, setOp312SeqNum] = useState(100)
  const [op312PlayerId, setOp312PlayerId] = useState('1309965043442')
  const [op312TileIds, setOp312TileIds] = useState('2285')
  const [op312ExtData, setOp312ExtData] = useState('69dd4b7dab5ab7c72318eb2fa0')
  const [op312Output, setOp312Output] = useState('')
  const [op312Error, setOp312Error] = useState(null)

  const handleClear = () => {
    setDecoded(null)
    setHexData(null)
    setInput('')
  }

  const handleEncode = useCallback(() => {
    if (!encodeInput.trim()) {
      setEncodeError('Please enter JSON data')
      setEncodedOutput('')
      return
    }

    try {
      const data = JSON.parse(encodeInput)
      const encoded = encodeToBase64(data)
      setEncodedOutput(encoded)
      setEncodeError(null)
    } catch (e) {
      setEncodeError('Invalid JSON: ' + e.message)
      setEncodedOutput('')
    }
  }, [encodeInput])

  const handleLoadEncodedSample = () => {
    if (decoded) {
      setEncodeInput(JSON.stringify(decoded, null, 2))
    }
  }

  const handleCopyEncoded = () => {
    if (encodedOutput) {
      navigator.clipboard.writeText(encodedOutput)
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
      //let result = decodeMsgPackBase64(input)
      const bytes = decodeBase64(input)
      let result = multiDecodeMsgPackBase64(input)
      // let result = decodeMsgPack2(bytes)
      console.log('decoded result', result)

      // const test = encodeMsgPack2(result)
      const test = encodeMsgPack2MultiFragments(result.results, result.len)
      // console.log('test reencode', test)
      console.log('original encoded len', bytes.length)
      console.log('original encoded', [...bytes].map(n => n.toString()).join(' ,'))
      console.log('test reencode   ', [...test].map(n => n.toString()).join(' ,'))
      let result2 = multiDecodeMsgPack2(test)
      console.log('otra vez decoded', result2)
      console.log('match', JSON.stringify([...bytes]) === JSON.stringify([...test]))

      setDecoded(result)
      setHexData(convertToHex(result))
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

  const handleBuildOp312Request = () => {
    try {
      const tileIds = op312TileIds
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n))
      if (tileIds.length === 0) {
        setOp312Error('Please enter valid tile IDs')
        setOp312Output('')
        return
      }

      let playerId = BigInt(op312PlayerId)
      if (playerId < 0n) playerId = BigInt(Number(op312PlayerId))

      const extHex = op312ExtData.replace(/\s/g, '')
      const extBytes = new Uint8Array(12)
      for (let i = 0; i < 12 && i * 2 < extHex.length; i++) {
        extBytes[i] = parseInt(extHex.substr(i * 2, 2), 16)
      }

      const tileVals = tileIds.map(() => 0)

      const output = encodeOpCode312Request(
        op312OpCode,
        op312SeqNum,
        playerId,
        extBytes,
        tileIds,
        tileVals
      )

      setOp312Output(output)
      setOp312Error(null)
    } catch (e) {
      setOp312Error('Error: ' + e.message)
      setOp312Output('')
    }
  }

  const handleLoadSample312 = () => {
    setOp312OpCode(312)
    setOp312SeqNum(24)
    setOp312PlayerId('1309965043442')
    setOp312TileIds('2285')
    setOp312ExtData('69dd4b7dab5ab7c72318eb2fa0')
  }

  const handleCopyOp312 = () => {
    if (op312Output) {
      navigator.clipboard.writeText(op312Output)
    }
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
          <div className='panel-header'>Encoder (JSON to MsgPack)</div>
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
          </div>
          {encodeError && (
            <div className='error' style={{ padding: '10px' }}>
              {encodeError}
            </div>
          )}
          {encodedOutput && (
            <div style={{ padding: '10px' }}>
              <div style={{ marginBottom: '8px', color: '#569cd6' }}>Encoded Base64:</div>
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
              <button className='copy-btn' onClick={handleCopyEncoded} style={{ marginTop: '8px' }}>
                Copy
              </button>
            </div>
          )}
        </div>

        <div className='panel'>
          <div className='panel-header'>OpCode 312 Request Builder (Total Battle Map Objects)</div>
          <div className='panel-content'>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                padding: '10px'
              }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#569cd6' }}>
                  opCode
                </label>
                <input
                  type='number'
                  value={op312OpCode}
                  onChange={e => setOp312OpCode(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid #3c3c3c',
                    padding: '5px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#569cd6' }}>
                  seqNum
                </label>
                <input
                  type='number'
                  value={op312SeqNum}
                  onChange={e => setOp312SeqNum(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid #3c3c3c',
                    padding: '5px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#569cd6' }}>
                  playerObjId
                </label>
                <input
                  type='text'
                  value={op312PlayerId}
                  onChange={e => setOp312PlayerId(e.target.value)}
                  placeholder='1309965043442'
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid #3c3c3c',
                    padding: '5px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#569cd6' }}>
                  tileIds (comma-separated)
                </label>
                <input
                  type='text'
                  value={op312TileIds}
                  onChange={e => setOp312TileIds(e.target.value)}
                  placeholder='2285, 2334, 2335'
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid #3c3c3c',
                    padding: '5px'
                  }}
                />
              </div>
            </div>
            <div style={{ padding: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#569cd6' }}>
                playerExtData (24 hex bytes, no spaces)
              </label>
              <input
                type='text'
                value={op312ExtData}
                onChange={e => setOp312ExtData(e.target.value)}
                placeholder='69dd4b7dab5ab7c72318eb2fa0'
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  border: '1px solid #3c3c3c',
                  padding: '5px',
                  fontFamily: 'monospace'
                }}
              />
            </div>
            <div style={{ padding: '10px', display: 'flex', gap: '8px' }}>
              <button className='sample-btn' onClick={handleBuildOp312Request}>
                Build Request
              </button>
              <button className='sample-btn' onClick={handleLoadSample312}>
                Load Sample
              </button>
            </div>
            {op312Error && (
              <div className='error' style={{ padding: '10px' }}>
                {op312Error}
              </div>
            )}
            {op312Output && (
              <div style={{ padding: '10px' }}>
                <div style={{ marginBottom: '8px', color: '#569cd6' }}>Request Base64:</div>
                <textarea
                  value={op312Output}
                  readOnly
                  style={{
                    width: '100%',
                    height: '80px',
                    background: '#1e1e1e',
                    color: '#4ec9b0',
                    border: 'none',
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
                <div style={{ marginTop: '8px', color: '#569cd6' }}>Hex:</div>
                <div
                  style={{
                    background: '#1e1e1e',
                    color: '#4ec9b0',
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    wordBreak: 'break-all'
                  }}
                >
                  {op312Output &&
                    btoa(op312Output)
                      .match(/.{1,2}/g)
                      ?.map((pair, i) => (i > 0 && i % 8 === 0 ? '\n' + pair : pair))
                      .join(' ')}
                </div>
                <button className='copy-btn' onClick={handleCopyOp312} style={{ marginTop: '8px' }}>
                  Copy
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
