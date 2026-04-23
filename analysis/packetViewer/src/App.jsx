import React, { useState, useEffect } from 'react'
import { MsgPackLazyDecoder } from 'message-pack'
import { Decoder } from '@msgpack/msgpack'
import { Virtuoso } from 'react-virtuoso'
// import JsonView from 'react18-json-view'
// import 'react18-json-view/src/dark.css'
import { decodeMulti } from '@msgpack/msgpack'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'

function multiDecodeMsgPack2(buff, decodeAll = false) {
  if (!buff || buff.length === 0) {
    console.warn('multiDecodeMsgPack2: Empty buffer received')
    return { results: [], bufLen: 0, len: 0 }
  }

  if (buff.length < 8) {
    console.warn('multiDecodeMsgPack2: Buffer too small for header:', buff.length, 'bytes')
    return { results: [], bufLen: 0, len: 0 }
  }

  const decoder = new MsgPackLazyDecoder(buff)

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

function getRequestHeader(buffer) {
  const decoder = new MsgPackLazyDecoder(buffer)

  decoder.off = 8 //skip packet length

  decoder.readArrayHeader() // Entra al primer nivel [...]

  const opCode = decoder.decode() // Lee 312 (off se mueve solo)
  const sequence = decoder.decode() // Lee 26

  decoder.readArrayHeader() // Entra al bloque [[id], token]

  decoder.readArrayHeader() // Entra al mini-array [id]
  const userId = decoder.decode() // Lee el BigInt/Number

  // Ahora el cursor está exactamente al inicio del Token
  // Tu decode() ya detectará que es un binario (0xc4/c5/c6)
  // y llamará a readBin (que usa subarray)
  const token = decoder.decode()

  return { opCode, userId, token }
}

export default function LogAnalyzer() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState('')
  const [packets, setPackets] = useState([])
  const [packet, setPacket] = useState([])
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

      // const decoder = new Decoder()
      // // const items = decoder.decodeStream(response.body)
      // const stream = decoder.decodeStream(response.body)

      // for await (const pair of stream) {
      //   // Decodificamos el JSON interno que mencionaste
      //   console.log('Pair: ', pair)
      //   const decodedPair = {
      //     id: pair.ts,
      //     // request: decode(pair.req),
      //     // response: decode(pair.res)
      //     url: pair.url,
      //     request: multiDecodeMsgPackBase64(pair.req, decodeAll),
      //     response: multiDecodeMsgPackBase64(pair.res, decodeAll)
      //   }

      //   // Actualizamos la lista de paquetes
      //   setPackets(prev => [...prev, decodedPair])

      const arrayBuffer = await response.arrayBuffer() // Obtenemos el archivo completo
      const uint8Array = new Uint8Array(arrayBuffer)

      // decodeMulti devuelve un iterable con todos los objetos del buffer
      const allPairs = [...decodeMulti(uint8Array)]

      console.log(`Se encontraron ${allPairs.length} paquetes.`)

      const decodedPackets = allPairs.map((pair, i) => {
        const { opCode: opCode } = getRequestHeader(pair.req)
        return {
          i,
          opCode,
          ts: pair.ts,
          url: pair.url,
          request: multiDecodeMsgPack2(pair.req, decodeAll),
          response: multiDecodeMsgPack2(pair.res, decodeAll)
        }
      })

      setPackets(decodedPackets)
      console.log(decodedPackets)
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
      <input type='checkbox' checked={decodeAll} onChange={e => setDecodeAll(e.target.checked)} />

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
      <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', height: '90vh' }}>
        <div
          style={{
            flexGrow: 1,
            maxWidth: '300px',
            backgroundColor: '#000',
            border: '1px solid #ccc',
            borderRadius: '8px'
          }}
        >
          <Virtuoso
            style={{ height: '100%' }}
            data={packets}
            itemContent={(index, packet) => (
              <div
                style={{
                  padding: '15px',
                  borderBottom: '1px solid #eee'
                }}
                onClick={() => setPacket(packet)}
              >
                <strong>
                  📦 {packet.opCode} - <small>{new Date(packet.ts).toLocaleTimeString()}</small>
                </strong>
              </div>
            )}
          />
        </div>
        <div>
          {packet && (
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#007bff' }}>Request:</p>
                {packet.request && <JsonView src={packet.request} style={darkTheme} />}
              </div>
              {/* <div style={{ flex: 1 }}>
                <p style={{ color: '#28a745' }}>Response:</p>
                {packet.response && <JsonView src={packet.response} style={darkTheme} />}
              </div> */}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
