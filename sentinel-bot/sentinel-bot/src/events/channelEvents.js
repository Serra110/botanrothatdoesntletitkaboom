const { ChannelType, AuditLogEvent } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { fetchAuditEntry } = require("../utils/auditLog");
const threatScoreService = require("../services/threatScoreService");
const approvalService = require("../services/approvalService");
const honeypotService = require("../services/honeypotService");
const emergencyService = require("../services/emergencyService");
const { logForensic } = require("../services/forensicsLogger");
const { isCriticalChannel } = require("../utils/permissions");
const logger = require("../utils/logger");

function register(client) {
  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const config = await GuildConfig.findOne({ guildId: channel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(
      channel.guild,
      channel.type === ChannelType.GuildCategory ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelCreate,
      channel.id
    );
    const actorId = entry?.executor?.id;
    if (!actorId) return;

    await logForensic(channel.guild, { actorId, action: `Channel created: #${channel.name}` });

    // Mass creation detection (5+ channels in a short interval)
    const { addThreatPoints, countRecentActions } = threatScoreService;
    const recentCreates = await countRecentActions(channel.guild.id, actorId, "CHANNEL_CREATE", 60_000);
    await addThreatPoints(channel.guild.id, actorId, "CHANNEL_CREATE", 0); // records in history without base points

    if (recentCreates + 1 >= 5) {
      const result = await addThreatPoints(
        channel.guild.id,
        actorId,
        "MASS_CHANNEL_CREATE",
        config?.threatPoints?.massChannelCreate ?? 80
      );
      await maybeEscalate(channel.guild, actorId, result.triggered, "Mass channel creation");
    }
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const config = await GuildConfig.findOne({ guildId: channel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const isCategory = channel.type === ChannelType.GuildCategory;
    const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const actorId = entry?.executor?.id;

    // Honeypot: fake channel deleted
    if (await honeypotService.isHoneypotTriggered(channel.guild.id, { channelId: channel.id })) {
      await triggerHoneypotAlert(channel.guild, actorId, "honeypot channel deleted");
      return;
    }

    if (!actorId) return;

    await logForensic(channel.guild, { actorId, action: `${isCategory ? "Category" : "Channel"} deleted: ${channel.name}` });

    const points = isCategory
      ? config?.threatPoints?.categoryDelete ?? 100
      : config?.threatPoints?.channelDelete ?? 50;

    const result = await threatScoreService.addThreatPoints(
      channel.guild.id,
      actorId,
      isCategory ? "CATEGORY_DELETE" : "CHANNEL_DELETE",
      points
    );

    await maybeEscalate(channel.guild, actorId, result.triggered, `${isCategory ? "Category" : "Channel"} deleted: ${channel.name}`);
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const config = await GuildConfig.findOne({ guildId: newChannel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const actorId = entry?.executor?.id;
    if (!actorId) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`name: ${oldChannel.name} → ${newChannel.name}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push("category changed");
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push("slowmode changed");
    if (oldChannel.topic !== newChannel.topic) changes.push("topic changed");
    if (oldChannel.nsfw !== newChannel.nsfw) changes.push("NSFW changed");

    const permissionsChanged =
      oldChannel.permissionOverwrites?.cache.size !== newChannel.permissionOverwrites?.cache.size ||
      [...newChannel.permissionOverwrites.cache.values()].some((o) => {
        const prev = oldChannel.permissionOverwrites.cache.get(o.id);
        return !prev || !prev.allow.equals(o.allow) || !prev.deny.equals(o.deny);
      });

    if (permissionsChanged) changes.push("permissions changed");

    if (!changes.length) return;

    // Critical channel with changed permissions requires approval
    if (permissionsChanged && isCriticalChannel(newChannel.id, config || {})) {
      const approved = await approvalService.requestApproval(
        newChannel.guild,
        "EDIT_CRITICAL_CHANNEL_PERMISSIONS",
        { summary: `#${newChannel.name}: ${changes.join(", ")}` },
        actorId
      );
      if (!approved) {
        logger.warn(`Permission change on critical channel #${newChannel.name} not approved.`);
      }
    }

    await logForensic(newChannel.guild, {
      actorId,
      action: `Channel updated: #${newChannel.name}`,
      detail: { summary: changes.join(", ") }
    });
  });
}

async function maybeEscalate(guild, actorId, triggeredLevel, reasonSummary) {
  if (triggeredLevel === "emergency") {
    await emergencyService.activateEmergency(guild, { reason: reasonSummary, responsibleUserIds: [actorId] });
  } else if (triggeredLevel === "quarantine") {
    const quarantineService = require("../services/quarantineService");
    const member = await guild.members.fetch(actorId).catch(() => null);
    if (member) await quarantineService.quarantineMember(guild, member, reasonSummary);
  } else if (triggeredLevel === "alert") {
    await logForensic(guild, { actorId, action: "⚠️ Threat Score Alert", detail: { summary: reasonSummary } });
  }
}

async function triggerHoneypotAlert(guild, actorId, description) {
  await logForensic(guild, { actorId, action: "🍯 Honeypot triggered", detail: { summary: description } });
  if (actorId) {
    await emergencyService.activateEmergency(guild, {
      reason: `Honeypot triggered: ${description}`,
      responsibleUserIds: [actorId]
    });
  }
}

module.exports = { register, maybeEscalate, triggerHoneypotAlert };
