'use strict';
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// config.js — Centralised config loader from .env / WispByte env variables
// ─────────────────────────────────────────────────────────────────────────────

const config = {
  discord: {
    token:           process.env.DISCORD_TOKEN      || '',
    clientId:        process.env.CLIENT_ID          || '',
    guildId:         process.env.GUILD_ID           || '',
    statusChannelId: process.env.STATUS_CHANNEL_ID  || '',
  },
  server: {
    ip:      process.env.MC_SERVER_IP                    || 'yourserver.falixsrv.me',
    port:    parseInt(process.env.MC_SERVER_PORT || '25565', 10),
    version: process.env.MC_SERVER_VERSION               || null, // null = auto-detect
  },
  bot: {
    username: process.env.MC_USERNAME || 'LazyAFKBot',
    password: process.env.MC_PASSWORD || '',
    auth:     process.env.MC_AUTH     || 'offline',
  },
};

// Validate required fields
const missing = [];
if (!config.discord.token)    missing.push('DISCORD_TOKEN');
if (!config.discord.clientId) missing.push('CLIENT_ID');
if (!config.discord.guildId)  missing.push('GUILD_ID');
if (!config.server.ip || config.server.ip === 'yourserver.falixsrv.me') missing.push('MC_SERVER_IP');

if (missing.length > 0) {
  console.error(`[Config] ❌  Missing required env vars: ${missing.join(', ')}`);
  console.error('[Config]    Fill in your .env file and restart.');
  process.exit(1);
}

module.exports = config;
