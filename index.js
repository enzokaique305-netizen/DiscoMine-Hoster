'use strict';

// Copyright (C) 2026 DiscoMine Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.


const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActivityType,
  Events, Colors
} = require('discord.js');

const config = require('./config');
const mc = require('./minecraft');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('starts the bot (leaves when someone is on, joins back when empty)'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('stops the bot'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('checks how the bot is doing'),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  try {
    console.log('[Discord] Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands },
    );
    console.log('[Discord] slash commands registered!');
  } catch (err) {
    console.error('[Discord] failed to register commands:', err.message);
  }
}

function buildStatusEmbed(status, title, color) {
  let botStatusText;
  if (status.connected) {
    botStatusText = '🟢 **online and chilling**';
  } else if (status.leftForPlayers) {
    botStatusText = '🟡 **waiting for everyone to leave**';
  } else {
    botStatusText = '🔴 **offline**';
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      {
        name: '🌐 server',
        value: `\`${status.server}\``,
        inline: true,
      },
      {
        name: '🔗 bot status',
        value: botStatusText,
        inline: true,
      },
      {
        name: '👥 players online',
        value: `**${status.playerCount}**`,
        inline: true,
      },
      {
        name: '⏱ uptime',
        value: status.connected ? formatUptime(status.uptime) : '—',
        inline: true,
      },
      {
        name: '🔁 rejoin attempts',
        value: `${status.reconnectAttempts}`,
        inline: true,
      },
      {
        name: '🤖 bot name',
        value: `\`${config.bot.username}\``,
        inline: true,
      },
    )
    .setFooter({ text: 'DiscoMine by akahn' })
    .setTimestamp();
}

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

async function notifyChannel(embed) {
  if (!config.discord.statusChannelId) return;
  try {
    const channel = await client.channels.fetch(config.discord.statusChannelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (_) { }
}

function updatePresence() {
  if (!client.user) return;
  const status = mc.getStatus();

  if (status.connected) {
    client.user.setPresence({
      status: 'online',
      activities: [{
        name: `chilling alone • ${config.server.ip}`,
        type: ActivityType.Watching,
      }],
    });
  } else if (status.leftForPlayers) {
    client.user.setPresence({
      status: 'idle',
      activities: [{
        name: `waiting for ${status.playerCount} players to leave`,
        type: ActivityType.Watching,
      }],
    });
  } else {
    client.user.setPresence({
      status: 'dnd',
      activities: [{
        name: 'offline — type /start',
        type: ActivityType.Custom,
      }],
    });
  }
}

mc.emitter.on('connected', ({ version }) => {
  updatePresence();
  const status = mc.getStatus();
  notifyChannel(
    buildStatusEmbed(status, '🟢 bot connected, server is empty', Colors.Green)
  );
});

mc.emitter.on('leftForPlayers', (count) => {
  updatePresence();
  notifyChannel(
    new EmbedBuilder()
      .setTitle('🟡 bot left, players online')
      .setDescription(
        `someone is in the server. leaving to save energy, rejoining ASAP once they leave.`
      )
      .setColor(Colors.Yellow)
      .setTimestamp()
  );
});

mc.emitter.on('kicked', (reason) => {
  updatePresence();
  notifyChannel(
    new EmbedBuilder()
      .setTitle('⚠️ bot got kicked')
      .setDescription(`Reason: \`${reason}\`\ntryna rejoin in 8s...`)
      .setColor(Colors.Orange)
      .setTimestamp()
  );
});

mc.emitter.on('kicked_reconnect', () => {
  updatePresence();
  notifyChannel(
    new EmbedBuilder()
      .setTitle('⚡ bot reconnecting')
      .setDescription(
        'bot got disconnected or crashed, putting it back ASAP (8s)...'
      )
      .setColor(Colors.Orange)
      .setTimestamp()
  );
});

mc.emitter.on('disconnected', (reason) => {
  updatePresence();
});

mc.emitter.on('reconnecting', ({ attempt, delayMs }) => {
  updatePresence();
  console.log(`[Bot] rejoin attempt #${attempt} in ${(delayMs / 1000).toFixed(1)}s`);
});

mc.emitter.on('stopped', () => {
  updatePresence();
  notifyChannel(
    new EmbedBuilder()
      .setTitle('🔴 bot stopped')
      .setDescription('stopped the bot. type /start to put it back online')
      .setColor(Colors.Red)
      .setTimestamp()
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;
  console.log(`[Discord] /${commandName} by ${user.tag}`);

  if (commandName === 'start') {
    const status = mc.getStatus();

    if (status.connected) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ bot is already running')
            .setDescription('the bot is already in or checking')
            .setColor(Colors.Yellow)
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    mc.start();

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚀 joining the server...')
          .setDescription(
            `starting the bot now!\n\ntrying to join \`${config.server.ip}\`...\n(might take like 2 minutes if the server was sleeping)\n\nit'll check if the server is empty, leave if someone is on, and join back when they leave`
          )
          .addFields(
            { name: '🤖 bot name', value: `\`${config.bot.username}\``, inline: true },
            { name: '🌐 server', value: `\`${config.server.ip}\``, inline: true },
          )
          .setColor(Colors.Green)
          .setFooter({ text: 'leaves for players, rejoins ASAP when empty' })
          .setTimestamp(),
      ],
    });
  }

  else if (commandName === 'stop') {
    const status = mc.getStatus();

    if (!status.connected) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('ℹ️ bot is already offline')
            .setDescription('the bot is not in the server right now')
            .setColor(Colors.Blurple)
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    mc.stop();

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔴 bot stopped')
          .setDescription(
            `bot left. use /start to run it again`
          )
          .setColor(Colors.Red)
          .setTimestamp(),
      ],
    });
  }

  else if (commandName === 'status') {
    const status = mc.getStatus();
    let title;
    let color;
    if (status.connected) {
      title = '🟢 bot status: online';
      color = Colors.Green;
    } else if (status.leftForPlayers) {
      title = '🟡 bot status: standby';
      color = Colors.Yellow;
    } else {
      title = '🔴 bot status: offline';
      color = Colors.DarkGrey;
    }
    return interaction.reply({
      embeds: [buildStatusEmbed(status, title, color)],
    });
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[Discord] logged in as ${c.user.tag}`);
  await registerCommands();
  updatePresence();

  console.log('[Bot] starting bot...');
  mc.start();

  setInterval(updatePresence, 60_000);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandled Rejection:', reason);
});

console.log('[Bot] starting discord bot...');
client.login(config.discord.token);
