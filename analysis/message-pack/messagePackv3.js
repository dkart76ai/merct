class MsgPackTurboDecoder {
  constructor(buffer) {
    // Usamos el buffer original directamente para evitar copias
    const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    this.buf = src
    this.view = new DataView(src.buffer, src.byteOffset, src.byteLength)
    this.off = 0
    this.decoder = new TextDecoder()
    // Cachear strings de propiedades de mapas ahorra un 30-40% de CPU
    this.stringCache = new Map()
  }

  setBuffer(newBuffer) {
    // 1. Normalizar a Uint8Array
    const src = newBuffer instanceof Uint8Array ? newBuffer : new Uint8Array(newBuffer)

    // 2. Actualizar referencias
    this.buf = src

    // 3. REUTILIZAR o REASIGNAR el DataView
    // Es vital pasar el byteOffset y byteLength por si el buffer es un subarray
    this.view = new DataView(src.buffer, src.byteOffset, src.byteLength)

    // 4. Resetear el puntero
    this.off = 0

    // Opcional: ¿Limpiar el caché de strings?
    // Si el bot cambia de mapa o contexto, quizás quieras hacer:
    // if (this.stringCache.size > 1000) this.stringCache.clear();
  }

  decode() {
    if (this.off >= this.buf.length) return undefined
    const byte = this.buf[this.off++]

    // --- HOT PATH: Los casos más comunes primero ---
    if (byte <= 0x7f) return byte // fixint positivo
    if (byte >= 0xe0) return byte - 0x100 // fixint negativo
    if (byte >= 0xa0 && byte <= 0xbf) return this.readString(byte & 0x1f) // fixstr
    if (byte >= 0x90 && byte <= 0x9f) return this.readArray(byte & 0x0f) // fixarray
    // if (byte >= 0x80 && byte <= 0x8f) return this.readMap(byte & 0x0f) // fixmap
    if (byte >= 0x80 && byte <= 0x8f) {
      const len = byte & 0x0f
      // --- INTERCEPCIÓN DEL TOKEN ---
      // Si el mapa tiene 12 items, es el Session Token
      // if (len === 12) return this.readTokenAsUint8Array()
      return this.readMap(len)
    }

    // --- COLD PATH: Tipos extendidos y anchos ---
    switch (byte) {
      case 0xc0:
        return null
      case 0xc2:
        return false
      case 0xc3:
        return true

      // Enteros Unsigned
      case 0xcc:
        return this.buf[this.off++]
      case 0xd0:
        return this.view.getInt8(this.off++)

      case 0xcd: {
        const v = this.view.getUint16(this.off, true) // LE como pediste
        this.off += 2
        return v
      }
      case 0xd1: {
        const v = this.view.getInt16(this.off, true)
        this.off += 2
        return v
      }

      case 0xce: {
        const v = this.view.getUint32(this.off, true)
        this.off += 4
        return v
      }
      case 0xd2: {
        const v = this.view.getInt32(this.off, true)
        this.off += 4
        return v
      }

      case 0xca: {
        const v = this.view.getFloat32(this.off, true)
        this.off += 4
        return v
      }

      case 0xcf:
        return this.readUInt64Turbo()

      // Enteros Signed

      case 0xd3:
        return this.readInt64Turbo()

      // Floats

      case 0xcb: {
        const v = this.view.getFloat64(this.off, true)
        this.off += 8
        return v
      }

      // Strings largos
      case 0xd9:
        return this.readString(this.buf[this.off++])
      case 0xda: {
        const len = this.view.getUint16(this.off, true)
        this.off += 2
        return this.readString(len)
      }
      case 0xdb: {
        const len = this.view.getUint32(this.off, true)
        this.off += 4
        return this.readString(len)
      }

      // Binarios (Cero copia usando subarray)
      case 0xc4:
        return this.readBin(this.buf[this.off++])

      case 0xc5: {
        const len = this.view.getUint16(this.off, true)
        this.off += 2
        return this.readBin(len)
      }
      case 0xc6: {
        const len = this.view.getUint32(this.off, true)
        this.off += 4
        return this.readBin(len)
      }

      // Arrays y Mapas largos
      case 0xdc: {
        const len = this.view.getUint16(this.off, true)
        this.off += 2
        return this.readArray(len)
      }
      case 0xdd: {
        const len = this.view.getUint32(this.off, true)
        this.off += 4
        return this.readArray(len)
      }
      case 0xde: {
        const len = this.view.getUint16(this.off, true)
        this.off += 2
        return this.readMap(len)
      }
      case 0xdf: {
        const len = this.view.getUint32(this.off, true)
        this.off += 4
        return this.readMap(len)
      }

      // Extensiones (Fixext)
      case 0xd4:
        return this.readExt(1)
      case 0xd5:
        return this.readExt(2)
      case 0xd6:
        return this.readExt(4)
      case 0xd7:
        return this.readExt(8)
      case 0xd8:
        return this.readExt(16)
      case 0xc7:
        return this.readExt(this.buf[this.off++])
      case 0xc8: {
        const len = this.view.getUint16(this.off, true)
        this.off += 2
        return this.readExt(len)
      }
      case 0xc9: {
        const len = this.view.getUint32(this.off, true)
        this.off += 4
        return this.readExt(len)
      }
    }

    console.log(`Tipo no soportado: 0x${byte.toString(16)}`)
    return undefined
  }

  readUInt64Turbo() {
    const lo = this.view.getUint32(this.off, true)
    const hi = this.view.getUint32(this.off + 4, true)
    this.off += 8
    if (hi < 0x200000) return hi * 0x100000000 + lo
    return (BigInt(hi) << 32n) | BigInt(lo)
  }

  readInt64Turbo() {
    const lo = this.view.getUint32(this.off, true)
    const hi = this.view.getInt32(this.off + 4, true)
    this.off += 8
    // Safe integer range check
    if (hi < 0x200000 && hi >= -0x200000) return hi * 0x100000000 + lo
    return (BigInt(hi) << 32n) | BigInt(lo)
  }

  readString(len) {
    if (len === 0) return ''

    // Seguridad para evitar Heap Out of Memory
    if (this.stringCache.size > 5000) this.stringCache.clear()

    // Optimización: Cache de llaves de objetos para evitar TextDecoder
    if (len < 16) {
      const slice = this.buf.subarray(this.off, this.off + len)
      const key = slice.toString() // Forma rápida de generar llave de caché
      let str = this.stringCache.get(key)
      if (str === undefined) {
        str = this.decoder.decode(slice)
        this.stringCache.set(key, str)
      }
      this.off += len
      return str
    }
    const s = this.decoder.decode(this.buf.subarray(this.off, this.off + len))
    this.off += len
    return s
  }

  readArray(len) {
    const arr = new Array(len) // Pre-alojar mejora el rendimiento significativamente
    for (let i = 0; i < len; i++) arr[i] = this.decode()
    return arr
  }

  readTokenAsUint8Array() {
    const token = new Uint8Array(12)
    for (let i = 0; i < 12; i++) {
      this.decode() // Saltamos la llave (ej: "0")
      token[i] = Number(this.decode()) // Guardamos el valor directamente
    }
    return token
  }

  readMap(len) {
    const map = {}
    for (let i = 0; i < len; i++) {
      map[this.decode()] = this.decode()
    }
    return map
  }

  readBin(len) {
    const bin = this.buf.subarray(this.off, this.off + len)
    this.off += len
    return bin
  }

  readExt(len) {
    const type = this.view.getInt8(this.off++)
    const data = this.buf.subarray(this.off, this.off + len)
    this.off += len
    if (type === -1) return this.decodeTimestamp(data)
    return { type, data }
  }

  decodeTimestamp(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (data.length === 4) return new Date(view.getUint32(0, true) * 1000)
    if (data.length === 8) {
      const val = view.getBigUint64(0, true)
      return new Date(Number(val & 0x3fffffffn) * 1000 + Number(val >> 30n) / 1e6)
    }
    if (data.length === 12) {
      const nano = view.getUint32(0, true)
      const sec = view.getBigInt64(4, true)
      return new Date(Number(sec) * 1000 + nano / 1e6)
    }
    return data
  }
}

class MsgPackLazyDecoder extends MsgPackTurboDecoder {
  constructor(buffer) {
    super(buffer)
  }

  // Busca un camino específico, ej: [0, "data", "players", 5, "hp"]
  extractPath(path) {
    try {
      if (this.off >= this.buf.length) return undefined

      for (const key of path) {
        const byte = this.buf[this.off]

        // Si el punto actual es un Arreglo
        if ((byte >= 0x90 && byte <= 0x9f) || byte === 0xdc || byte === 0xdd) {
          const len = this.readArrayHeader()
          if (typeof key !== 'number' || key >= len) return undefined
          // Saltamos los elementos anteriores al índice que buscamos
          for (let i = 0; i < key; i++) this.skip()
        }
        // Si el punto actual es un Mapa
        else if ((byte >= 0x80 && byte <= 0x8f) || byte === 0xde || byte === 0xdf) {
          const len = this.readMapHeader()
          let found = false
          for (let i = 0; i < len; i++) {
            const currentKey = this.decode() // Las llaves suelen ser cortas, las decodificamos
            if (currentKey === key) {
              found = true
              break // Encontramos la llave, el cursor queda al inicio del valor
            } else {
              this.skip() // Saltamos el valor de la llave que no es
            }
          }
          if (!found) return undefined
        } else {
          return undefined // El camino no coincide con la estructura
        }
      }
      // Al terminar el camino, el cursor está en el dato exacto
      return this.decode()
    } catch (e) {
      return undefined
    }
  }

  // EL MOTOR: Salta el dato actual sin procesarlo
  skip2() {
    const byte = this.buf[this.off++]
    if (byte <= 0x7f || (byte >= 0xe0 && byte <= 0xff)) return // fixint
    if (byte >= 0xa0 && byte <= 0xbf) {
      this.off += byte & 0x1f
      return
    } // fixstr

    switch (byte) {
      case 0xc0:
      case 0xc2:
      case 0xc3:
        return // null, bool
      case 0xcc:
      case 0xd0:
        this.off += 1
        break // u8, i8
      case 0xcd:
      case 0xd1:
        this.off += 2
        break // u16, i16
      case 0xce:
      case 0xd2:
      case 0xca:
        this.off += 4
        break // u32, i32, f32
      case 0xcf:
      case 0xd3:
      case 0xcb:
        this.off += 8
        break // u64, i64, f64
      case 0xd9:
        this.off += this.buf[this.off++]
        break // str 8
      case 0xda: {
        const len = this.view.getUint16(this.off, true)
        this.off += len + 2
        break // str 16
      }
      case 0xdb: {
        const len = this.view.getUint32(this.off, true)
        this.off += len + 4
        break // str 32
      }
      case 0xc4: {
        const len = this.buf[this.off++]
        this.off += len

        break // bin 8
      }
      case 0xc5: {
        const len = this.view.getUint16(this.off, true)
        this.off += len + 2
        break // bin 16
      }
      case 0xc6: {
        const len = this.view.getUint32(this.off, true)
        this.off += len + 4
        break // bin 32
      }
      // Recursión controlada para estructuras anidadas
      case 0xdc: {
        let l = this.view.getUint16((this.off += 2) - 2, true)
        while (l--) this.skip()
        break
      }
      case 0xdd: {
        let l = this.view.getUint32((this.off += 4) - 4, true)
        while (l--) this.skip()
        break
      }
      case 0xde: {
        let l = this.view.getUint16((this.off += 2) - 2, true)
        while (l--) {
          this.skip()
          this.skip()
        }
        break
      }
      case 0xdf: {
        let l = this.view.getUint32((this.off += 4) - 4, true)
        while (l--) {
          this.skip()
          this.skip()
        }
        break
      }

      case 0xd4:
        this.off += 2
        break // fixext 1 (1 byte tipo + 1 byte data)
      case 0xd5:
        this.off += 3
        break // fixext 2 (1 + 2)
      case 0xd6:
        this.off += 5
        break // fixext 4 (1 + 4)
      case 0xd7:
        this.off += 9
        break // fixext 8 (1 + 8)
      case 0xd8:
        this.off += 17
        break // fixext 16 (1 + 16)

      case 0xc7: // ext 8
        this.off += this.buf[this.off++] + 1
        break
      case 0xc8: {
        // ext 16
        const len = this.view.getUint16(this.off, true)
        this.off += len + 3
        break
      }
      case 0xc9: {
        // ext 32
        const len = this.view.getUint32(this.off, true)
        this.off += len + 5 // len + 4 bytes len + 1 tipo
        break
      }
      default:
        if (byte >= 0x90 && byte <= 0x9f) {
          let l = byte & 0x0f
          while (l--) this.skip()
        } else if (byte >= 0x80 && byte <= 0x8f) {
          let l = byte & 0x0f
          while (l--) {
            this.skip()
            this.skip()
          }
        }
    }
  }

  skip() {
    let itemsToSkip = 1

    while (itemsToSkip > 0) {
      const byte = this.buf[this.off++]
      itemsToSkip--

      // Casos atómicos inmediatos
      if (byte <= 0x7f || (byte >= 0xe0 && byte <= 0xff)) continue
      if (byte >= 0xa0 && byte <= 0xbf) {
        this.off += byte & 0x1f
        continue
      }

      // Casos con switch
      switch (byte) {
        case 0xc0:
        case 0xc2:
        case 0xc3:
          continue
        case 0xcc:
        case 0xd0:
          this.off += 1
          continue
        case 0xcd:
        case 0xd1:
          this.off += 2
          continue
        case 0xce:
        case 0xd2:
        case 0xca:
          this.off += 4
          continue
        case 0xcf:
        case 0xd3:
        case 0xcb:
          this.off += 8
          continue

        case 0xd9:
        case 0xc4: {
          const len = this.buf[this.off++]
          this.off += len
          continue
        }
        case 0xda:
        case 0xc5: {
          const len = this.view.getUint16(this.off, true)
          this.off += len + 2

          continue
        }
        case 0xdb:
        case 0xc6: {
          const len = this.view.getUint32(this.off, true)
          this.off += len + 4
          continue
        }

        case 0xdc:
          itemsToSkip += this.view.getUint16(this.off, true)
          this.off += 2
          continue
        case 0xdd:
          itemsToSkip += this.view.getUint32(this.off, true)
          this.off += 4
          continue
        case 0xde:
          itemsToSkip += this.view.getUint16(this.off, true) * 2
          this.off += 2
          continue
        case 0xdf:
          itemsToSkip += this.view.getUint32(this.off, true) * 2
          this.off += 4
          continue

        case 0xd4:
          this.off += 2
          continue
        case 0xd5:
          this.off += 3
          continue
        case 0xd6:
          this.off += 5
          continue
        case 0xd7:
          this.off += 9
          continue
        case 0xd8:
          this.off += 17
          continue
        case 0xc7: {
          const len = this.buf[this.off++]
          this.off += len + 1 // len + 1 byte de tipo
          continue
        }
        case 0xc8: {
          const len = this.view.getUint16(this.off, true)
          this.off += len + 3
          continue
        }
        case 0xc9: {
          const len = this.view.getUint32(this.off, true)
          this.off += len + 5
          continue
        }

        default:
          // IMPORTANTE: Estos deben ser if/else independientes o estar dentro del switch
          if (byte >= 0x90 && byte <= 0x9f) {
            itemsToSkip += byte & 0x0f
          } else if (byte >= 0x80 && byte <= 0x8f) {
            itemsToSkip += (byte & 0x0f) * 2
          }
      }
    }
  }

  readArrayHeader() {
    const b = this.buf[this.off++]
    if (b >= 0x90 && b <= 0x9f) return b & 0x0f
    if (b === 0xdc) {
      const v = this.view.getUint16(this.off, true)
      this.off += 2
      return v
    }
    if (b === 0xdd) {
      const v = this.view.getUint32(this.off, true)
      this.off += 4
      return v
    }
    return 0
  }

  readMapHeader() {
    const b = this.buf[this.off++]
    if (b >= 0x80 && b <= 0x8f) return b & 0x0f
    if (b === 0xde) {
      const v = this.view.getUint16(this.off, true)
      this.off += 2
      return v
    }
    if (b === 0xdf) {
      const v = this.view.getUint32(this.off, true)
      this.off += 4
      return v
    }
    return 0
  }
}

class MsgPackTurboEncoder {
  constructor(initialSize = 1024 * 64) {
    this.buffer = new ArrayBuffer(initialSize)
    this.view = new DataView(this.buffer)
    this.u8 = new Uint8Array(this.buffer)
    this.off = 0
    this.encoder = new TextEncoder()
  }

  _ensure(len) {
    if (this.off + len > this.buffer.byteLength) {
      const newBuf = new ArrayBuffer(Math.max(this.buffer.byteLength * 2, this.off + len))
      new Uint8Array(newBuf).set(this.u8)
      this.buffer = newBuf
      this.view = new DataView(newBuf)
      this.u8 = new Uint8Array(newBuf)
    }
  }

  encode(val) {
    if (val === null || val === undefined) {
      this._ensure(1)
      this.u8[this.off++] = 0xc0
      return
    }

    const type = typeof val

    if (type === 'number') {
      if (!Number.isInteger(val)) {
        this._ensure(9)
        this.u8[this.off++] = 0xcb
        this.view.setFloat64(this.off, val, true)
        this.off += 8
        return
      }

      if (val >= 0) {
        if (val <= 127) {
          this._ensure(1)
          this.u8[this.off++] = val
        } else if (val <= 0xff) {
          this._ensure(2)
          this.u8[this.off++] = 0xcc
          this.u8[this.off++] = val
        } else if (val <= 0xffff) {
          this._ensure(3)
          this.u8[this.off++] = 0xcd
          this.view.setUint16(this.off, val, true)
          this.off += 2
        } else if (val <= 0xffffffff) {
          this._ensure(5)
          this.u8[this.off++] = 0xce
          this.view.setUint32(this.off, val, true)
          this.off += 4
        } else {
          // Enteros > 32 bits positivos
          this._ensure(9)
          this.u8[this.off++] = 0xcf
          this.view.setBigUint64(this.off, BigInt(val), true)
          this.off += 8
        }
      } else {
        // ENTEROS NEGATIVOS
        if (val >= -32) {
          this._ensure(1)
          this.u8[this.off++] = 0xe0 | (val + 32)
        } else if (val >= -128) {
          this._ensure(2)
          this.u8[this.off++] = 0xd0
          this.view.setInt8(this.off++, val)
        } else if (val >= -32768) {
          this._ensure(3)
          this.u8[this.off++] = 0xd1
          this.view.setInt16(this.off, val, true)
          this.off += 2
        } else if (val >= -2147483648) {
          this._ensure(5)
          this.u8[this.off++] = 0xd2
          this.view.setInt32(this.off, val, true)
          this.off += 4
        } else {
          // int64 negativo (0xd3)
          this._ensure(9)
          this.u8[this.off++] = 0xd3
          this.view.setBigInt64(this.off, BigInt(val), true)
          this.off += 8
        }
      }
      return
    }

    if (type === 'string') {
      const encoded = this.encoder.encode(val)
      const len = encoded.length
      if (len <= 31) {
        this._ensure(1 + len)
        this.u8[this.off++] = 0xa0 | len
      } else if (len <= 0xff) {
        this._ensure(2 + len)
        this.u8[this.off++] = 0xd9
        this.u8[this.off++] = len
      } else if (len <= 0xffff) {
        this._ensure(3 + len)
        this.u8[this.off++] = 0xda
        this.view.setUint16(this.off, len, true)
        this.off += 2
      } else {
        this._ensure(5 + len)
        this.u8[this.off++] = 0xdb
        this.view.setUint32(this.off, len, true)
        this.off += 4
      }
      this.u8.set(encoded, this.off)
      this.off += len
      return
    }

    if (type === 'boolean') {
      this._ensure(1)
      this.u8[this.off++] = val ? 0xc3 : 0xc2
      return
    }

    if (type === 'bigint') {
      this._ensure(9)
      // Decidir si usar unsigned (0xcf) o signed (0xd3)
      if (val >= 0n) {
        this.u8[this.off++] = 0xcf
        this.view.setBigUint64(this.off, val, true)
      } else {
        this.u8[this.off++] = 0xd3
        this.view.setBigInt64(this.off, val, true)
      }
      this.off += 8
      return
    }

    if (val instanceof Uint8Array) {
      const len = val.length
      if (len <= 0xff) {
        this._ensure(2 + len)
        this.u8[this.off++] = 0xc4
        this.u8[this.off++] = len
      } else if (len <= 0xffff) {
        this._ensure(3 + len)
        this.u8[this.off++] = 0xc5
        this.view.setUint16(this.off, len, true)
        this.off += 2
      } else {
        this._ensure(5 + len)
        this.u8[this.off++] = 0xc6
        this.view.setUint32(this.off, len, true)
        this.off += 4
      }
      this.u8.set(val, this.off)
      this.off += len
      return
    }

    if (Array.isArray(val)) {
      const len = val.length
      if (len <= 15) {
        this._ensure(1)
        this.u8[this.off++] = 0x90 | len
      } else if (len <= 0xffff) {
        this._ensure(3)
        this.u8[this.off++] = 0xdc
        this.view.setUint16(this.off, len, true)
        this.off += 2
      } else {
        this._ensure(5)
        this.u8[this.off++] = 0xdd
        this.view.setUint32(this.off, len, true)
        this.off += 4
      }
      for (let i = 0; i < len; i++) this.encode(val[i])
      return
    }

    if (val instanceof Date) {
      const ms = val.getTime()
      this._ensure(10)
      this.u8[this.off++] = 0xd7
      this.u8[this.off++] = 0xff // -1 signed int8
      const sec = Math.floor(ms / 1000)
      const nsec = (ms % 1000) * 1e6
      const val64 = (BigInt(nsec) << 30n) | BigInt(sec)
      this.view.setBigUint64(this.off, val64, true) // Spec: TS siempre BE
      this.off += 8
      return
    }

    if (type === 'object') {
      const keys = Object.keys(val)
      const len = keys.length
      if (len <= 15) {
        this._ensure(1)
        this.u8[this.off++] = 0x80 | len
      } else if (len <= 0xffff) {
        this._ensure(3)
        this.u8[this.off++] = 0xde
        this.view.setUint16(this.off, len, true)
        this.off += 2
      } else {
        this._ensure(5)
        this.u8[this.off++] = 0xdf
        this.view.setUint32(this.off, len, true)
        this.off += 4
      }
      for (let i = 0; i < len; i++) {
        this.encode(keys[i])
        this.encode(val[keys[i]])
      }
    }
  }

  getBuffer() {
    return this.u8.subarray(0, this.off)
  }
  reset() {
    this.off = 0
  }
}

module.exports = {
  MsgPackTurboDecoder,
  MsgPackLazyDecoder,
  MsgPackTurboEncoder
}
