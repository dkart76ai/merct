export let staticIdDb = new Map()

const STATIC_DB_FILE = path.join(__dirname, 'staticId-db.json')

export function loadStaticDb() {
  try {
    if (fs.existsSync(STATIC_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATIC_DB_FILE, 'utf8'))
      staticIdDb = new Map(Object.entries(data))
      console.log(
        `[${new Date().toLocaleTimeString()}] Loaded ${staticIdDb.size} static IDs from database`
      )
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] No staticId-db.json found, starting fresh`)
    }
  } catch (e) {
    console.error('Error loading staticId-db:', e.message)
  }
}

export function saveStaticDb() {
  try {
    const data = Object.fromEntries(staticIdDb)
    fs.writeFileSync(STATIC_DB_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error saving staticId-db:', e.message)
  }
}

export function addOrUpdateStaticId(staticId, data) {
  const id = String(staticId)
  let updated = false

  if (!staticIdDb.has(id)) {
    staticIdDb.set(id, { staticId: parseInt(id), ...data })
    console.log(
      `[${new Date().toLocaleTimeString()}] New staticId: ${staticId} (${data.name || data.entryType || 'unknown'})`
    )
    updated = true
  } else {
    const existing = staticIdDb.get(id)
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && existing[key] === undefined) {
        existing[key] = value
        updated = true
      }
    }
  }

  if (updated) {
    saveStaticDb()
  }
}
