const api = typeof browser !== 'undefined' ? browser : chrome
let scannerFrame = null

// 1. Escuchar mensajes del Background
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleScanner') {
    toggleScanner()
    sendResponse({ status: 'done' })
  }

  if (request.action === 'sendCoords') {
    console.log('[Scanner] Recibidas coordenadas para navegar:', request.key)
    // Aquí puedes añadir la lógica para mover el mapa del juego si es necesario
    sendResponse({ success: true })
  }
})

// 2. Función para crear o mostrar/ocultar el iframe
function toggleScanner() {
  if (scannerFrame) {
    // Si ya existe, simplemente alternamos visibilidad
    const isHidden = scannerFrame.style.display === 'none'
    scannerFrame.style.display = isHidden ? 'block' : 'none'
  } else {
    // Si no existe, lo creamos
    scannerFrame = document.createElement('iframe')
    scannerFrame.id = 'tb-scanner-frame'
    // Importante: usar api.runtime.getURL para cargar el archivo interno
    scannerFrame.src = api.runtime.getURL('popup.html')

    // Estilos para que flote sobre el juego
    scannerFrame.style.cssText = `
    all: initial !important;
  display: block !important;
  position: fixed !important;
  top: 50px !important;
  right: 20px !important;
  width: 620px !important;
  min-width: 620px !important; /* Añade esta línea */
  height: 600px !important;
  min-height: 600px !important; /* Añade esta línea */
  box-sizing: border-box !important; /* Añade esta línea */
  border: 2px solid #569cd6 !important;
  z-index: 2147483647 !important; /* Máximo valor posible */
`
    document.body.appendChild(scannerFrame)
  }
}

// 3. Escuchar el cierre desde el botón dentro del Iframe (vía postMessage)
window.addEventListener('message', event => {
  if (event.data === 'close-scanner') {
    if (scannerFrame) scannerFrame.style.display = 'none'
  }
})

// 4. Atajo de teclado (Ctrl + Shift + Y)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'Y') {
    e.preventDefault()
    toggleScanner()
  }
})

console.log('[Scanner] Content script cargado y listo.')
