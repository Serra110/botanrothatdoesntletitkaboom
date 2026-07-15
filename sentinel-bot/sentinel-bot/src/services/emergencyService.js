const { PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const Incident = require("../models/Incident");
const lockdownService = require("./lockdownService");
const quarantineService = require("./quarantineService");
const backupService = require("./backupService");
const rollbackService = require("./rollbackService");
const responsibilityChain = require("./responsibilityChain");
const { generateIncidentId, logForensic } = require("./forensicsLogger");
const { emergencyEmbed } = require("../utils/embeds");
const logger = require("../utils/logger");

/**
 * Ativa o modo de emergência (secção 7). responsibleUserIds deve
 * incluir todos os utilizadores identificados como responsáveis
 * (principal + secundários) para serem colocados em quarentena.
 */
async function activateEmergency(guild, { reason, responsibleUserIds = [], recentPrivilegeGranteeIds = [] } = {}) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config?.emergencyActive) {
    logger.debug(`Emergência já ativa em ${guild.id}, a ignorar novo trigger.`);
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

  await logForensic(guild, { incidentId, action: "EMERGÊNCIA ATIVADA", detail: { summary: reason } });

  // 1. Remove roles administrativas do staff (exceto Owner/Co-Owner)
  const behavior = config?.emergencyBehavior || {};
  const strippedAdmins = [];

  if (behavior.stripAdminFromStaff !== false) {
    await guild.members.fetch();
    for (const member of guild.members.cache.values()) {
      if (member.id === config?.ownerId || member.id === config?.coOwnerId) continue;
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;

      const adminRoles = member.roles.cache.filter((r) => r.permissions.has(PermissionsBitField.Flags.Administrator));
      for (const role of adminRoles.values()) {
        await member.roles.remove(role, "Sentinel: emergência - remoção de Administrator").catch(() => {});
      }
      strippedAdmins.push(member.id);
    }
  }

  await logForensic(guild, {
    incidentId,
    action: "Admin removido",
    detail: { summary: strippedAdmins.map((id) => `<@${id}>`).join(", ") || "nenhum" }
  });

  // 2. Quarentena dos responsáveis e de quem recebeu permissões perigosas recentemente
  const toQuarantine = new Set();
  if (behavior.quarantineResponsible !== false) {
    responsibleUserIds.forEach((id) => toQuarantine.add(id));
  }
  if (behavior.quarantineRecentPrivilegeGrantees !== false) {
    recentPrivilegeGranteeIds.forEach((id) => toQuarantine.add(id));
  }

  for (const userId of toQuarantine) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await quarantineService.quarantineMember(guild, member, `Emergência: ${reason}`, incidentId);
  }

  await logForensic(guild, {
    incidentId,
    action: "Utilizadores em quarentena",
    detail: { summary: [...toQuarantine].map((id) => `<@${id}>`).join(", ") || "nenhum" }
  });

  // 3. Lockdown do servidor
  if (behavior.lockdownServer !== false) {
    await lockdownService.enableLockdown(guild);
    await logForensic(guild, { incidentId, action: "Servidor em Lockdown" });
  }

  incident.responseTimeMs = Date.now() - detectionTime;
  await incident.save();

  // Notifica Owner/Co-Owner
  const embed = emergencyEmbed(
    "🚨 MODO DE EMERGÊNCIA ATIVADO",
    [
      `**Motivo:** ${reason}`,
      `**Incidente:** \`${incidentId}\``,
      responsibleUserIds.length ? `**Responsáveis:** ${responsibleUserIds.map((id) => `<@${id}>`).join(", ")}` : null
    ]
      .filter(Boolean)
      .join("\n")
  );

  for (const id of [config?.ownerId, config?.coOwnerId].filter(Boolean)) {
    guild.members
      .fetch(id)
      .then((m) => m.send({ embeds: [embed] }).catch(() => {}))
      .catch(() => {});
  }

  // 4. Inicia fluxo de rollback (não bloqueante)
  rollbackService.initiateRollbackFlow(guild).then(async (backup) => {
    incident.endedAt = new Date();
    incident.recoveryTimeMs = Date.now() - detectionTime;
    incident.backupRestoredId = backup?._id || null;
    incident.resolved = true;
    await incident.save();
    await logForensic(guild, { incidentId, action: "Rollback concluído" });
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
  logger.info(`Emergência desativada manualmente em ${guild.id}`);
}

module.exports = { activateEmergency, deactivateEmergency };
