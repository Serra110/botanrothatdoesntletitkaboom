const { PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const Incident = require("../models/Incident");
const lockdownService = require("./lockdownService");
const quarantineService = require("./quarantineService");
const backupService = require("./backupService");
const rollbackService = require("./rollbackService");
const responsibilityChain = require("./responsibilityChain");
const { generateIncidentId, logForensic } = require("./forensicsLogger");
const { getOwnerIds } = require("../utils/permissions");
const { emergencyEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Activates emergency mode (section 7). responsibleUserIds must
 * include all users identified as responsible (primary + secondary)
 * to be quarantined.
 */
async function activateEmergency(guild, { reason, responsibleUserIds = [], recentPrivilegeGranteeIds = [] } = {}) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config?.emergencyActive) {
    logger.debug(`Emergency already active in ${guild.id}, ignoring new trigger.`);
    return null;
  }

  const detectionTime = Date.now();
  const incidentId = generateIncidentId();

  backupService.markEmergency(guild.id, true);
  if (config) {
    config.emergencyActive = true;
    await config.save();
  }

  const incident = await Incident.create({
    guildId: guild.id,
    incidentId,
    reason,
    primaryResponsible: responsibleUserIds[0] || null,
    secondaryResponsible: responsibleUserIds.slice(1)
  });

  await logForensic(guild, { incidentId, action: "EMERGENCY ACTIVATED", detail: { summary: reason } });

  // 1. Remove admin roles from staff (except Owner/Co-Owner)
  const behavior = config?.emergencyBehavior || {};
  const strippedAdmins = [];

  if (behavior.stripAdminFromStaff !== false) {
    await guild.members.fetch();
    for (const member of guild.members.cache.values()) {
      const ownerIds = getOwnerIds();
      if (ownerIds.includes(member.id)) continue;
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;

      const adminRoles = member.roles.cache.filter((r) => r.permissions.has(PermissionsBitField.Flags.Administrator));
      for (const role of adminRoles.values()) {
        await member.roles.remove(role, "Sentinel: emergency - Administrator removed").catch(() => {});
      }
      strippedAdmins.push(member.id);
    }
  }

  await logForensic(guild, {
    incidentId,
    action: "Admin removed",
    detail: { summary: strippedAdmins.map((id) => `<@${id}>`).join(", ") || "none" }
  });

  // 2. Quarantine responsible users and those who recently received dangerous permissions
  const toQuarantine = new Set();
  if (behavior.quarantineResponsible !== false) {
    responsibleUserIds.forEach((id) => toQuarantine.add(id));
  }
  if (behavior.quarantineRecentPrivilegeGrantees !== false) {
    recentPrivilegeGranteeIds.forEach((id) => toQuarantine.add(id));
  }

  for (const userId of toQuarantine) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await quarantineService.quarantineMember(guild, member, `Emergency: ${reason}`, incidentId);
  }

  await logForensic(guild, {
    incidentId,
    action: "Users quarantined",
    detail: { summary: [...toQuarantine].map((id) => `<@${id}>`).join(", ") || "none" }
  });

  // 3. Server lockdown
  if (behavior.lockdownServer !== false) {
    await lockdownService.enableLockdown(guild);
    await logForensic(guild, { incidentId, action: "Server Lockdown" });
  }

  incident.responseTimeMs = Date.now() - detectionTime;
  await incident.save();

  // Notify Owner/Co-Owner
  const embed = emergencyEmbed(
    "🚨 EMERGENCY MODE ACTIVATED",
    [
      `**Reason:** ${reason}`,
      `**Incident:** \`${incidentId}\``,
      responsibleUserIds.length ? `**Responsible:** ${responsibleUserIds.map((id) => `<@${id}>`).join(", ")}` : null
    ]
      .filter(Boolean)
      .join("\n")
  );

  for (const id of getOwnerIds()) {
    guild.members
      .fetch(id)
      .then((m) => m.send({ embeds: [embed] }).catch(() => {}))
      .catch(() => {});
  }

  // 4. Initiate rollback flow (non-blocking)
  rollbackService.initiateRollbackFlow(guild).then(async (backup) => {
    incident.endedAt = new Date();
    incident.recoveryTimeMs = Date.now() - detectionTime;
    incident.backupRestoredId = backup?._id || null;
    incident.resolved = true;
    await incident.save();
    await logForensic(guild, { incidentId, action: "Rollback completed" });
  });

  return incident;
}

async function deactivateEmergency(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config?.emergencyActive) return;

  backupService.markEmergency(guild.id, false);
  config.emergencyActive = false;
  await config.save();

  await lockdownService.disableLockdown(guild);
  logger.info(`Emergency deactivated manually in ${guild.id}`);
}

module.exports = { activateEmergency, deactivateEmergency };
