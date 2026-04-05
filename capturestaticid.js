// Intercept Sendbird WebSocket to capture coord messages
;(function () {
  const STORAGE_KEY = 'captured_coords'

  // load existing captures
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  console.log('Loaded', Object.keys(existing).length, 'existing captures')

  const OriginalWS = window.WebSocket
  window.WebSocket = class extends OriginalWS {
    constructor(url, protocols) {
      super(url, protocols)
      if (!url.includes('sendbird')) return

      this.addEventListener('message', event => {
        if (!event.data.startsWith('MESG')) return
        try {
          const json = JSON.parse(event.data.slice(4))
          if (!json.data) return

          const data = JSON.parse(json.data)
          if (!data.subs) return

          // extract all coord entries
          for (const [key, sub] of Object.entries(data.subs)) {
            if (sub.type !== 'coord') continue

            const entry = {
              staticId: sub.staticId,
              entryType: sub.entryType,
              name: sub.name,
              x: sub.x,
              y: sub.y,
              realmId: sub.realmId,
              message: json.message,
              sender: json.user?.nickname || json.user?.guest_id,
              ts: new Date().toISOString()
            }

            // use staticId as key to deduplicate
            const mapKey = `${sub.staticId}_${sub.entryType}`
            if (!existing[mapKey]) {
              existing[mapKey] = entry
              localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
              console.log(
                `📍 Captured staticId:${sub.staticId} entryType:${sub.entryType} name:"${sub.name}"`
              )
            }
          }
        } catch {}
      })
    }
  }

  console.log('✅ Coord interceptor active — chat messages with coordinates will be captured')
  console.log('Run dump() to export all captures')

  // window.dump = () => {
  //   const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  //   const json = JSON.stringify(data, null, 2)
  //   navigator.clipboard.writeText(json).then(() => {
  //     console.log('✅ Copied to clipboard!')
  //   })
  //   console.log('=== CAPTURED COORDS ===')
  //   console.table(Object.values(data))
  //   console.log('JSON:', JSON.stringify(data, null, 2))
  //   return data
  // }

  window.dump = () => {
    const data = JSON.parse(localStorage.getItem('captured_coords') || '{}')
    const json = JSON.stringify(data, null, 2)
    const ta = document.createElement('textarea')
    ta.value = json
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    console.table(Object.values(data))
    console.log('✅ Copied to clipboard!')
    return data
  }

  window.clearCaptures = () => {
    localStorage.removeItem(STORAGE_KEY)
    console.log('Cleared all captures')
  }
})()
// to put back on localstorage is deleted,
//localStorage.setItem('captured_coords', JSON.stringify(data))

/**
 *
 *


Usage:

Paste in devtools console while game is open

As people share coordinate links in chat, they get captured automatically

Run dump() to see all captured staticIds

Run clearCaptures() to reset

The key insight is using staticId_entryType as the dedup key — so each unique type of location is only stored once. Over time you'll build up a map of all staticIds like:

2_user    → player city
400_poi   → mercenary exchange
6_tile    → tile

 */
