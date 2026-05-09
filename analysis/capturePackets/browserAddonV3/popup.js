const api = typeof browser !== 'undefined' ? browser : chrome

;(function () {
  'use strict'
  let myPosition = { x: 448, y: 480 }

  // Render inicial de la interfaz
  function init() {
    const container = document.getElementById('filtersContainer')
    container.innerHTML = `
      <div class="slider-row">
        <input type="text" id="search" placeholder="Search...">
        <button class="btn" id="searchBtn">Search</button>
         <button id="getVillageL25">8 villages lvl 25</button>
          <button id="getCryptL20">8 crypts lvl 20</button>
               <button id="getCryptL25">8 crypts lvl 25</button>
      </div>
      <div class="slider-row">
        <label>Level:</label>
        <input type="number" id="minLevel" value="1" min="1" max="45">
        <span>-</span>
        <input type="number" id="maxLevel" value="45" min="1" max="45">
      </div>
      <div class="server-row">
        <input type="text" id="serverUrl" value="http://localhost:3001">
      </div>
    `

    api.storage.local.get(['lastSearch'], result => {
      if (result.lastSearch) {
        document.getElementById('search').value = result.lastSearch
      }
    })
    const searchInput = document.getElementById('search')

    searchInput.addEventListener('input', () => {
      api.storage.local.set({ lastSearch: searchInput.value })
    })

    document.getElementById('searchBtn').addEventListener('click', searchObjects)
    document.getElementById('closeBtn').addEventListener('click', () => {
      window.parent.postMessage('close-scanner', '*')
    })
    document.getElementById('getVillageL25').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 villa lvl 25' })
    })
    document.getElementById('getCryptL20').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 crypt lvl 20' })
    })
    document.getElementById('getCryptL25').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 crypt lvl 25' })
    })
  }

  async function searchObjects() {
    const statusText = document.getElementById('statusText')
    statusText.textContent = 'Searching...'

    const config = {
      serverUrl: document.getElementById('serverUrl').value,
      minLevel: parseInt(document.getElementById('minLevel').value),
      maxLevel: parseInt(document.getElementById('maxLevel').value),
      search: document.getElementById('search').value,
      playerX: myPosition.x,
      playerY: myPosition.y
    }

    api.runtime.sendMessage({ action: 'fetchObjects', config }, response => {
      if (response && response.success) {
        renderList(response.objects)
        statusText.textContent = 'Done'
      } else {
        statusText.textContent = 'Error: ' + (response?.error || 'Server down')
      }
    })
  }

  function renderList(objects) {
    const container = document.getElementById('listContainer')
    container.innerHTML = objects
      .map(
        obj => `
      <div class="list-item">
        <div class="info">
          <div class="name">${obj.name || 'Unknown'}</div>
          <div class="meta">Lv.${obj.level} | X:${obj.x} Y:${obj.y}</div>
        </div>
        <button class="go-btn" data-key="${obj.key}">GO</button>
      </div>
    `
      )
      .join('')

    container.querySelectorAll('.go-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key
        console.log('popup.js', key)
        api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#sendMelon ' + key })
        api.runtime.sendMessage({ action: 'sendCoords', key: key })
      })
    })
  }

  init()
})()
