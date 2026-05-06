# TotalBattle Object Scanner - Browser Addon

A Manifest V3 browser extension that overlays a map object scanner directly into the TotalBattle game page.

## Overview

The addon injects an iframe-based UI into the game page that communicates with the local \capturePackets\ server. It lets you browse, filter, and navigate to map objects (monsters, crypts, resources) with one click.

## Prerequisites

1. **Node.js** installed (for the capturePackets server)
2. **Chromium-based browser** (Chrome, Edge, Brave, etc.) -- Manifest V3 compatible
3. The **capturePackets server** running locally on port 3000 with the \objects.db\ database populated

## Installing the Addon

### Chrome / Edge / Brave

1. Open your browser and navigate to the extensions page:
   - **Chrome:** \chrome://extensions\
   - **Edge:** \edge://extensions\
   - **Brave:** \rave://extensions\

2. Enable **Developer mode** (toggle in the top-right corner of the page).

3. Click **Load unpacked** (Chrome/Brave) or **Load unpacked extension** (Edge).

4. In the file picker, navigate to and select the \rowserAddon\ folder:
   \\\
   G:\delphiprojs\playWTB\analysis\capturePackets\browserAddon
   \\\

5. The extension should appear in your extensions list with the name **TotalBattle Object Scanner**.

### Verifying Installation

After loading, you should see:
- A toolbar icon (puzzle piece) with the TotalBattle scanner icon
- The extension status as "Active"

## Starting the Server

The addon requires the capturePackets server to be running for object queries.

\\\ash
cd G:\delphiprojs\playWTB\analysis\capturePackets
node server.js
\\\

Confirm the server is listening on \http://localhost:3000\.

## Usage

### Method 1: Toolbar Button (Popup)

1. Navigate to any \*.totalbattle.com\ page.
2. Click the **TotalBattle Object Scanner** extension icon in your browser toolbar.
3. The popup UI opens with the **Monsters** tab selected by default.

### Method 2: In-Game Overlay (Keyboard Shortcut)

1. Navigate to any \*.totalbattle.com\ page.
2. Press **Ctrl + Shift + O** (Command + Shift + O on Mac).
3. A floating iframe overlay appears in the top-right corner of the game page.
4. Press **Ctrl + Shift + O** again to toggle the overlay off.

## UI Structure

### Tabs

| Tab | Description | Max Level |
|-----|-------------|-----------|
| **Monsters** | Faction-based monsters (Barbarian, Inferno, Undead, Elfs, Cursed, Others) with tier sub-filters (Common, Rare, Heroic, Citadels) | 45 |
| **Crypts/Arena** | Resource nodes (Sawmill, Mine, Quarry, Farmer, Silver, Gold, Wellspring) | 35 |
| **Resources/Mines** | Tier-based objects (Common, Rare, Epic, Arena, Others) | 45 |

### Filters

Each tab displays:
- **Category toggles** -- Check/uncheck object categories to include in search.
- **Level range slider** -- Two dual sliders to filter by minimum and maximum level.

The **Monsters** tab has an additional row of sub-category toggles:
- Common, Rare, Heroic, Citadels

### Search

1. Adjust toggles and level sliders to your preferences.
2. Verify the **Server URL** field points to your local server (default: \http://localhost:3000\).
3. Click **Search**.

Results display sorted by distance (closest first) with:
- Object name
- Level
- Kingdom
- X/Y coordinates
- Distance from player (calculated from default position: x=448, y=480)

### GO Button

Clicking **GO** on any object sends an attack command to the game's chat system with the format:
\\\
ATTACK K,X,Y
\\\
This triggers the in-game navigation/attack sequence for that object's coordinates.

## File Structure

\\\
browserAddon/
  manifest.json        -- Manifest V3 extension configuration
  background.js        -- Service worker: shortcut handling, settings, fetch proxy
  content.js           -- Content script: iframe injection, SendBird bridge, keyboard toggle
  categories.js        -- Filter category definitions (loaded in popup/iframe)
  popup.html           -- UI markup and CSS (VS Code dark theme)
  popup.js             -- UI logic: tabs, filters, search, list rendering, navigation
  icons/
    icon16.png         -- 16x16 toolbar icon
    icon48.png         -- 48x48 extension page icon
    icon128.png        -- 128x128 Chrome Web Store icon
  lib/
    categories.json    -- StaticId-based category mappings (reference data)
    categories.js      -- Server-side category module (reference)
\\\

## Permissions

| Permission | Purpose |
|------------|---------|
| \ctiveTab\ | Access the current tab for content script injection |
| \storage\ | Persist user settings (server URL, last tab, etc.) |
| \http://localhost:3000/*\ | Query the local capturePackets server for object data |
| \https://*.totalbattle.com/*\ | Inject the scanner overlay into TotalBattle game pages |

## Troubleshooting

### "Cannot reach server" on search
- Ensure \
ode server.js\ is running in the capturePackets directory.
- Verify the server URL in the addon matches \http://localhost:3000\.
- Check that \objects.db\ exists and contains data.

### Overlay does not appear on Ctrl+Shift+O
- Confirm you are on a \*.totalbattle.com\ page.
- Check that the extension is enabled in \chrome://extensions\.
- Open DevTools (F12) and look for \[Scanner] Content script loaded\ in the Console.

### GO button does not send attack command
- The game's SendBirdHelper must be initialized (wait for the game to fully load).
- Check the browser console for \[Scanner] SendBird not ready\ warnings.

### Extension icon missing from toolbar
- Click the puzzle piece icon in the toolbar and pin the **TotalBattle Object Scanner** extension.
