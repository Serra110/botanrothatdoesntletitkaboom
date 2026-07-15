const { PermissionsBitField, ChannelType } = require("discord.js");
const Quarantine = require("../models/Quarantine");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * Ensures a quarantine role exists on the server; creates one if
 * it doesn't exist and sets up the necessary permission overwrites.
 */
async function ensureQuarantineRole(guild, config) {
  if (config.quarantineRoleId) {
    const existing = guild.roles.cache.get(config.quarantineRoleId);
    if (existing) return existing;
  }

  const role = await guild.roles.create({
    name: "Quarantine (Sentinel)",
    color: "DarkGrey",
    permissions: [],
    reason: "Automatic quarantine role creation by Sentinel"
  });

  // Block message sending and interaction in all text channels
  await Promise.all(
    guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
      .map((c) =>
        c.permissionOverwrites
          .edit(role, {
            SendMessages: false,
            Speak: false,
            AddReactions: false,
            CreateInstantInvite: false
          })
          .catch(() => {})
      )
  );

  await GuildConfig.updateOne({ guildId: guild.id }, { $set: { quarantineRoleId: role.id } });
  logger.info(`Quarantine role created in ${guild.id}: ${role.id}`);

  return role;
}

/**
 * Quarantines a member: saves current roles, removes them
 * (except @everyone), and assigns the quarantine role.
 */
async function quarantineMember(guild, member, reason = "Suspicious behavior", incidentId = null) {
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const role = await ensureQuarantineRole(guild, config);

  const previousRoleIds = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);

  await Quarantine.findOneAndUpdate(
    { guildId: guild.id, userId: member.id, status: "active" },
    { guildId: guild.id, userId: member.id, reason, incidentId, previousRoleIds, status: "active", quarantinedAt: new Date() },
    { upsert: true, new: true }
  );

  await member.roles.set([role.id]).catch((e) => logger.error(`Failed to apply quarantine: ${e.message}`));

  logger.info(`User ${member.id} quarantined in ${guild.id} (${reason})`);
}

/**
 * Clears quarantine. If innocent=true, restores previous roles.
 * Otherwise, keeps the quarantine role until manual decision
 * (user is just marked as "guilty" — actual role removal is
 * left to staff).
 */
async function clearQuarantine(guild, userId, innocent, decidedById = null) {
  const record = await Quarantine.findOne({ guildId: guild.id, userId, status: "active" });
  if (!record) return false;

  record.status = innocent ? "cleared" : "guilty";
  record.decidedAt = new Date();
  record.decidedBy = decidedById;
  await record.save();

  if (innocent) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      const rolesToRestore = record.previousRoleIds.filter((id) => guild.roles.cache.has(id));
      await member.roles.set(rolesToRestore).catch((e) => logger.error(`Failed to restore roles: ${e.message}`));
    }
    logger.info(`Quarantine cleared for ${userId} (innocent) in ${guild.id}`);
  } else {
    logger.info(`User ${userId} marked as guilty in ${guild.id}, remains in quarantine`);
  }

  return true;
}

async function isQuarantined(guildId, userId) {
  const record = await Quarantine.findOne({ guildId, userId, status: "active" }).lean();
  return !!record;
}

module.exports = { ensureQuarantineRole, quarantineMember, clearQuarantine, isQuarantined };
