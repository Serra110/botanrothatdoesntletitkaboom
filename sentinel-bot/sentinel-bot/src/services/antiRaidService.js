const GuildConfig = require("../models/GuildConfig");
const quarantineService = require("./quarantineService");
const { fetchAuditEntry, AuditLogEvent } = require("../utils/auditLog");
const { dangerEmbed } = require("../utils/embeds");
const { logForensic, generateIncidentId } = require("./forensicsLogger");
const logger = require("../utils/logger");

// Sliding window of bot entries per server: guildId -> [timestamps]
const botJoinWindows = new Map();

/**
 * Called in the guildMemberAdd event whenever the new member is a bot.
 * If X bots join within Y seconds, automatic kick + quarantine of
 * whoever added them + alert (section 14).
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

  logger.warn(`Anti-Raid: ${timestamps.length} bots joined in ${windowSeconds}s in ${guild.id}`);

  const incidentId = generateIncidentId();
  const entry = await fetchAuditEntry(guild, AuditLogEvent.BotAdd, member.id, 10000);
  const inviterId = entry?.executor?.id || null;

  // Kick the newly joined bot
  await member.kick("Sentinel: Anti-Raid - bot join limit exceeded").catch(() => {});

  // Quarantine whoever invited/added the bots
  if (inviterId) {
    const inviter = await guild.members.fetch(inviterId).catch(() => null);
    if (inviter) {
      await quarantineService.quarantineMember(guild, inviter, "Anti-Raid: mass bot addition", incidentId);
    }
  }

  await logForensic(guild, {
    incidentId,
    actorId: inviterId,
    action: "Anti-Raid: mass bots detected",
    detail: { summary: `${timestamps.length} bots in ${windowSeconds}s` }
  });

  if (config?.logChannelId) {
    const channel = guild.channels.cache.get(config.logChannelId);
    if (channel?.isTextBased()) {
      channel
        .send({
          embeds: [
            dangerEmbed(
              "🤖 Anti-Raid: Bot Attack Detected",
              `${timestamps.length} bots joined in ${windowSeconds}s.\n${invitedById ? `Responsible: <@${invitedById}>` : "Responsible user not identified."}`
            )
          ]
        })
        .catch(() => {});
    }
  }

  botJoinWindows.set(guild.id, []); // reset after response
}

module.exports = { handleBotJoin };
