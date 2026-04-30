const { loadEnvFile } = require('node:process')
const { Client, GatewayIntentBits } = require('discord.js')
const { findObjects, saveUserPosition } = require('../lib/database')
const { addGameNotificationJob } = require('../jobs/index')

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
    const [, _amount, nombreBuscado, level] = match
    const amount = _amount || '5'
    console.log('[BOT] Buscando:', amount, nombreBuscado, level)

    // const userPosition = getUserPosition(message.author.id)
    // console.log('[BOT] User position:', userPosition)

    //TODO: pass userid to findobjects,  so internally when findobjects are being called,
    // it uses user position to get objects closer to the user

    // Llamamos a la DB
    const results = findObjects({
      name: nombreBuscado,
      level: parseInt(level),
      amount: parseInt(amount),
      userId: message.author.id
    })
    console.log('[BOT] Resultados encontrados:', results.objects)

    if (results.total > 0) {
      // 1. Buscamos el canal por su ID
      const targetChannel = client.channels.cache.get(process.env.DISCORD_CHANNELID)

      if (targetChannel) {
        const respuesta = results.objects
          .map(obj => `**${obj.name}** Lvl ${obj.level} @ ${obj.kingdom} ${obj.x} ${obj.y}`)
          .join('\n')

        // 2. Enviamos el mensaje a ese canal específico
        await targetChannel.send(respuesta)

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
        }
      } else {
        console.error('wrong channel')
      }
    } else {
      await message.reply(`Cant find "${nombreBuscado}" level ${level}.`)
    }
  } else {
    await message.reply(
      'Usage: `${FIND_COMMAND} amount object-name lvl nn`\n\n' +
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
    ]
  })

  client.on('messageCreate', async message => {
    if (message.author.bot) return

    if (message.channel.name !== 'clan') return

    console.log('[BOT] message', message.content)

    if (message.content.startsWith(FIND_COMMAND)) {
      await processFindCommand(message)
    } else if (message.content.startsWith(SET_MYPOS_COMMAND)) {
      await processSetMyPosCommand(message)
    }
  })

  client.login(process.env.DISCORD_TOKEN)

  console.log('[BOT] discord loaded')
}

module.exports = {
  setupDiscord
}
