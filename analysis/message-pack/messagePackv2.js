class UltraFastDecoder {
  constructor() {
    this.off = 0
    this.buf = null
    this.view = null
    this.decoder = new TextDecoder()
    this.stringCache = new Map() // 🔥 Clave para el rendimiento
  }

  decode(buffer) {
    this.buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    if (this.buf.length < 4) {
      throw new Error(`Buffer too small: ${this.buf.length} bytes (need at least 4)`)
    }
    // Solo usamos DataView para Floats, el resto es manual
    this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength)
    this.off = 0
    return this.parse()
  }

  parse() {
    if (this.off >= this.buf.length) {
      // Si ya no hay más bytes, detenemos la ejecución
      return undefined
    }
    const byte = this.buf[this.off++]
    if (byte === undefined) return undefined

    // 1. Tipos Rápidos (Fixints, Fixmaps, Fixarrays, Fixstrs)
    if (byte <= 0x7f) return byte // Positive fixint
    if (byte >= 0xe0) return byte - 0x100 // Negative fixint

    if (byte >= 0xa0 && byte <= 0xbf) return this.readString(byte & 0x1f) // Fixstr
    if (byte >= 0x90 && byte <= 0x9f) return this.readArray(byte & 0x0f) // Fixarray
    //if (byte >= 0x80 && byte <= 0x8f) return this.readMap(byte & 0x0f) // Fixmap
    // --- INTERCEPCIÓN DEL TOKEN ---
    if (byte >= 0x80 && byte <= 0x8f) {
      const len = byte & 0x0f
      // Si el mapa tiene 12 items, es el Session Token
      if (len === 12) return this.readTokenAsUint8Array()
      return this.readMap(len)
    }

    // 2. Tipos Complejos
    switch (byte) {
      case 0xc0:
        return null
      case 0xc2:
        return false
      case 0xc3:
        return true

      // Enteros Little Endian Manuales (Mucho más rápido que DataView)
      case 0xcc:
        return this.buf[this.off++]
      case 0xcd: // uint 16 LE
        return this.buf[this.off++] | (this.buf[this.off++] << 8)
      case 0xce: // uint 32 LE
        return (
          (this.buf[this.off++] |
            (this.buf[this.off++] << 8) |
            (this.buf[this.off++] << 16) |
            (this.buf[this.off++] << 24)) >>>
          0
        )

      case 0xd1: // int 16 LE
        const i16 = this.buf[this.off++] | (this.buf[this.off++] << 8)
        return i16 > 0x7fff ? i16 - 0x10000 : i16
      case 0xd2: // int 32 LE
        return (
          this.buf[this.off++] |
          (this.buf[this.off++] << 8) |
          (this.buf[this.off++] << 16) |
          (this.buf[this.off++] << 24) |
          0
        )

      // Floats (Aquí sí usamos DataView, es complejo hacerlo a mano)
      case 0xca:
        const f32 = this.view.getFloat32(this.off, true)
        this.off += 4
        return f32
      case 0xcb:
        const f64 = this.view.getFloat64(this.off, true)
        this.off += 8
        return f64

      // Strings, Arrays y Mapas largos
      case 0xd9:
        return this.readString(this.buf[this.off++])
      case 0xda:
        return this.readString(this.readUInt16LE())
      case 0xdb:
        return this.readString(this.readUInt32LE())

      case 0xdc:
        return this.readArray(this.readUInt16LE())
      case 0xdd:
        return this.readArray(this.readUInt32LE())

      case 0xde:
        return this.readMap(this.readUInt16LE())
      case 0xdf:
        return this.readMap(this.readUInt32LE())

      case 0xc4:
        return this.readBinary(this.buf[this.off++])

      case 0xc5:
        return this.readBinary(this.readUInt16LE())
      case 0xc6:
        return this.readBinary(this.readUInt32LE())

      // ... puedes añadir el resto de casos siguiendo este patrón
    }
  }

  readUInt16LE() {
    return this.buf[this.off++] | (this.buf[this.off++] << 8)
  }

  readUInt32LE() {
    return (
      (this.buf[this.off++] |
        (this.buf[this.off++] << 8) |
        (this.buf[this.off++] << 16) |
        (this.buf[this.off++] << 24)) >>>
      0
    )
  }

  readString(len) {
    if (len === 0) return ''
    // Optimización: Verificamos si es un string pequeño para usar la caché
    if (len < 16) {
      const slice = this.buf.subarray(this.off, this.off + len)
      const key = slice.join(',') // Creamos una clave única por bytes
      if (this.stringCache.has(key)) {
        this.off += len
        return this.stringCache.get(key)
      }
      const str = this.decoder.decode(slice)
      this.stringCache.set(key, str)
      this.off += len
      return str
    }
    const str = this.decoder.decode(this.buf.subarray(this.off, this.off + len))
    this.off += len
    return str
  }

  readArray(len) {
    const arr = new Array(len)
    for (let i = 0; i < len; i++) arr[i] = this.parse()
    return arr
  }

  readTokenAsUint8Array() {
    const token = new Uint8Array(12)
    for (let i = 0; i < 12; i++) {
      this.parse() // Saltamos la llave (ej: "0")
      token[i] = this.parse() // Guardamos el valor directamente
    }
    return token
  }

  readMap(len) {
    const obj = {}
    for (let i = 0; i < len; i++) {
      const key = this.parse()
      obj[key] = this.parse()
    }
    return obj
  }

  readBinary(len) {
    const bin = this.buf.slice(this.off, this.off + len)
    this.off += len
    return bin
  }
}
