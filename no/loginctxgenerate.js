const { chromium } = require('playwright')
const fs = require('fs')

;(async () => {
  const browser = await chromium.launch({ headless: false }) // Visible para supervisar

  // Lista de tus 100 credenciales (puedes cargar un CSV o JSON)
  const users = [
    { user: 'user+1@outlook.com or @gmail', pass: 'passhere' },
    { user: 'user+2@outlook.com or @gmail', pass: 'passhere' },
    { user: 'user+3@outlook.com or @gmail', pass: 'passhere' }
    // ... hasta 100
  ]

  if (!fs.existsSync('auth')) fs.mkdirSync('auth')

  for (let i = 0; i < users.length; i++) {
    const context = await browser.newContext({
      screen: { width: 1600, height: 1200 },
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()

    try {
      console.log(`Logueando usuario ${i}: ${users[i].user}...`)
      await page.goto('https://totalbattle.com/es')

      // Interactúa con el formulario de login
      await page.locator('#registration').getByText('Iniciar sesión').click()
      await page.getByRole('textbox', { name: 'E-mail' }).fill(users[i].user)
      await page.getByRole('textbox', { name: 'Contraseña' }).fill(users[i].pass)
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()

      // ESPERA CRÍTICA: Asegúrate de estar dentro del juego antes de guardar
      // Esperamos a que el Canvas de Unity aparezca
      await page.waitForSelector('canvas', { timeout: 30000 })
      await page.waitForTimeout(3000)

      // Guardamos el estado (cookies, localStorage, etc.)
      await context.storageState({ path: `auth/user_${i}.json` })
      console.log(`✅ Sesión ${i} guardada.`)
    } catch (error) {
      console.error(`❌ Error con usuario ${i}:`, error.message)
    } finally {
      await context.close()
    }
  }

  await browser.close()
  console.log('--- Proceso de autenticación finalizado ---')
})()
