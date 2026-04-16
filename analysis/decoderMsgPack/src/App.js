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
  encodeBase64,
  decodeBase64,
  decodeMsgPack2
} from 'message-pack'
import staticIdDB from './staticId-db.json'
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
  const [objects, setObjects] = useState(null)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [encodeInput, setEncodeInput] = useState('')
  const [encodedOutput, setEncodedOutput] = useState('')
  const [encodedOutputB64, setEncodedOutputB64] = useState('')
  const [encodeError, setEncodeError] = useState(null)

  function extractObjects(data) {
    const objects = []

    function isValidObject(arr) {
      if (!Array.isArray(arr) || arr.length !== 12) return false
      if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false
      if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false
      if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false
      if (typeof arr[11] !== 'boolean') return false
      return true
    }

    function findObjects(arr, depth = 0) {
      console.log('findobjects: depth', depth)
      if (depth > 200) return
      for (const item of arr) {
        if (Array.isArray(item)) {
          if (isValidObject(item)) {
            const staticId = item[1]
            const known = staticIdDB[staticId]
            const obj = {
              objectId: item[0][0],
              staticId: staticId,
              name: known?.name || null,
              level: known?.level || null,
              entryType: known?.entryType || null,
              unk1: item[2],
              unk2: item[3],
              unk3: item[4],
              level: item[5],
              unk4: item[6],
              unk5: item[7],
              kingdom: item[8][0],
              x: item[8][1],
              y: item[8][2],
              unk6: item[9][0],
              extra: item[10],
              isActive: item[11]
            }
            objects.push(obj)
            console.log('objeto encontrado:', obj.staticId, obj.name)
          } else {
            findObjects(item, depth + 1)
          }
        }
      }
    }

    findObjects(data)
    return objects
  }

  const handleGetObject = () => {
    if (!decoded) return
    console.log('extracting objects from', decoded)
    const obj = extractObjects(decoded)
    setObjects(obj)
  }

  const handleClear = () => {
    setDecoded(null)
    setHexData(null)
    setInput('')
    setObjects(null)
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
      const encoded = encodeMsgPack2MultiFragments([data])
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
      setEncodeInput(decoded.map(d => JSON.stringify(d)).join(''))
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

      setDecoded(result.results)
      setHexData(convertToHex(result.results))
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
            <button className='sample-btn' onClick={handleClear}>
              Clear
            </button>
            <button className='sample-btn' onClick={handleGetObject} disabled={!decoded}>
              Search for objects
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

          <div className='panel'>
            <div className='panel-header'>Objects</div>
            <div className='panel-content'>
              {objects && (
                <div className='json-viewer'>
                  <JsonView value={objects} displayDataTypes={false} style={githubDarkTheme} />
                </div>
              )}
            </div>
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
