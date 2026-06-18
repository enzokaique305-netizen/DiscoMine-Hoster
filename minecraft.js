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


const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const EventEmitter = require('events');
const config = require('./config');

const state = {
  bot: null,
  connected: false,
  startTime: null,
  reconnectAttempts: 0,
  isReconnecting: false,
  manualStop: false,
  leftForPlayers: false,
  playerCount: 0,
  intervals: [],
  reconnectTimer: null,
  connectionTimer: null,
};

const emitter = new EventEmitter();

function clearIntervals() {
  state.intervals.forEach(id => clearInterval(id));
  state.intervals = [];
}

function addInterval(fn, ms) {
  const id = setInterval(fn, ms);
  state.intervals.push(id);
  return id;
}

function clearTimers() {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  if (state.connectionTimer) { clearTimeout(state.connectionTimer); state.connectionTimer = null; }
}

function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function start() {
  if (state.connected || state.isReconnecting) {
    log('Bot', 'already running or connecting');
    return;
  }
  state.manualStop = false;
  state.leftForPlayers = false;
  state.reconnectAttempts = 0;
  createBot();
}

function stop() {
  state.manualStop = true;
  state.leftForPlayers = false;
  clearTimers();
  clearIntervals();
  if (state.bot) {
    try {
      state.bot.removeAllListeners();
      state.bot.end();
    } catch (e) {
      log('Bot', `error stopping: ${e.message}`);
    }
    state.bot = null;
  }
  state.connected = false;
  state.isReconnecting = false;
  state.playerCount = 0;
  log('Bot', 'stopped');
  emitter.emit('stopped');
}

function getStatus() {
  return {
    connected: state.connected,
    leftForPlayers: state.leftForPlayers,
    playerCount: state.playerCount,
    uptime: state.connected && state.startTime
      ? Math.floor((Date.now() - state.startTime) / 1000)
      : 0,
    reconnectAttempts: state.reconnectAttempts,
    server: `${config.server.ip}:${config.server.port}`,
  };
}

function createBot() {
  if (state.isReconnecting) return;

  if (state.bot) {
    clearIntervals();
    try { state.bot.removeAllListeners(); state.bot.end(); } catch (_) { }
    state.bot = null;
  }

  log('Bot', `connecting to ${config.server.ip}:${config.server.port}...`);
  emitter.emit('connecting');

  let bot;
  try {
    const mcVersion = config.server.version || false;
    if (mcVersion) {
      log('Bot', `using version ${mcVersion}`);
    } else {
      log('Bot', 'no version pinned, auto detecting');
    }

    bot = mineflayer.createBot({
      username: config.bot.username,
      password: config.bot.password || undefined,
      auth: config.bot.auth,
      host: config.server.ip,
      port: config.server.port,
      version: mcVersion,
      hideErrors: false,
      checkTimeoutInterval: 600000,
    });
    bot.loadPlugin(pathfinder);
  } catch (err) {
    log('Bot', `failed to start: ${err.message}`);
    if (state.leftForPlayers) rejoinASAP();
    return;
  }

  state.bot = bot;

  clearTimers();
  state.connectionTimer = setTimeout(() => {
    if (!state.connected) {
      log('Bot', 'timed out, no spawn in 150s');
      try { bot.removeAllListeners(); bot.end(); } catch (_) { }
      state.bot = null;
      if (state.leftForPlayers) rejoinASAP();
    }
  }, 150_000);

  let spawnHandled = false;

  bot.once('spawn', () => {
    if (spawnHandled) return;
    spawnHandled = true;

    clearTimers();
    state.connected = true;
    state.startTime = Date.now();
    state.reconnectAttempts = 0;
    state.isReconnecting = false;
    state.leftForPlayers = false;

    log('Bot', `joined! version ${bot.version}, watching players`);
    emitter.emit('connected', { version: bot.version });

    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.allowFreeMotion = false;
    movements.canDig = false;
    movements.liquidCost = 9999;
    movements.fallDamageCost = 9999;

    setTimeout(() => checkAndActOnPlayers(bot, movements), 2_000);
  });

  bot.on('kicked', (reason) => {
    const r = typeof reason === 'object' ? JSON.stringify(reason) : reason;
    log('Bot', `kicked: ${r}`);
    state.connected = false;
    clearIntervals();
    emitter.emit('kicked', r);
  });

  bot.on('end', (reason) => {
    log('Bot', `disconnected: ${reason || 'unknown'}`);
    state.connected = false;
    state.playerCount = 0;
    clearIntervals();
    emitter.emit('disconnected', reason);

    if (state.manualStop) return;

    if (state.leftForPlayers) {
      log('Bot', 'left because players were on, rechecking in 8s');
      rejoinASAP();
    } else {
      log('Bot', 'disconnected unexpectedly, rejoining ASAP');
      emitter.emit('kicked_reconnect');
      rejoinASAP();
    }
  });

  bot.on('error', (err) => {
    log('Bot', `error: ${err.message}`);
  });
}

function startAntiAFK(bot, movements) {
  addInterval(() => {
    if (!state.connected || !bot) return;
    try { bot.swingArm(); } catch (_) { }
  }, 15_000 + Math.random() * 45_000);

  addInterval(() => {
    if (!state.connected || !bot) return;
    try {
      bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI / 2, true);
    } catch (_) { }
  }, 8_000 + Math.random() * 12_000);

  addInterval(() => {
    if (!state.connected || !bot) return;
    try { bot.setQuickBarSlot(Math.floor(Math.random() * 9)); } catch (_) { }
  }, 30_000 + Math.random() * 60_000);

  addInterval(() => {
    if (!state.connected || !bot || typeof bot.setControlState !== 'function') return;
    try {
      bot.look(Math.random() * Math.PI * 2, 0, true);
      bot.setControlState('forward', true);
      setTimeout(() => {
        if (bot && typeof bot.setControlState === 'function')
          bot.setControlState('forward', false);
      }, 500 + Math.random() * 1_500);
    } catch (_) { }
  }, 120_000 + Math.random() * 240_000);

  addInterval(() => {
    if (!state.connected || !bot || typeof bot.setControlState !== 'function') return;
    if (Math.random() > 0.6) {
      try {
        bot.setControlState('sneak', true);
        setTimeout(() => {
          if (bot && typeof bot.setControlState === 'function')
            bot.setControlState('sneak', false);
        }, 300 + Math.random() * 800);
      } catch (_) { }
    }
  }, 60_000 + Math.random() * 90_000);

  addInterval(() => {
    if (!state.connected || !bot || typeof bot.setControlState !== 'function') return;
    try {
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot && typeof bot.setControlState === 'function')
          bot.setControlState('jump', false);
      }, 100);
    } catch (_) { }
  }, 90_000 + Math.random() * 180_000);

  log('AntiAFK', 'anti AFK started');
}

function checkAndActOnPlayers(bot, movements) {
  if (!state.connected || !bot) return;

  const count = Object.values(bot.players || {})
    .filter(p => p.username !== config.bot.username)
    .length;
  state.playerCount = count;

  if (count > 0) {
    log('Bot', `someone is in the server (${count} players), leaving to save energy`);
    emitter.emit('leftForPlayers', count);
    leaveForPlayers();
  } else {
    log('Bot', 'server is empty, holding slot');
    startAntiAFK(bot, movements);
    addInterval(() => {
      if (!state.connected || !bot) return;
      const c = Object.values(bot.players || {})
        .filter(p => p.username !== config.bot.username)
        .length;
      state.playerCount = c;
      if (c > 0) {
        log('Bot', `someone joined (${c} players), leaving`);
        emitter.emit('leftForPlayers', c);
        leaveForPlayers();
      }
    }, 5_000);
  }
}

function leaveForPlayers() {
  if (!state.connected || state.leftForPlayers) return;
  state.leftForPlayers = true;
  clearIntervals();
  clearTimers();
  try {
    if (state.bot) state.bot.end('leaving — players online');
  } catch (e) {
    log('Bot', `error leaving: ${e.message}`);
  }
}

function rejoinASAP() {
  if (state.manualStop) return;
  if (state.isReconnecting) return;

  state.isReconnecting = true;
  state.reconnectAttempts++;

  const delay = 8_000;
  log('Bot', `checking again in 8s (attempt #${state.reconnectAttempts})`);
  emitter.emit('reconnecting', { attempt: state.reconnectAttempts, delayMs: delay });

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    state.isReconnecting = false;
    createBot();
  }, delay);
}

module.exports = { start, stop, getStatus, emitter };
