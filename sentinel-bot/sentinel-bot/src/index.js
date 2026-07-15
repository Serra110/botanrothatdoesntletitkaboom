require("dotenv").config();
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");

const { connectDatabase } = require("./database/connect");
const { registerAllEvents } = require("./events");
const GuildConfig = require("./models/GuildConfig");
const backupService = require("./services/backupService");
const integrityCheckService = require("./services/integrityCheckService");
const chatLogger = require("./services/chatLogger");
const logger = require("./utils/logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, // bans
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // only needed if you want to inspect message content
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

client.commands = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, "commands");
  const files = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith(".js") && f !== "deploy-commands.js");

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
    }
  }
  logger.info(`${client.commands.size} commands loaded.`);
}

function scheduleJobs() {
  // Automatic backup: runs every minute and decides, per server,
  // if the configured interval has passed (allows per-server
  // intervals even with a single cron job).
  const lastBackupAt = new Map();

  cron.schedule("* * * * *", async () => {
    for (const guild of client.guilds.cache.values()) {
      const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
      if (!config) continue;

      const intervalMs = (config.backupIntervalMinutes || 30) * 60 * 1000;
      const last = lastBackupAt.get(guild.id) || 0;
      if (Date.now() - last < intervalMs) continue;

      lastBackupAt.set(guild.id, Date.now());
      await backupService.createBackup(guild, { manual: false }).catch((e) =>
        logger.error(`Automatic backup error for ${guild.id}: ${e.message}`)
      );
    }
  });

  // Integrity check: runs every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    for (const guild of client.guilds.cache.values()) {
      await integrityCheckService.runIntegrityCheck(guild).catch((e) =>
        logger.error(`Integrity check error for ${guild.id}: ${e.message}`)
      );
    }
  });

  logger.info("Scheduled jobs (automatic backup + integrity check) started.");
}

async function bootstrap() {
  await connectDatabase();
  loadCommands();
  registerAllEvents(client);
  scheduleJobs();

  client.once("clientReady", () => {
    logger.info(`Sentinel logged in as ${client.user.tag}`);
  });

  // Chat logging: save messages from configured channels
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    await chatLogger.saveMessage(message).catch((e) =>
      logger.error(`Chat save error: ${e.message}`)
    );
  });

  await client.login(process.env.DISCORD_TOKEN);
}

bootstrap().catch((err) => {
  logger.error(`Failed to start bot: ${err.message}`);
  process.exit(1);
});
