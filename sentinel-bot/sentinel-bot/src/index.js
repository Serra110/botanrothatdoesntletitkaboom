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
    GatewayIntentBits.MessageContent // apenas necessário se quiseres inspecionar conteúdo de mensagens
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
  logger.info(`${client.commands.size} comandos carregados.`);
}

function scheduleJobs() {
  // Backup automático: corre a cada minuto e decide, por servidor,
  // se já passou o intervalo configurado (permite intervalos por
  // servidor mesmo com uma única tarefa cron).
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
        logger.error(`Erro no backup automático de ${guild.id}: ${e.message}`)
      );
    }
  });

  // Integrity check: corre a cada 15 minutos
  cron.schedule("*/15 * * * *", async () => {
    for (const guild of client.guilds.cache.values()) {
      await integrityCheckService.runIntegrityCheck(guild).catch((e) =>
        logger.error(`Erro no integrity check de ${guild.id}: ${e.message}`)
      );
    }
  });

  logger.info("Tarefas agendadas (backup automático + integrity check) iniciadas.");
}

async function bootstrap() {
  await connectDatabase();
  loadCommands();
  registerAllEvents(client);
  scheduleJobs();

  client.once("clientReady", () => {
    logger.info(`Sentinel ligado como ${client.user.tag}`);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

bootstrap().catch((err) => {
  logger.error(`Falha ao iniciar o bot: ${err.message}`);
  process.exit(1);
});
