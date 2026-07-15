const Incident = require("../models/Incident");
const GuildConfig = require("../models/GuildConfig");
const { neutralEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Logs a forensic line. If incidentId is provided, adds the
 * action to the corresponding incident. Always also sends to the
 * configured log channel, if it exists.
 */
async function logForensic(guild, { incidentId = null, actorId = null, action, detail = {} }) {
  logger.info(`[Forensic][${guild.id}] ${action} ${actorId ? `by ${actorId}` : ""}`);

  if (incidentId) {
    await Incident.updateOne(
      { incidentId },
      { $push: { actions: { actorId, action, detail, timestamp: new Date() } } }
    ).catch((e) => logger.error(`Failed to save forensic action: ${e.message}`));
  }

  const config = await GuildConfig.findOne({ guildId: guild.id }).lean().catch(() => null);
  if (!config?.logChannelId) return;

  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isTextBased()) return;

  const lines = [
    actorId ? `**Actor:** <@${actorId}>` : null,
    detail?.summary ? `**Detail:** ${detail.summary}` : null,
    incidentId ? `**Incident:** \`${incidentId}\`` : null
  ].filter(Boolean);

  const embed = neutralEmbed(action, lines.join("\n") || null);

  channel.send({ embeds: [embed] }).catch(() => {});
}

function generateIncidentId() {
  return `INC-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { logForensic, generateIncidentId };
