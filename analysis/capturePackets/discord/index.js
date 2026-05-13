const fs = require('node:fs')
const path = require('node:path')

const { loadEnvFile } = require('node:process')

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js')

const { findObjects, findObjectByKey, saveUserPosition, deleteObject } = require('../lib/database')
const { addGameNotificationJob } = require('../jobs/queues')

loadEnvFile()
let client = null

// Ruta del archivo que servirá como indicador
const REGISTERED_FLAG_FILE = path.join(__dirname, '.commands_registered')

async function registerSlashCommands(token, clientId) {
  // 1. Verificar si el archivo ya existe
  if (fs.existsSync(REGISTERED_FLAG_FILE)) {
    console.log('[BOT] Slash commands ya registrados anteriormente (flag file encontrado).')
    return
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('find')
      .setDescription('Search objects')
      .addStringOption(opt =>
        opt.setName('name').setDescription('Name (ej: crypt o %elf%)').setRequired(true)
      )
      .addIntegerOption(opt => opt.setName('lvl').setDescription('Level').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Amount (máx 15)'))
      .addIntegerOption(opt => opt.setName('kindgom').setDescription('Kingdom to search on')),

    new SlashCommandBuilder()
      .setName('setmypos')
      .setDescription('Set your location, to get objects near to you on find')
      .addIntegerOption(opt =>
        opt
          .setName('x')
          .setDescription('X (0-1000)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(1000)
      )
      .addIntegerOption(opt =>
        opt
          .setName('y')
          .setDescription('Y (0-1000)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(1000)
      )
  ].map(command => command.toJSON())

  const rest = new REST({ version: '10' }).setToken(token)

  try {
    console.log('[BOT] Iniciando registro de Slash Commands...')
    await rest.put(Routes.applicationCommands(clientId), { body: commands })

    // 2. Crear el archivo para que no se repita en el próximo reinicio
    fs.writeFileSync(REGISTERED_FLAG_FILE, `Registered at: ${new Date().toISOString()}`)
    console.log('[BOT] Slash Commands registrados con éxito y archivo flag creado.')
  } catch (error) {
    console.error('[BOT] Error al registrar comandos:', error)
  }
}

async function handleFindInteraction(interaction) {
  // 1. Extraer valores directamente de la interacción (ya validados por Discord)
  const searchName = interaction.options.getString('name')
  const level = interaction.options.getInteger('lvl')
  const kingdom = interaction.options.getInteger('kingdom') || 146
  // Si no pone cantidad, usamos 5 por defecto, máximo 15
  const amount = Math.min(interaction.options.getInteger('amount') || 5, 15)

  console.log('[BOT] Buscando via Slash:', amount, searchName, level)

  // 2. Avisamos a Discord que estamos procesando (evita el timeout de 3s)
  await interaction.deferReply()

  try {
    // 3. Llamada a la DB (usando el ID del usuario de la interacción)
    const results = findObjects({
      name: searchName,
      level: level,
      amount: amount,
      userId: interaction.user.id,
      kingdom
    })

    console.log('[BOT] Resultados encontrados:', results.objects.length)

    if (results.total > 0) {
      const respuesta = results.objects
        .map(obj => `**${obj.name}** Lvl ${obj.level} @ ${obj.kingdom} ${obj.x} ${obj.y}`)
        .join('\n')

      // 4. Enviamos la respuesta final
      await interaction.editReply(respuesta)

      // 5. Procesar notificaciones en segundo plano
      for (const obj of results.objects) {
        await addGameNotificationJob({
          object: {
            k: obj.kingdom,
            x: obj.x,
            y: obj.y,
            staticId: obj.staticId
          },
          message: obj.name,
          toMainChannel: true
        })

        deleteObject(obj.key)
      }
    } else {
      await interaction.editReply(`Not found "${searchName}" lvl ${level}.`)
    }
  } catch (error) {
    console.error('[BOT] Error en comando find:', error)
    await interaction.editReply('Error.')
  }
}

async function handleSetMyPosInteraction(interaction) {
  // 1. Extraemos las coordenadas directamente
  const x = interaction.options.getInteger('x')
  const y = interaction.options.getInteger('y')

  // 2. Validación de rangos (aunque Discord permite poner min/max en el registro,
  // lo mantenemos aquí por seguridad)
  if (x > 1000 || x < 0 || y > 1000 || y < 0) {
    return interaction.reply({
      content: `Pos range 0 to 1000, got: ${x}, ${y}`,
      ephemeral: true // Solo el usuario ve este mensaje de error
    })
  }

  console.log('[BOT] Guardando posición del usuario:', interaction.user.id, x, y)

  try {
    // 3. Llamada a tu función de DB existente
    saveUserPosition({ userId: interaction.user.id, x, y })

    // 4. Respuesta de éxito
    await interaction.reply({
      content: `✅ Pos saved: **${x}, ${y}**.`,
      ephemeral: true // Recomendado para no llenar el canal de mensajes de configuración
    })
  } catch (error) {
    console.error('[BOT] Error en setMyPos:', error)
    await interaction.reply({
      content: '❌ Error.',
      ephemeral: true
    })
  }
}

async function setupDiscord() {
  // Ejecutar el registro antes del login
  await registerSlashCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID)

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent // Obligatorio para leer el #sendMelon del otro bot
    ]
  })

  // 1. ESCUCHAR SLASH COMMANDS (Para usuarios humanos)
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'find') {
      await handleFindInteraction(interaction)
    }
    if (interaction.commandName === 'setmypos') {
      await handleSetMyPosInteraction(interaction)
    }
  })

  // 2. ESCUCHAR MENSAJES (Solo para el Bot/Extensión)
  const PREFIX = '#'
  const FIND_COMMAND = PREFIX + 'find'

  async function processFindCommand(message) {
    // Regex: soporta "#find", cantidad, nombre con espacios, "lvl/level" y nivel
    ///#find\s+(?:(\d+)\s+)?(.+)\s+lvl\s+(\d+)/i

    //const pattern = /^#find\s+(?:(\d+)\s+)?(.+)\s+(?:level|lvl)\s+(\d+)/i

    // Escapamos el prefijo por seguridad y usamos el constructor RegExp
    // Nota: Las barras invertidas (\) deben duplicarse (\\) en strings
    const pattern = new RegExp(
      `^${FIND_COMMAND}\\s+(?:(\\d+)\\s+)?(.+)\\s+(?:level|lvl)\\s+(\\d+)(?:\\s+(\\d+))?`,
      'i'
    )

    const match = message.content.match(pattern)

    if (match) {
      const [, _amount, searchName, level, _kingdom] = match
      const amount = _amount || '5'
      const kingdom = _kingdom || '146'
      console.log('[BOT] Buscando:', amount, searchName, level, kingdom)

      // const userPosition = getUserPosition(message.author.id)
      // console.log('[BOT] User position:', userPosition)

      // it uses user position to get objects closer to the user

      const maxAmount = Math.min(parseInt(amount), 15)
      await message.reply(`Searching ${maxAmount} ${searchName}`)

      // Llamamos a la DB
      const results = findObjects({
        name: searchName,
        level: parseInt(level),
        amount: maxAmount,
        userId: message.author.id,
        kingdom: parseInt(kingdom)
      })
      console.log('[BOT] Resultados encontrados:', results.objects.length)

      if (results.total > 0) {
        // 1. Buscamos el canal por su ID
        const targetChannel = client.channels.cache.get(process.env.DISCORD_CHANNELID)

        if (targetChannel) {
          const respuesta = results.objects
            .map(obj => `**${obj.name}** Lvl ${obj.level} @ ${obj.kingdom} ${obj.x} ${obj.y}`)
            .join('\n')
          await message.reply(respuesta)

          for (obj of results.objects) {
            await addGameNotificationJob({
              object: {
                k: obj.kingdom,
                x: obj.x,
                y: obj.y,
                staticId: obj.staticId
              },
              message: obj.name,
              toMainChannel: true
            })

            deleteObject(obj.key)
          }
        } else {
          console.error('wrong channel')
        }
      } else {
        await message.reply(`Cant find "${searchName}" level ${level}.`)
      }
    } else {
      await message.reply(
        'Usage: `${FIND_COMMAND} amount object-name lvl nn`\n\n' +
          'max amount: 5\n' +
          '**Examples:**\n' +
          '`${FIND_COMMAND} 5 crypt lvl 20`\n' +
          '`${FIND_COMMAND} 5 rare crypt level 25`\n\n' +
          '\n-- using wildcard `%` --\n\n' +
          '`${FIND_COMMAND} 5 %elf% level 25`\n' +
          '`${FIND_COMMAND} 5 %squad level 15`\n' +
          '`${FIND_COMMAND} 5 common% level 5`'
      )
    }
  }

  client.on('messageCreate', async message => {
    const MI_EXTENSION_ID = '1488525756945530930'

    // Filtro estricto: Solo respondemos si es el ID de la extensión
    if (message.author.id !== MI_EXTENSION_ID) return

    if (message.content.startsWith('#sendMelon')) {
      const pattern = /^#sendMelon\s+(.+)/i
      const match = message.content.match(pattern)

      if (match) {
        const [, key] = match
        const results = findObjectByKey(key)

        if (results.total > 0) {
          for (const obj of results.objects) {
            await addGameNotificationJob({
              object: { k: obj.kingdom, x: obj.x, y: obj.y, staticId: obj.staticId },
              message: obj.name,
              toMainChannel: true
            })
            deleteObject(obj.key)
          }
        }
      }
    } else if (message.content.startsWith(FIND_COMMAND)) {
      await processFindCommand(message)
    }
  })

  client.login(process.env.DISCORD_TOKEN)
}

module.exports = {
  setupDiscord
}
