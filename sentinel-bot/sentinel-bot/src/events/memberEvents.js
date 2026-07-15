const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { fetchAuditEntry } = require("../utils/auditLog");
const threatScoreService = require("../services/threatScoreService");
const antiRaidService = require("../services/antiRaidService");
const responsibilityChain = require("../services/responsibilityChain");
const { hasAdministrator } = require("../utils/permissions");
const { logForensic } = require("../services/forensicsLogger");
const { maybeEscalate } = require("./channelEvents");
const quarantineService = require("../services/quarantineService");
const logger = require("../utils/logger");

function register(client) {
  client.on("guildMemberAdd", async (member) => {
    await logForensic(member.guild, { actorId: member.id, action: "Member joined" });

    if (member.user.bot) {
      const entry = await fetchAuditEntry(member.guild, AuditLogEvent.BotAdd, member.id, 10000);
      const invitedById = entry?.executor?.id;
      await logForensic(member.guild, {
        actorId: invitedById,
        action: `Bot added: ${member.user.tag}`,
        detail: { summary: `Invited by ${invitedById ? `<@${invitedById}>` : "unknown"}` }
      });
      await antiRaidService.handleBotJoin(member);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    const entry = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id, 5000);
    if (entry?.executor?.id) {
      await logForensic(member.guild, {
        actorId: entry.executor.id,
        action: `Member kicked: ${member.user.tag}`
      });
    } else {
      await logForensic(member.guild, { actorId: member.id, action: `Member left: ${member.user.tag}` });
    }
  });

  client.on("guildBanAdd", async (ban) => {
    const config = await GuildConfig.findOne({ guildId: ban.guild.id }).lean();
    const entry = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id, 5000);
    const actorId = entry?.executor?.id;

    await logForensic(ban.guild, { actorId, action: `Member banned: ${ban.user.tag}` });

    if (!actorId) return;

    const recentBans = await threatScoreService.countRecentActions(ban.guild.id, actorId, "MEMBER_BAN", 30_000);
    await threatScoreService.addThreatPoints(ban.guild.id, actorId, "MEMBER_BAN", 0);

    if (recentBans + 1 >= 5) {
      const result = await threatScoreService.addThreatPoints(
        ban.guild.id,
        actorId,
        "MASS_BAN",
        config?.threatPoints?.massBan ?? 150
      );
      await maybeEscalate(ban.guild, actorId, result.triggered, "Mass member ban");
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const config = await GuildConfig.findOne({ guildId: newMember.guild.id }).lean();
    if (config?.maintenanceMode) return;

    // Timeout applied/removed
    const wasTimedOut = !!oldMember.communicationDisabledUntilTimestamp;
    const isTimedOut = !!newMember.communicationDisabledUntilTimestamp;
    if (wasTimedOut !== isTimedOut) {
      const entry = await fetchAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, 5000);
      await logForensic(newMember.guild, {
        actorId: entry?.executor?.id,
        action: `Timeout ${isTimedOut ? "applied to" : "removed from"} ${newMember.user.tag}`
      });
    }

    // Nickname
    if (oldMember.nickname !== newMember.nickname) {
      await logForensic(newMember.guild, {
        actorId: newMember.id,
        action: `Nickname changed: ${newMember.user.tag}`,
        detail: { summary: `${oldMember.nickname || "(none)"} → ${newMember.nickname || "(none)"}` }
      });
    }

    // Roles assigned/removed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const added = newRoles.filter((r) => !oldRoles.has(r.id));
    const removed = oldRoles.filter((r) => !newRoles.has(r.id));

    if (added.size || removed.size) {
      const entry = await fetchAuditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id, 5000);
      const actorId = entry?.executor?.id;

      if (added.size) {
        await logForensic(newMember.guild, {
          actorId,
          action: `Roles assigned to ${newMember.user.tag}`,
          detail: { summary: added.map((r) => r.name).join(", ") }
        });
      }
      if (removed.size) {
        await logForensic(newMember.guild, {
          actorId,
          action: `Roles removed from ${newMember.user.tag}`,
          detail: { summary: removed.map((r) => r.name).join(", ") }
        });
      }

      // Privilege escalation detection: someone gave Admin directly to the member
      const gainedAdmin = !hasAdministrator(oldMember.permissions) && hasAdministrator(newMember.permissions);
      if (gainedAdmin && actorId) {
        responsibilityChain.recordGrant(newMember.guild.id, {
          granteeId: newMember.id,
          grantedById: actorId,
          grantType: "DIRECT_ADMIN"
        });

        const result = await threatScoreService.addThreatPoints(
          newMember.guild.id,
          actorId,
          "GRANT_ADMINISTRATOR",
          config?.threatPoints?.grantAdministrator ?? 120
        );
        await maybeEscalate(newMember.guild, actorId, result.triggered, `Administrator granted to ${newMember.user.tag}`);
      }
    }
  });
}

module.exports = { register };
