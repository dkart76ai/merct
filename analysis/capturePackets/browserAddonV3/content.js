// Content script for TotalBattle Object Scanner
// Injects UI into the game page and handles in-game messaging

;(function () {
  'use strict'

  var scannerOpen = false
  var scannerFrame = null

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'toggleScanner') {
      toggleScanner()
      sendResponse({ open: scannerOpen })
    }
    if (request.action === 'sendCoords') {
      sendGameMessage(request.key)
      sendResponse({ success: true })
    }
  })

  function toggleScanner() {
    scannerOpen = !scannerOpen
    if (scannerOpen) {
      showScanner()
    } else {
      hideScanner()
    }
  }

  function showScanner() {
    if (scannerFrame) {
      scannerFrame.style.display = 'block'
      return
    }
    scannerFrame = document.createElement('iframe')
    scannerFrame.id = 'tb-scanner-frame'
    scannerFrame.src = chrome.runtime.getURL('popup.html')
    scannerFrame.style.cssText =
      'position:fixed;top:50px;right:20px;width:620px;height:600px;border:2px solid #569cd6;border-radius:8px;z-index:999999;background:#1e1e1e;box-shadow:0 0 20px rgba(0,0,0,0.5);'
    document.body.appendChild(scannerFrame)

    // Close button inside iframe message
    window.addEventListener('message', function (e) {
      if (e.data === 'close-scanner') {
        hideScanner()
      }
      if (e.data.action === 'navigate-to') {
        sendGameMessage(e.data.key)
      }
    })
  }

  function hideScanner() {
    scannerOpen = false
    if (scannerFrame) {
      scannerFrame.style.display = 'none'
    }
  }

  // Dentro de content.js, mejora esta función:
  function sendGameMessage(key) {
    console.log('Enviando comando:', key)

    // Usamos el API de promesas de Chrome
    chrome.runtime
      .sendMessage({
        action: 'SEND_TO_DISCORD',
        data: '#sendMelon ' + key
      })
      .then(response => {
        if (response && response.status === 'ok') {
          console.log('✅ Notificación enviada a Discord')
        } else {
          console.error('❌ Error al notificar:', response)
        }
      })
      .catch(error => {
        console.error('❌ Error de conexión con el background:', error)
      })
  }

  // Add keyboard shortcut listener on the page
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'Y') {
      e.preventDefault()
      toggleScanner()
    }
  })

  console.log('[Scanner] Content script loaded')
})()
