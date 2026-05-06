// Background service worker for TotalBattle Object Scanner

// 1. Uso de promesas (async/await) para mayor limpieza
chrome.commands.onCommand.addListener(async command => {
  if (command === 'toggle_popup') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleScanner' }).catch(err => {
        console.log('El script de contenido aún no está listo o la página no es compatible.')
      })
    }
  }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchObjects') {
    fetchObjectsFromServer(request.config, sendResponse)
    return true // Mantiene el canal abierto para respuesta asíncrona
  }

  if (request.action === 'saveSettings') {
    chrome.storage.local.set({ settings: request.settings }).then(() => {
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === 'loadSettings') {
    chrome.storage.local.get(['settings']).then(result => {
      sendResponse({ settings: result.settings || {} })
    })
    return true
  }

  if (request.action === 'SEND_TO_DISCORD') {
    const webhookURL =
      'https://discord.com/api/webhooks/1488525756945530930/h6SCHnETUmtx9jHYrbkIspRVGbGaH8_1_mDi3iaXFPLMe7UW0jsQPBWnjSU9S4T1ACfl'

    fetch(webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: request.data })
    })
      .then(response => {
        if (response.ok) sendResponse({ status: 'ok' })
        else sendResponse({ status: 'error', code: response.status })
      })
      .catch(error => sendResponse({ status: 'error', message: error.message }))

    return true
  }
})

async function fetchObjectsFromServer(config, sendResponse) {
  try {
    const apiUrl = config.serverUrl || 'http://localhost:3001'
    const res = await fetch(apiUrl + '/api/objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    const data = await res.json()
    sendResponse(data)
  } catch (err) {
    sendResponse({ success: false, error: err.message })
  }
}

console.log('TotalBattle Object Scanner background loaded')
