import { useState, useEffect } from 'react'
import JsonView from '@uiw/react-json-view'
import { githubDarkTheme } from '@uiw/react-json-view/githubDark'

import { multiDecodeMsgPackBase64 } from 'message-pack'

function App() {
  const [packets, setPackets] = useState([])
  const [selectedPacket, setSelectedPacket] = useState(null)
  const [decodedRequest, setDecodedRequest] = useState([null])
  const [decodedResponse, setDecodedResponse] = useState(null)

  const [error, setError] = useState(null)
  const [decodeAll, setDecodeAll] = useState(true)

  useEffect(() => {
    // Decode request body
    const requestBody = selectedPacket?.request?.bodyB64
    if (requestBody) {
      const decodedRequest = multiDecodeMsgPackBase64(requestBody, decodeAll)
      setDecodedRequest(decodedRequest)
    }

    // Decode response body
    const responseBody = selectedPacket?.response?.bodyB64
    if (responseBody) {
      const decodedResponse = multiDecodeMsgPackBase64(responseBody, decodeAll)
      setDecodedResponse(decodedResponse)
    }
  }, [selectedPacket, decodeAll])

  const handleFileLoad = e => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = event => {
      try {
        const data = JSON.parse(event.target.result)
        const packetArray = Array.isArray(data) ? data : [data]
        setPackets(packetArray)
        setSelectedPacket(null)
        setError(null)
      } catch (err) {
        setError('Invalid JSON file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleSelectPacket = packet => {
    setSelectedPacket(packet)
    setError(null)
  }

  return (
    <div className='app'>
      <div className='header'>
        <h1>Packet Viewer</h1>
        <div style={{ color: 'green' }}>
          <span style={{ fontSize: '8px;', fontStyle: 'bold' }}>JSON file content</span>
          <p style={{ color: '#eee', fontSize: '10px' }}>
            <pre>
              <p style={{ margin: '0' }}>{`[ { status, opCode, url, id,`}</p>
              <p style={{ margin: '0' }}>{`request:{ method, bodyB64},`}</p>
              <p style={{ margin: '0' }}>{`response:{ bodyB64 }} ]`}</p>
            </pre>
          </p>
        </div>
      </div>

      <div className='toolbar'>
        <label className='btn'>
          Load JSON File
          <input type='file' accept='.json' onChange={handleFileLoad} style={{ display: 'none' }} />
        </label>
        <span style={{ color: '#888', fontSize: '12px' }}>
          {packets.length > 0 ? `${packets.length} packets loaded` : 'No file loaded'}
        </span>
      </div>
      <div className='config'>
        <label>Decode all</label>
        <input type='checkbox' checked={decodeAll} onChange={e => setDecodeAll(e.target.checked)} />
      </div>

      <div className='main-container'>
        {/* Left Panel - Packet List */}
        <div className='packet-list'>
          <div className='list-header'>Packets</div>
          <div className='list-content'>
            {packets.length === 0 ? (
              <div className='empty-state'>Load a JSON file to view packets</div>
            ) : (
              packets.map((packet, index) => (
                <div
                  key={packet.id || index}
                  className={`packet-item ${selectedPacket?.id === packet.id ? 'selected' : ''}`}
                  onClick={() => handleSelectPacket(packet)}
                >
                  <div className='url'>{packet.url}</div>
                  <div className='meta'>
                    <span className='opCode'>Op: {packet.opCode}</span>
                    <span>(resp.size: {packet.response.bodyB64.length || ''})</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Packet Details */}
        <div className='detail-panel'>
          {error && <div className='error'>{error}</div>}

          {!selectedPacket ? (
            <div className='empty-state'>Select a packet to view details</div>
          ) : (
            <div className='detail-content'>
              {/* Request Section */}
              <div className='detail-section'>
                <div className='section-header'>REQUEST</div>
                <div className='section-content'>
                  <div style={{ marginBottom: '10px', color: '#888', fontSize: '12px' }}>
                    <strong>Method:</strong> {selectedPacket.request?.method}
                  </div>
                  <div style={{ marginBottom: '10px', color: '#888', fontSize: '12px' }}>
                    <strong>URL:</strong> {selectedPacket.url}
                  </div>
                  <div
                    style={{
                      maxHeight: '200px',
                      scroll: 'auto',
                      overflow: 'auto',
                      wordWrap: 'anywhere',
                      marginBottom: '10px',
                      color: '#888',
                      fontSize: '12px'
                    }}
                  >
                    <span>
                      <strong>packet:</strong> {selectedPacket.request?.bodyBufferB64}
                    </span>
                  </div>

                  <div className='json-viewer'>
                    {!decodedRequest ? (
                      <div style={{ color: 'red' }}>No data</div>
                    ) : (
                      <JsonView
                        value={decodedRequest}
                        displayDataTypes={false}
                        style={githubDarkTheme}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Response Section */}
              <div className='detail-section'>
                <div className='section-header'>RESPONSE</div>
                <div className='section-content'>
                  <div
                    style={{
                      maxHeight: '200px',
                      scroll: 'auto',
                      overflow: 'auto',
                      wordWrap: 'anywhere',
                      marginBottom: '10px',
                      color: '#888',
                      fontSize: '12px'
                    }}
                  >
                    <span>
                      <strong>packet:</strong> {selectedPacket.response?.bodyB64}
                    </span>
                  </div>

                  <div className='json-viewer'>
                    {!decodedResponse ? (
                      <div style={{ color: 'red' }}>No data</div>
                    ) : (
                      <JsonView
                        value={decodedResponse}
                        displayDataTypes={false}
                        style={githubDarkTheme}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
