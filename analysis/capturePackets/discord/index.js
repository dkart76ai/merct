const { loadEnvFile } = require('node:process')
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js')
const { findObjects, findObjectByKey, saveUserPosition, deleteObject } = require('../lib/database')
const { addGameNotificationJob } = require('../jobs/queues')

loadEnvFile()

const PREFIX = '#'
const FIND_COMMAND = PREFIX + 'find'
const SET_MYPOS_COMMAND = PREFIX + 'setMyPos'

let client = null

async function processSetMyPosCommand(message) {
  // Explicación del patrón:
  // \s+           -> Al menos un espacio después del prefijo
  // (\d+)         -> Grupo 1: Captura el primer número
  // \s*[, ]\s*    -> Match de coma o espacio, rodeado de cualquier cantidad de espacios
  // (\d+)         -> Grupo 2: Captura el segundo número
  const pattern = new RegExp(`^${SET_MYPOS_COMMAND}\\s+(\\d+)\\s*[, ]\\s*(\\d+)`, 'i')

  const match = message.content.match(pattern)

  if (match) {
    const [, _x, _y] = match
    const x = parseInt(_x)
    const y = parseInt(_y)
    if (x > 1000 || x < 0 || y > 1000 || y < 0) {
      await message.reply(`Position must be between 0-1000, got ${x}, ${y}`)
      return
    }
    console.log('[BOT] saving User position:', x, y)

    saveUserPosition({ userId: message.author.id, x, y })
    await message.reply(`Position saved ${x} ${y}.`)
  } else {
    await message.reply(
      'Usage: `${SET_MYPOS_COMMAND} x, y`\n\n' +
        '**Examples:**\n' +
        '`${SET_MYPOS_COMMAND} 100, 20`\n' +
        '`${SET_MYPOS_COMMAND} 100 100`'
    )
  }
}

// const createButtons = objects => {
//   const buttonRows = []
//   let currentRow = new ActionRowBuilder()

//   objects.forEach((obj, index) => {
//     // Crear el botón basado en el resultado actual
//     const button = new ButtonBuilder()
//       .setCustomId(`${obj.key}`)
//       .setLabel(`${obj.kingdom} ${obj.x} ${obj.y}`)
//       .setStyle(ButtonStyle.Primary)

//     currentRow.addComponents(button)

//     // Cada 5 botones, cerramos la fila y empezamos una nueva
//     if (currentRow.components.length === 5 || index === objects.length - 1) {
//       buttonRows.push(currentRow)
//       currentRow = new ActionRowBuilder()
//     }
//   })

//   return buttonRows
// }

async function processFindCommand(message) {
  // Regex: soporta "#find", cantidad, nombre con espacios, "lvl/level" y nivel
  ///#find\s+(?:(\d+)\s+)?(.+)\s+lvl\s+(\d+)/i

  //const pattern = /^#find\s+(?:(\d+)\s+)?(.+)\s+(?:level|lvl)\s+(\d+)/i

  // Escapamos el prefijo por seguridad y usamos el constructor RegExp
  // Nota: Las barras invertidas (\) deben duplicarse (\\) en strings
  const pattern = new RegExp(
    `^${FIND_COMMAND}\\s+(?:(\\d+)\\s+)?(.+)\\s+(?:level|lvl)\\s+(\\d+)`,
    'i'
  )

  const match = message.content.match(pattern)

  if (match) {
    const [, _amount, searchName, level] = match
    const amount = _amount || '5'
    console.log('[BOT] Buscando:', amount, searchName, level)

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
      userId: message.author.id
    })
    console.log('[BOT] Resultados encontrados:', results.objects.length)

    if (results.total > 0) {
      // 1. Buscamos el canal por su ID
      const targetChannel = client.channels.cache.get(process.env.DISCORD_CHANNELID)

      if (targetChannel) {
        // let tareas = results.objects.slice()

        // const respuesta = await message.reply({
        //   content: `Click on button to remove that coord`,
        //   components: createButtons(tareas),
        //   fetchReply: true // Importante para poder usar el colector
        // })

        // 2. Creamos el colector
        // filter: solo el usuario que ejecutó el comando puede usar los botones
        // const filter = i => i.user.id === message.author.id

        // const collector = respuesta.createMessageComponentCollector({
        //   filter,
        //   time: 360000 // El colector expira en 5 minutos
        // })

        // 3. Escuchamos los clics
        // collector.on('collect', async i => {
        //   // Extraemos el índice o ID del customId (ej: "btn_5")
        //   const idSeleccionado = i.customId

        //   const obj = tareas.find(t => t.key === idSeleccionado)
        //   await addGameNotificationJob({
        //     object: {
        //       k: obj.kingdom,
        //       x: obj.x,
        //       y: obj.y,
        //       staticId: obj.staticId
        //     },
        //     message: obj.name,
        //     toMainChannel: true
        //   })

        //   // 3. Eliminar la tarea del array
        //   tareas = tareas.filter(t => t.key !== idSeleccionado)
        //   deleteObject(idSeleccionado)

        //   // Respondemos al clic
        //   // 4. Actualizar el mensaje con los botones restantes
        //   if (tareas.length > 0) {
        //     await i.update({
        //       content: `Click on button to remove that coord`,
        //       components: createButtons(tareas)
        //     })
        //   } else {
        //     // Si no quedan tareas
        //     await i.update({
        //       content: '🎉',
        //       components: []
        //     })
        //     collector.stop()
        //   }
        // })

        // // 4. Qué pasa cuando el colector termina (por tiempo o por .stop())
        // collector.on('end', collected => {
        //   // if (collected.size === 0) {
        //   message
        //     .editReply({
        //       content: 'Time expired. Try again if you need coords',
        //       components: []
        //     })
        //     .catch(() => {}) // Evita errores si el mensaje fue borrado manualmente
        //   // }
        // })
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

function setupDiscord() {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    rest: {
      timeout: 60000, // 60 segundos antes de abortar
      retries: 3 // Reintentar si falla
    }
  })

  client.on('messageCreate', async message => {
    console.log('msg', message.author.bot, message.author.id)
    const MI_EXTENSION_ID = '1488525756945530930'

    if (message.author.bot && message.author.id !== MI_EXTENSION_ID) return
    console.log('channel name', message.channel.name)
    if (!['clan', 'test'].includes(message.channel.name)) return

    console.log('[BOT] message', message.content)

    if (message.content.startsWith(FIND_COMMAND)) {
      await processFindCommand(message)
    } else if (message.content.startsWith(SET_MYPOS_COMMAND)) {
      await processSetMyPosCommand(message)
    } else if (message.content.startsWith('#sendMelon')) {
      const pattern = new RegExp(`^#sendMelon\\s+(.+)`, 'i')

      const match = message.content.match(pattern)
      console.log('matcho', match)
      if (match) {
        const [, key] = match
        console.log('buscando objeto con key', key)
        // Llamamos a la DB
        const results = findObjectByKey(key)
        console.log('[BOT] Resultados encontrados:', results.objects.length)

        if (results.total > 0) {
          for (obj of results.objects) {
            console.log('enviando notificacion', obj)
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
        }
      }
    }
  })

  client.login(process.env.DISCORD_TOKEN)

  console.log('[BOT] discord loaded')
}

module.exports = {
  setupDiscord
}
