const Incident = require("../models/Incident");
const GuildConfig = require("../models/GuildConfig");
const { neutralEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Regista uma linha forense. Se incidentId for fornecido, adiciona a
 * ação ao incidente correspondente. Envia sempre também para o canal
 * de logs configurado, se existir.
 */
async function logForensic(guild, { incidentId = null, actorId = null, action, detail = {} }) {
  logger.info(`[Forense][${guild.id}] ${action} ${actorId ? `por ${actorId}` : ""}`);

  if (incidentId) {
    await Incident.updateOne(
      { incidentId },
      { $push: { actions: { actorId, action, detail, timestamp: new Date() } } }
    ).catch((e) => logger.error(`Falha ao gravar ação forense: ${e.message}`));
  }

  const config = await GuildConfig.findOne({ guildId: guild.id }).lean().catch(() => null);
  if (!config?.logChannelId) return;

  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isTextBased()) return;

  const lines = [
    actorId ? `**Ator:** <@${actorId}>` : null,
    detail?.summary ? `**Detalhe:** ${detail.summary}` : null,
    incidentId ? `**Incidente:** \`${incidentId}\`` : null
  ].filter(Boolean);

  const embed = neutralEmbed(action, lines.join("\n") || null);

  channel.send({ embeds: [embed] }).catch(() => {});
}

function generateIncidentId() {
  return `INC-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { logForensic, generateIncidentId };
