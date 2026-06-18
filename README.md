# Falix LazyMC Discord Bot 🎮

A **24/7 LazyMC-style Discord bot** for Falix Minecraft servers, hosted on **WispByte**.

The bot keeps your Minecraft server alive with an AFK Mineflayer bot, monitors player count, and automatically "sleeps" the server when idle — just like LazyMC.

---

## ✨ Features

| Feature | Details |
|---|---|
| `/start` | Wakes the Falix server — AFK bot joins immediately |
| `/stop` | Puts server to sleep — AFK bot disconnects |
| `/status` | Full server status with player count, uptime, idle timer |
| **LazyMC idle detection** | Auto-disconnects when 0 players for N minutes |
| **Anti-AFK routines** | Arm swing, look-around, micro-walk, sneak — avoids Falix kick |
| **Auto-reconnect** | Exponential backoff reconnect (never gives up unless stopped) |
| **Discord presence** | Shows live player count in bot's status |
| **Status channel** | Optional channel for auto-notifications |

---

## 🚀 Setup (WispByte)

### 1. Create a Discord Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a new application → Bot → **Reset Token** → copy token
3. Enable **Privileged Gateway Intents**: `Presence`, `Server Members`, `Message Content`
4. Invite bot with these permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`, `Read Message History`

### 2. Get your IDs
- **CLIENT_ID**: Your application's Client ID (General Information tab)
- **GUILD_ID**: Right-click your Discord server → Copy Server ID (Enable Developer Mode first)
- **STATUS_CHANNEL_ID**: Right-click a channel → Copy Channel ID

### 3. Upload to WispByte
1. Go to [wispbyte.com](https://wispbyte.com) → Create a Node.js bot
2. Upload all files in this folder (or connect via GitHub)
3. In **Environment Variables**, add:

```
DISCORD_TOKEN      = your_bot_token
CLIENT_ID          = your_client_id
GUILD_ID           = your_guild_id
MC_SERVER_IP       = yourserver.falixsrv.me
MC_SERVER_PORT     = 25565
MC_USERNAME        = LazyAFKBot
MC_AUTH            = offline
IDLE_TIMEOUT_MINUTES = 10
STATUS_CHANNEL_ID  = (optional)
```

4. Set **Start Command** to: `node index.js`
5. Click **Start** — the bot is live!

### 4. First Run
The bot will **automatically**:
- Register `/start`, `/stop`, `/status` slash commands in your server
- Start the AFK bot and connect to your Falix server
- Begin monitoring player count

---

## 🧠 How LazyMC Logic Works

```
Player Joins Falix Server
       │
       ▼
AFK Bot already connected ──→ Server stays AWAKE ✅
       │
       │  (nobody plays for IDLE_TIMEOUT_MINUTES)
       ▼
AFK Bot DISCONNECTS ──→ Falix idles/sleeps server 💤
       │
       │  (player or /start command)
       ▼
AFK Bot RECONNECTS ──→ Falix wakes server up 🚀
```

- The AFK bot itself does **not** count as a real player
- Idle timer resets the moment any real player joins
- `/stop` is an immediate manual sleep — no idle timer involved

---

## 🔧 Configuration

All config is done via environment variables — **no code editing needed**.

| Variable | Default | Description |
|---|---|---|
| `DISCORD_TOKEN` | *(required)* | Discord bot token |
| `CLIENT_ID` | *(required)* | Discord application client ID |
| `GUILD_ID` | *(required)* | Your Discord server ID |
| `MC_SERVER_IP` | *(required)* | Falix server address |
| `MC_SERVER_PORT` | `25565` | Falix server port |
| `MC_USERNAME` | `LazyAFKBot` | AFK bot Minecraft username |
| `MC_PASSWORD` | *(empty)* | Leave empty for offline/cracked |
| `MC_AUTH` | `offline` | `offline` for cracked, `microsoft` for premium |
| `IDLE_TIMEOUT_MINUTES` | `10` | Minutes idle before auto-sleep |
| `STATUS_CHANNEL_ID` | *(optional)* | Discord channel for auto-notifications |

---

## 📁 File Structure

```
FalixLazyBot/
├── index.js        ← Discord bot + command handler
├── minecraft.js    ← LazyMC AFK bot + idle detection
├── config.js       ← Env var loader
├── package.json    ← Dependencies
├── .env.example    ← Template (copy to .env for local testing)
└── README.md       ← This file
```

---

## 🏠 Running Locally (for testing)

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env
# Edit .env with your values

# Start
npm start
```

---

