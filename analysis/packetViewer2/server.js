const express = require('express')
const fs = require('fs')
const path = require('path')
const { createStream } = require('rotating-file-stream')
// const msgpack = require('@msgpack/msgpack')
// const { Decoder } = require('@msgpack/msgpack')
const app = express()
const LOGS_DIR = path.join(__dirname, '../capturePackets/logs')

// 1. Configurar el stream de escritura (Binario y Rotativo)
// const logStream = createStream('traffic.bin', {
//   size: '10M', // Rota cada 10MB para que sean fáciles de descargar
//   interval: '1d', // O cada día
//   path: LOGS_DIR
// })

// Función para guardar el par (Llamada desde tu lógica de red)
// function saveTrafficPair(reqBuffer, resBuffer) {
//   const pair = {
//     ts: Date.now(),
//     req: reqBuffer, // Buffer original de MessagePack
//     res: resBuffer // Buffer original de MessagePack
//   }

//   // Serializamos el par completo
//   const encoded = msgpack.encode(pair)
//   logStream.write(encoded)
// }

// 2. Endpoint para que React vea qué archivos hay
app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(LOGS_DIR)) return res.json([])
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.bin'))
  res.json(files)
})

// 3. Endpoint para enviar el archivo a React (Streaming puro)
app.get('/api/logs/:filename', (req, res) => {
  const filePath = path.join(LOGS_DIR, req.params.filename)
  if (!fs.existsSync(filePath)) return res.status(404).send('Archivo no encontrado')

  res.setHeader('Content-Type', 'application/octet-stream')
  const readStream = fs.createReadStream(filePath)
  readStream.pipe(res) // Los datos fluyen del disco a la red sin tocar la RAM
})

app.listen(4000, () => console.log('Servidor de logs en puerto 4000'))
//test
// ;(async () => {
//   const filePath = path.join(LOGS_DIR, '20260423-1048-01-traffic.bin')
//   console.log(filePath)
//   const stream = fs.createReadStream(filePath)
//   // for await (const data of decodeAsync(stream)) {
//   //   console.log('Leído con éxito:', data.url)
//   // }

//   const decoder = new Decoder()

//   // decodeArrayStream o decodeStream son los métodos para múltiples objetos
//   const items = decoder.decodeStream(stream)

//   for await (const data of items) {
//     console.log('Leído con éxito:', data.url)
//   }
// })()
