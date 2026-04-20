import React, { useState, useEffect } from 'react'
import { multiDecodeMsgPackBase64 } from 'message-pack'
import { decodeAsync, decode } from '@msgpack/msgpack'
import { Virtuoso } from 'react-virtuoso'
import JsonView from 'react18-json-view'
import 'react18-json-view/src/dark.css'

export default function LogAnalyzer() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState('')
  const [packets, setPackets] = useState([])
  const [loading, setLoading] = useState(false)
  const [decodeAll, setDecodeAll] = useState(false)

  // 1. Obtener la lista de archivos disponibles
  useEffect(() => {
    fetch('http://localhost:4000/api/logs')
      .then(res => res.json())
      .then(setFiles)
  }, [])

  // 2. Procesar el archivo por streaming
  const handleFileChange = async e => {
    const filename = e.target.value
    if (!filename) return

    setSelectedFile(filename)
    setLoading(true)
    setPackets([]) // Limpiar vista anterior

    try {
      const response = await fetch(`http://localhost:4000/api/logs/${filename}`)

      // decodeAsync maneja el stream automáticamente
      const generator = await decodeAsync(response.body)

      for await (const pair of generator) {
        // Decodificamos el JSON interno que mencionaste
        const decodedPair = {
          id: pair.ts,
          // request: decode(pair.req),
          // response: decode(pair.res)
          request: multiDecodeMsgPackBase64(requestBody, decodeAll),
          response: multiDecodeMsgPackBase64(requestBody, decodeAll)
        }

        // Actualizamos la lista de paquetes
        setPackets(prev => [...prev, decodedPair])
      }
    } catch (err) {
      console.error('Error leyendo el stream:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        fontFamily: 'sans-serif'
      }}
    >
      <h2>Analizador de Paquetes MessagePack</h2>

      <div style={{ marginBottom: '20px' }}>
        <select onChange={handleFileChange} value={selectedFile}>
          <option value=''>-- Selecciona un archivo --</option>
          {files.map(f => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        {loading && <span style={{ marginLeft: '10px' }}>Cargando stream...</span>}
      </div>

      <div style={{ flexGrow: 1, border: '1px solid #ccc', borderRadius: '8px' }}>
        <Virtuoso
          style={{ height: '100%' }}
          data={packets}
          itemContent={(index, packet) => (
            <div
              style={{
                padding: '15px',
                borderBottom: '1px solid #eee',
                backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'white'
              }}
            >
              <strong>
                📦 Paquete #{index + 1} - <small>{new Date(packet.id).toLocaleTimeString()}</small>
              </strong>

              <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#007bff' }}>Request:</p>
                  <JsonView src={packet.request} collapsed={1} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#28a745' }}>Response:</p>
                  <JsonView src={packet.response} collapsed={1} />
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  )
}
