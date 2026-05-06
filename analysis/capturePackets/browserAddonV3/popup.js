;(function () {
  'use strict'

  var allObjects = []
  var myPosition = { x: 448, y: 480 }

  // ---- Close button ----
  document.getElementById('closeBtn').addEventListener('click', function () {
    if (window.parent !== window) {
      window.parent.postMessage('close-scanner', '*')
    } else {
      window.close()
    }
  })

  // ---- Render filters  ----
  function renderFilters() {
    var container = document.getElementById('filtersContainer')

    var html = ''

    // search input
    html += '<div class="slider-row">'
    html += '<input type="text" id="search" />'
    html += '<button class="btn" id="searchBtn">Search</button>'
    html += '</div>'

    // Level slider row
    html += '<div class="slider-row">'
    html += '<label>Level:</label>'
    html += '<input type="number" id="minLevel" min="1" max="45" value="1">'
    html += '<span class="val" id="minLevelVal">1</span>'
    html += '<span style="color:#555">-</span>'
    html += '<input type="number" id="maxLevel" min="1" max="45" value="45">'
    html += '<span class="val" id="maxLevelVal">45</span>'
    html += '</div>'

    // Server URL + Search button
    html += '<div class="server-row">'
    html +=
      '<input type="text" id="serverUrl" placeholder="http://localhost:3001" value="http://localhost:3001">'

    html += '</div>'

    container.innerHTML = html

    // Search button
    document.getElementById('searchBtn').addEventListener('click', searchObjects)
  }

  // ---- Search objects from server ----
  async function searchObjects() {
    var serverUrl = document.getElementById('serverUrl')
    var url = serverUrl ? serverUrl.value : 'http://localhost:3001'
    var statusText = document.getElementById('statusText')
    var countText = document.getElementById('countText')

    statusText.textContent = 'Searching...'
    document.getElementById('listContainer').innerHTML = '<div class="empty-msg">Loading...</div>'

    var search = document.getElementById('search')

    var minLevel = document.getElementById('minLevel')
    var maxLevel = document.getElementById('maxLevel')
    var minL = minLevel ? parseInt(minLevel.value) : 1
    var maxL = maxLevel ? parseInt(maxLevel.value) : 45

    try {
      var res = await fetch(url + '/api/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minLevel: minL,
          maxLevel: maxL,
          search: search.value,
          playerX: myPosition.x,
          playerY: myPosition.y
        })
      })
      var data = await res.json()
      if (data.success && data.objects) {
        allObjects = data.objects
        renderList(allObjects)
        statusText.textContent = 'Done'
        countText.textContent = allObjects.length + ' objects'
      } else {
        statusText.textContent = 'Error: ' + (data.error || 'Unknown')
        document.getElementById('listContainer').innerHTML =
          '<div class="empty-msg">No objects found</div>'
        countText.textContent = '0 objects'
      }
    } catch (err) {
      statusText.textContent = 'Server error'
      document.getElementById('listContainer').innerHTML =
        '<div class="empty-msg">Cannot reach server.<br>' + err.message + '</div>'
      countText.textContent = '0 objects'
    }
  }

  // ---- Render object list ----
  function renderList(objects) {
    var container = document.getElementById('listContainer')
    if (!objects || objects.length === 0) {
      container.innerHTML = '<div class="empty-msg">No objects found</div>'
      return
    }

    var html = ''
    objects.forEach(function (obj) {
      var dist = calcDistance(myPosition.x, myPosition.y, obj.x, obj.y)
      html += '<div class="list-item">'
      html += '<div class="info">'
      html += '<div class="name">' + (obj.name || 'Unknown') + '</div>'
      html += '<div class="meta">'
      html += '<span>Lv.' + (obj.level || '?') + '</span>'
      html += '<span>K:' + (obj.kingdom || '?') + '</span>'
      html += '<span>X:' + obj.x + ' Y:' + obj.y + '</span>'
      html += '<span>Dist:' + Math.round(dist) + '</span>'
      html += '</div>'
      html += '</div>'
      html += '<button class="go-btn" data-key="' + obj.key + '">GO</button>'
      html += '</div>'
    })
    container.innerHTML = html

    // Go button handlers
    container.querySelectorAll('.go-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault()
        var key = btn.dataset.key
        navigateTo(key)
        searchObjects()
      })
    })
  }

  function calcDistance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
  }

  function navigateTo(key) {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        {
          action: 'sendCoords',
          key: key
        },
        function (resp) {
          console.log('[Scanner] Navigate sent: ', key)
        }
      )
    }
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          action: 'navigate-to',
          key: key
        },
        '*'
      )
    }
  }

  // ---- Init ----
  renderFilters()
})()
