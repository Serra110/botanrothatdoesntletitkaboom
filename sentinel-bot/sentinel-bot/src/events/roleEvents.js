const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { fetchAuditEntry } = require("../utils/auditLog");
const threatScoreService = require("../services/threatScoreService");
const approvalService = require("../services/approvalService");
const honeypotService = require("../services/honeypotService");
const { hasAdministrator, hasDangerousPermissions, isProtectedRole } = require("../utils/permissions");
const { logForensic } = require("../services/forensicsLogger");
const { maybeEscalate, triggerHoneypotAlert } = require("./channelEvents");
const logger = require("../utils/logger");

function register(client) {
  client.on("roleCreate", async (role) => {
    const config = await GuildConfig.findOne({ guildId: role.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    const actorId = entry?.executor?.id;
    if (!actorId) return;

    await logForensic(role.guild, { actorId, action: `Role criada: ${role.name}` });

    if (hasDangerousPermissions(role.permissions)) {
      const approved = await approvalService.requestApproval(
        role.guild,
        "CREATE_HIGH_PERMISSION_ROLE",
        { summary: `Role "${role.name}" com permissões elevadas` },
        actorId
      );

      if (!approved) {
        await role.delete("Sentinel: criação de role perigosa não aprovada").catch(() => {});
        logger.warn(`Role perigosa "${role.name}" removida por falta de aprovação.`);
        return;
      }

      const result = await threatScoreService.addThreatPoints(
        role.guild.id,
        actorId,
        "DANGEROUS_ROLE_CREATE",
        config?.threatPoints?.dangerousRoleCreate ?? 100
      );
      await maybeEscalate(role.guild, actorId, result.triggered, `Role perigosa criada: ${role.name}`);
    }
  });

  client.on("roleDelete", async (role) => {
    const config = await GuildConfig.findOne({ guildId: role.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    const actorId = entry?.executor?.id;

    if (await honeypotService.isHoneypotTriggered(role.guild.id, { roleId: role.id })) {
      await triggerHoneypotAlert(role.guild, actorId, "role honeypot apagada");
      return;
    }

    if (!actorId) return;

    await logForensic(role.guild, { actorId, action: `Role apagada: ${role.name}` });

    if (isProtectedRole(role.id, config || {})) {
      await logForensic(role.guild, {
        actorId,
        action: "⚠️ Role protegida apagada sem aprovação prévia",
        detail: { summary: role.name }
      });
    }
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    const config = await GuildConfig.findOne({ guildId: newRole.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const actorId = entry?.executor?.id;

    if (await honeypotService.isHoneypotTriggered(newRole.guild.id, { roleId: newRole.id })) {
      await triggerHoneypotAlert(newRole.guild, actorId, "role honeypot alterada");
      return;
    }

    if (!actorId) return;

    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`nome: ${oldRole.name} → ${newRole.name}`);
    if (oldRole.color !== newRole.color) changes.push("cor alterada");
    if (oldRole.position !== newRole.position) changes.push("posição alterada");

    const gainedAdmin = !hasAdministrator(oldRole.permissions) && hasAdministrator(newRole.permissions);
    const permissionsChanged = !oldRole.permissions.equals(newRole.permissions);

    if (permissionsChanged) changes.push("permissões alteradas");

    if (gainedAdmin) {
      changes.push("🚨 Administrator concedido à role");

      const approved = await approvalService.requestApproval(
        newRole.guild,
        "CREATE_HIGH_PERMISSION_ROLE",
        { summary: `Role "${newRole.name}" recebeu Administrator` },
        actorId
      );

      if (!approved) {
        await newRole
          .setPermissions(oldRole.permissions, "Sentinel: concessão de Administrator não aprovada")
          .catch(() => {});
      } else {
        // Regista a concessão para reconstrução da cadeia de responsabilidade
        // (todos os membros com esta role passam a estar associados ao actorId)
        const responsibilityChain = require("../services/responsibilityChain");
        for (const member of newRole.members.values()) {
          responsibilityChain.recordGrant(newRole.guild.id, {
            granteeId: member.id,
            grantedById: actorId,
            grantType: "ROLE_ADMIN"
          });
        }
      }

      const result = await threatScoreService.addThreatPoints(
        newRole.guild.id,
        actorId,
        "GRANT_ADMINISTRATOR",
        config?.threatPoints?.grantAdministrator ?? 120
      );
      await maybeEscalate(newRole.guild, actorId, result.triggered, `Administrator concedido via role ${newRole.name}`);
    }

    if (isProtectedRole(newRole.id, config || {}) && changes.length) {
      await logForensic(newRole.guild, {
        actorId,
        action: `⚠️ Role protegida alterada: ${newRole.name}`,
        detail: { summary: changes.join(", ") }
      });
    } else if (changes.length) {
      await logForensic(newRole.guild, { actorId, action: `Role atualizada: ${newRole.name}`, detail: { summary: changes.join(", ") } });
    }
  });
}

module.exports = { register };
