const api = typeof browser !== 'undefined' ? browser : chrome

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchObjects') {
    fetch(`${request.config.serverUrl}/api/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.config)
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, objects: data.objects }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true // Mantiene el canal abierto para el fetch
  }

  if (request.action === 'SEND_TO_DISCORD') {
    console.log('background.js', request.data)
    const webhook =
      'https://discord.com/api/webhooks/1488525756945530930/h6SCHnETUmtx9jHYrbkIspRVGbGaH8_1_mDi3iaXFPLMe7UW0jsQPBWnjSU9S4T1ACfl'
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: request.data })
    })
      .then(() => sendResponse({ status: 'ok' }))
      .catch(() => sendResponse({ status: 'error' }))
    return true
  }

  if (request.action === 'sendCoords') {
    api.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) api.tabs.sendMessage(tabs[0].id, request)
    })
  }
})

// 1. Escuchar atajos de teclado configurados en el Manifest
api.commands.onCommand.addListener(command => {
  if (command === 'toggle_popup') {
    api.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        api.tabs.sendMessage(tabs[0].id, { action: 'toggleScanner' })
      }
    })
  }
})
