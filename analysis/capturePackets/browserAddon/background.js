// Background service worker for TotalBattle Object Scanner

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle_popup') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleScanner' })
      }
    })
  }
})

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'fetchObjects') {
    fetchObjectsFromServer(request.config, sendResponse)
    return true
  }
  if (request.action === 'saveSettings') {
    chrome.storage.local.set({ settings: request.settings }, function () {
      sendResponse({ success: true })
    })
    return true
  }
  if (request.action === 'loadSettings') {
    chrome.storage.local.get(['settings'], function (result) {
      sendResponse({ settings: result.settings || {} })
    })
    return true
  }
  if (request.action === 'SEND_TO_DISCORD') {
    const webhookURL =
      'https://discord.com/api/webhooks/1488525756945530930/h6SCHnETUmtx9jHYrbkIspRVGbGaH8_1_mDi3iaXFPLMe7UW0jsQPBWnjSU9S4T1ACfl' // Pega aquí tu URL
    console.log('request.data todisco', request.data)
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

    return true // Importante para que la respuesta sea asíncrona
  }
})

async function fetchObjectsFromServer(config, sendResponse) {
  try {
    var apiUrl = config.serverUrl || 'http://localhost:3001'
    var res = await fetch(apiUrl + '/api/objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    var data = await res.json()
    sendResponse(data)
  } catch (err) {
    sendResponse({ success: false, error: err.message })
  }
}

console.log('TotalBattle Object Scanner background loaded')
