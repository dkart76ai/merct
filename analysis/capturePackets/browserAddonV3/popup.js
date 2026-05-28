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

      </div>
      <div class="slider-row">
           <button id="getVillageL25">villages lvl 25</button>
          <button id="getCryptL20">crypts lvl 20</button>
          <button id="getCryptL25">crypts lvl 25</button>
             <button id="getRareCryptL15">rare crypts lvl 15</button>
          <button id="getCitadelL15">citadel lvl 15</button>
          <button id="getCitadelCL20">cursed citadel lvl 20</button>
          <button id="getRaidRunicL25">raid runic lvl 25</button>
          <button id="getWellspring5">wellspring lvl 5</button>
          <button id="getdragonmound5">dragonmound lvl 5</button>
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
    // localstorage
    api.storage.local.get(['lastSearch'], result => {
      if (result.lastSearch) {
        document.getElementById('search').value = result.lastSearch
      }
    })
    const searchInput = document.getElementById('search')

    searchInput.addEventListener('input', () => {
      api.storage.local.set({ lastSearch: searchInput.value })
    })
    //------
    api.storage.local.get(['lastMinLevel'], result => {
      if (result.lastMinLevel) {
        document.getElementById('minLevel').value = result.lastMinLevel
      }
    })
    const minLevelInput = document.getElementById('minLevel')

    minLevelInput.addEventListener('input', () => {
      api.storage.local.set({ lastMinLevel: minLevelInput.value })
    })
    //------
    api.storage.local.get(['lastMaxLevel'], result => {
      if (result.lastMaxLevel) {
        document.getElementById('maxLevel').value = result.lastMaxLevel
      }
    })
    const maxLevelInput = document.getElementById('maxLevel')

    maxLevelInput.addEventListener('input', () => {
      api.storage.local.set({ lastMaxLevel: maxLevelInput.value })
    })
    //------
    api.storage.local.get(['lastServerUrl'], result => {
      if (result.lastServerUrl) {
        document.getElementById('serverUrl').value = result.lastServerUrl
      }
    })
    const serverUrlInput = document.getElementById('serverUrl')

    serverUrlInput.addEventListener('input', () => {
      api.storage.local.set({ lastServerUrl: serverUrlInput.value })
    })
    //------

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
    document.getElementById('getRareCryptL15').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 rare crypt lvl 15' })
    })
    document.getElementById('getCryptL25').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 crypt lvl 25' })
    })
    document.getElementById('getCitadelL15').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 %citadel lvl 15' })
    })
    document.getElementById('getCitadelCL20').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 cursed%citadel lvl 20' })
    })
    document.getElementById('getRaidRunicL25').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 raid runic lvl 25' })
    })
    document.getElementById('getWellspring5').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 wellspring lvl 5' })
    })
    document.getElementById('getdragonmound5').addEventListener('click', () => {
      api.runtime.sendMessage({ action: 'SEND_TO_DISCORD', data: '#find 10 dragon lvl 5' })
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
