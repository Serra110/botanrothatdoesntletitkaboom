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

    await logForensic(role.guild, { actorId, action: `Role created: ${role.name}` });

    if (hasDangerousPermissions(role.permissions)) {
      const approved = await approvalService.requestApproval(
        role.guild,
        "CREATE_HIGH_PERMISSION_ROLE",
        { summary: `Role "${role.name}" with elevated permissions` },
        actorId
      );

      if (!approved) {
        await role.delete("Sentinel: dangerous role creation not approved").catch(() => {});
        logger.warn(`Dangerous role "${role.name}" removed due to lack of approval.`);
        return;
      }

      const result = await threatScoreService.addThreatPoints(
        role.guild.id,
        actorId,
        "DANGEROUS_ROLE_CREATE",
        config?.threatPoints?.dangerousRoleCreate ?? 100
      );
      await maybeEscalate(role.guild, actorId, result.triggered, `Dangerous role created: ${role.name}`);
    }
  });

  client.on("roleDelete", async (role) => {
    const config = await GuildConfig.findOne({ guildId: role.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    const actorId = entry?.executor?.id;

    if (await honeypotService.isHoneypotTriggered(role.guild.id, { roleId: role.id })) {
      await triggerHoneypotAlert(role.guild, actorId, "honeypot role deleted");
      return;
    }

    if (!actorId) return;

    await logForensic(role.guild, { actorId, action: `Role deleted: ${role.name}` });

    if (isProtectedRole(role.id, config || {})) {
      await logForensic(role.guild, {
        actorId,
        action: "⚠️ Protected role deleted without prior approval",
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
      await triggerHoneypotAlert(newRole.guild, actorId, "honeypot role updated");
      return;
    }

    if (!actorId) return;

    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`name: ${oldRole.name} → ${newRole.name}`);
    if (oldRole.color !== newRole.color) changes.push("color changed");
    if (oldRole.position !== newRole.position) changes.push("position changed");

    const gainedAdmin = !hasAdministrator(oldRole.permissions) && hasAdministrator(newRole.permissions);
    const permissionsChanged = !oldRole.permissions.equals(newRole.permissions);

    if (permissionsChanged) changes.push("permissions changed");

    if (gainedAdmin) {
      changes.push("🚨 Administrator granted to role");

      const approved = await approvalService.requestApproval(
        newRole.guild,
        "CREATE_HIGH_PERMISSION_ROLE",
        { summary: `Role "${newRole.name}" received Administrator` },
        actorId
      );

      if (!approved) {
        await newRole
          .setPermissions(oldRole.permissions, "Sentinel: Administrator grant not approved")
          .catch(() => {});
      } else {
        // Record the grant for responsibility chain reconstruction
        // (all members with this role become associated with actorId)
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
      await maybeEscalate(newRole.guild, actorId, result.triggered, `Administrator granted via role ${newRole.name}`);
    }

    if (isProtectedRole(newRole.id, config || {}) && changes.length) {
      await logForensic(newRole.guild, {
        actorId,
        action: `⚠️ Protected role updated: ${newRole.name}`,
        detail: { summary: changes.join(", ") }
      });
    } else if (changes.length) {
      await logForensic(newRole.guild, { actorId, action: `Role updated: ${newRole.name}`, detail: { summary: changes.join(", ") } });
    }
  });
}

module.exports = { register };
