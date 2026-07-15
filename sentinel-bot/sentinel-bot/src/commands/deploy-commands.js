require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const logger = require("../utils/logger");

async function deployCommands() {
  const commands = [];
  const commandsPath = __dirname;
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js") && f !== "deploy-commands.js");

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command?.data) commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    logger.info(`A registar ${commands.length} comandos slash...`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    logger.info("Comandos registados com sucesso.");
  } catch (err) {
    logger.error(`Falha ao registar comandos: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
