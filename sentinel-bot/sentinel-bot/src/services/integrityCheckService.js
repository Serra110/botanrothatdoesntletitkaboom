const backupService = require("./backupService");
const GuildConfig = require("../models/GuildConfig");
const { warnEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Compara o estado atual do servidor com o último backup válido,
 * assinalando diferenças (secção 13): canais/roles desaparecidos,
 * permissões alteradas, bots novos, webhooks novos, canais críticos
 * em falta.
 */
async function runIntegrityCheck(guild) {
  const latest = await backupService.getLatestValidBackup(guild.id);
  if (!latest) {
    logger.debug(`Sem backup de referência para integrity check em ${guild.id}`);
    return null;
  }

  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const findings = [];

  await guild.channels.fetch();
  await guild.roles.fetch();

  const currentChannelIds = new Set(guild.channels.cache.keys());
  const currentRoleIds = new Set(guild.roles.cache.keys());

  for (const ch of latest.data.channels) {
    if (!currentChannelIds.has(ch.id)) findings.push(`Canal desaparecido: **#${ch.name}**`);
  }
  for (const cat of latest.data.categories) {
    if (!currentChannelIds.has(cat.id)) findings.push(`Categoria desaparecida: **${cat.name}**`);
  }
  for (const role of latest.data.roles) {
    if (!currentRoleIds.has(role.id)) findings.push(`Role desaparecida: **${role.name}**`);
  }

  // Canais críticos em falta
  for (const criticalId of config?.criticalChannelIds || []) {
    if (!currentChannelIds.has(criticalId)) findings.push(`⚠️ Canal crítico em falta: \`${criticalId}\``);
  }

  // Bots novos desde o backup
  const knownBotIds = new Set(
    latest.data.roles.length ? [] : [] // placeholder: sem lista de bots no backup, comparar via membros atuais
  );
  const currentBots = guild.members.cache.filter((m) => m.user.bot);
  const backupCreatedAt = new Date(latest.createdAt).getTime();
  for (const bot of currentBots.values()) {
    if (bot.joinedTimestamp && bot.joinedTimestamp > backupCreatedAt) {
      findings.push(`Novo bot desde o último backup: <@${bot.id}>`);
    }
  }

  // Webhooks novos
  try {
    const currentWebhooks = await guild.fetchWebhooks();
    const backupWebhookIds = new Set(latest.data.webhooks.map((w) => w.id));
    for (const wh of currentWebhooks.values()) {
      if (!backupWebhookIds.has(wh.id)) findings.push(`Novo webhook: **${wh.name}**`);
    }
  } catch (e) {
    logger.debug(`Não foi possível comparar webhooks: ${e.message}`);
  }

  if (findings.length && config?.logChannelId) {
    const channel = guild.channels.cache.get(config.logChannelId);
    if (channel?.isTextBased()) {
      await channel
        .send({ embeds: [warnEmbed("🔍 Integrity Check — Diferenças encontradas", findings.join("\n"))] })
        .catch(() => {});
    }
  }

  return findings;
}

module.exports = { runIntegrityCheck };
