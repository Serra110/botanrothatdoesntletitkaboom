const GuildConfig = require("../models/GuildConfig");
const quarantineService = require("./quarantineService");
const { fetchAuditEntry, AuditLogEvent } = require("../utils/auditLog");
const { dangerEmbed } = require("../utils/embeds");
const { logForensic, generateIncidentId } = require("./forensicsLogger");
const logger = require("../utils/logger");

// Janela deslizante de entradas de bots por servidor: guildId -> [timestamps]
const botJoinWindows = new Map();

/**
 * Chamado no evento guildMemberAdd sempre que o novo membro é um bot.
 * Se X bots entrarem em Y segundos, kick automático + quarentena de
 * quem os adicionou + alerta (secção 14).
 */
async function handleBotJoin(member) {
  const guild = member.guild;
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const threshold = config?.antiRaid?.botJoinThreshold ?? 3;
  const windowSeconds = config?.antiRaid?.windowSeconds ?? 5;
  const windowMs = windowSeconds * 1000;

  const now = Date.now();
  const timestamps = (botJoinWindows.get(guild.id) || []).filter((t) => now - t <= windowMs);
  timestamps.push(now);
  botJoinWindows.set(guild.id, timestamps);

  if (timestamps.length < threshold) return;

  logger.warn(`Anti-Raid: ${timestamps.length} bots entraram em ${windowSeconds}s em ${guild.id}`);

  const incidentId = generateIncidentId();
  const entry = await fetchAuditEntry(guild, AuditLogEvent.BotAdd, member.id, 10000);
  const inviterId = entry?.executor?.id || null;

  // Kick do bot recém-entrado
  await member.kick("Sentinel: Anti-Raid - limite de bots adicionados excedido").catch(() => {});

  // Quarentena de quem convidou/adicionou os bots
  if (inviterId) {
    const inviter = await guild.members.fetch(inviterId).catch(() => null);
    if (inviter) {
      await quarantineService.quarantineMember(guild, inviter, "Anti-Raid: adição em massa de bots", incidentId);
    }
  }

  await logForensic(guild, {
    incidentId,
    actorId: inviterId,
    action: "Anti-Raid: bots em massa detetados",
    detail: { summary: `${timestamps.length} bots em ${windowSeconds}s` }
  });

  if (config?.logChannelId) {
    const channel = guild.channels.cache.get(config.logChannelId);
    if (channel?.isTextBased()) {
      channel
        .send({
          embeds: [
            dangerEmbed(
              "🤖 Anti-Raid: Ataque de Bots Detetado",
              `${timestamps.length} bots entraram em ${windowSeconds}s.\n${inviterId ? `Responsável: <@${inviterId}>` : "Responsável não identificado."}`
            )
          ]
        })
        .catch(() => {});
    }
  }

  botJoinWindows.set(guild.id, []); // reset após resposta
}

module.exports = { handleBotJoin };
