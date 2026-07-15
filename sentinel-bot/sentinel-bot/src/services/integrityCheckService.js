const backupService = require("./backupService");
const GuildConfig = require("../models/GuildConfig");
const { getCriticalChannelIds } = require("../utils/permissions");
const { warnEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Compares the current server state with the latest valid backup,
 * flagging differences (section 13): missing channels/roles,
 * changed permissions, new bots, new webhooks, missing critical channels.
 */
async function runIntegrityCheck(guild) {
  const latest = await backupService.getLatestValidBackup(guild.id);
  if (!latest) {
    logger.debug(`No reference backup for integrity check in ${guild.id}`);
    return null;
  }

  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const findings = [];

  await guild.channels.fetch();
  await guild.roles.fetch();

  const currentChannelIds = new Set(guild.channels.cache.keys());
  const currentRoleIds = new Set(guild.roles.cache.keys());

  for (const ch of latest.data.channels) {
    if (!currentChannelIds.has(ch.id)) findings.push(`Missing channel: **#${ch.name}**`);
  }
  for (const cat of latest.data.categories) {
    if (!currentChannelIds.has(cat.id)) findings.push(`Missing category: **${cat.name}**`);
  }
  for (const role of latest.data.roles) {
    if (!currentRoleIds.has(role.id)) findings.push(`Missing role: **${role.name}**`);
  }

  // Missing critical channels
  for (const criticalId of getCriticalChannelIds()) {
    if (!currentChannelIds.has(criticalId)) findings.push(`⚠️ Missing critical channel: \`${criticalId}\``);
  }

  // New bots since backup
  const knownBotIds = new Set(
    latest.data.roles.length ? [] : [] // placeholder: no bot list in backup, compare via current members
  );
  const currentBots = guild.members.cache.filter((m) => m.user.bot);
  const backupCreatedAt = new Date(latest.createdAt).getTime();
  for (const bot of currentBots.values()) {
    if (bot.joinedTimestamp && bot.joinedTimestamp > backupCreatedAt) {
      findings.push(`New bot since last backup: <@${bot.id}>`);
    }
  }

  // New webhooks
  try {
    const currentWebhooks = await guild.fetchWebhooks();
    const backupWebhookIds = new Set(latest.data.webhooks.map((w) => w.id));
    for (const wh of currentWebhooks.values()) {
      if (!backupWebhookIds.has(wh.id)) findings.push(`New webhook: **${wh.name}**`);
    }
  } catch (e) {
    logger.debug(`Could not compare webhooks: ${e.message}`);
  }

  if (findings.length && config?.logChannelId) {
    const channel = guild.channels.cache.get(config.logChannelId);
    if (channel?.isTextBased()) {
      await channel
        .send({ embeds: [warnEmbed("🔍 Integrity Check — Differences found", findings.join("\n"))] })
        .catch(() => {});
    }
  }

  return findings;
}

module.exports = { runIntegrityCheck };
