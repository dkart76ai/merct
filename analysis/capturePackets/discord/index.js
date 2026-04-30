const { loadEnvFile } = require('node:process')
const { Client, GatewayIntentBits } = require('discord.js')
const { findObjects } = require('../lib/database')
const { addGameNotificationJob } = require('../jobs/index')

loadEnvFile()

let client = null

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

    if (message.content.startsWith('#find')) {
      // Regex: soporta "#find", cantidad, nombre con espacios, "lvl/level" y nivel
      ///#find\s+(?:(\d+)\s+)?(.+)\s+lvl\s+(\d+)/i
      const pattern = /^#find\s+(?:(\d+)\s+)?(.+)\s+(?:level|lvl)\s+(\d+)/i
      const match = message.content.match(pattern)

      if (match) {
        const [, _amount, nombreBuscado, level] = match
        const amount = _amount || '5'
        console.log('[BOT] Buscando:', amount, nombreBuscado, level)

        // Llamamos a la DB
        const results = findObjects({
          name: nombreBuscado,
          level: parseInt(level),
          amount: parseInt(amount)
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
          'Usage: `#find amount object-name lvl nn`\n\n' +
            '**Examples:**\n' +
            '`#find 5 crypt lvl 20`\n' +
            '`#find 5 rare crypt level 25`\n\n' +
            '\n-- using wildcard `%` --\n\n' +
            '`#find 5 %elf% level 25`\n' +
            '`#find 5 %squad level 15`\n' +
            '`#find 5 common% level 5`'
        )
      }
    }
  })

  client.login(process.env.DISCORD_TOKEN)

  console.log('[BOT] discord loaded')
}

module.exports = {
  setupDiscord
}
