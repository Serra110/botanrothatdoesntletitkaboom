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

    await logForensic(channel.guild, { actorId, action: `Canal criado: #${channel.name}` });

    // Deteção de criação em massa (5+ canais num curto intervalo)
    const { addThreatPoints, countRecentActions } = threatScoreService;
    const recentCreates = await countRecentActions(channel.guild.id, actorId, "CHANNEL_CREATE", 60_000);
    await addThreatPoints(channel.guild.id, actorId, "CHANNEL_CREATE", 0); // regista no histórico sem pontos base

    if (recentCreates + 1 >= 5) {
      const result = await addThreatPoints(
        channel.guild.id,
        actorId,
        "MASS_CHANNEL_CREATE",
        config?.threatPoints?.massChannelCreate ?? 80
      );
      await maybeEscalate(channel.guild, actorId, result.triggered, "Criação em massa de canais");
    }
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const config = await GuildConfig.findOne({ guildId: channel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const isCategory = channel.type === ChannelType.GuildCategory;
    const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const actorId = entry?.executor?.id;

    // Honeypot: canal falso apagado
    if (await honeypotService.isHoneypotTriggered(channel.guild.id, { channelId: channel.id })) {
      await triggerHoneypotAlert(channel.guild, actorId, "canal honeypot apagado");
      return;
    }

    if (!actorId) return;

    await logForensic(channel.guild, { actorId, action: `${isCategory ? "Categoria" : "Canal"} apagado: ${channel.name}` });

    const points = isCategory
      ? config?.threatPoints?.categoryDelete ?? 100
      : config?.threatPoints?.channelDelete ?? 50;

    const result = await threatScoreService.addThreatPoints(
      channel.guild.id,
      actorId,
      isCategory ? "CATEGORY_DELETE" : "CHANNEL_DELETE",
      points
    );

    await maybeEscalate(channel.guild, actorId, result.triggered, `${isCategory ? "Categoria" : "Canal"} apagado: ${channel.name}`);
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const config = await GuildConfig.findOne({ guildId: newChannel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const entry = await fetchAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const actorId = entry?.executor?.id;
    if (!actorId) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`nome: ${oldChannel.name} → ${newChannel.name}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push("categoria alterada");
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push("slowmode alterado");
    if (oldChannel.topic !== newChannel.topic) changes.push("tópico alterado");
    if (oldChannel.nsfw !== newChannel.nsfw) changes.push("NSFW alterado");

    const permissionsChanged =
      oldChannel.permissionOverwrites?.cache.size !== newChannel.permissionOverwrites?.cache.size ||
      [...newChannel.permissionOverwrites.cache.values()].some((o) => {
        const prev = oldChannel.permissionOverwrites.cache.get(o.id);
        return !prev || !prev.allow.equals(o.allow) || !prev.deny.equals(o.deny);
      });

    if (permissionsChanged) changes.push("permissões alteradas");

    if (!changes.length) return;

    // Canal crítico com permissões alteradas exige aprovação
    if (permissionsChanged && isCriticalChannel(newChannel.id, config || {})) {
      const approved = await approvalService.requestApproval(
        newChannel.guild,
        "EDIT_CRITICAL_CHANNEL_PERMISSIONS",
        { summary: `#${newChannel.name}: ${changes.join(", ")}` },
        actorId
      );
      if (!approved) {
        logger.warn(`Alteração de permissões em canal crítico #${newChannel.name} não aprovada.`);
      }
    }

    await logForensic(newChannel.guild, {
      actorId,
      action: `Canal atualizado: #${newChannel.name}`,
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
    await logForensic(guild, { actorId, action: "⚠️ Alerta de Threat Score", detail: { summary: reasonSummary } });
  }
}

async function triggerHoneypotAlert(guild, actorId, description) {
  await logForensic(guild, { actorId, action: "🍯 Honeypot ativado", detail: { summary: description } });
  if (actorId) {
    await emergencyService.activateEmergency(guild, {
      reason: `Honeypot ativado: ${description}`,
      responsibleUserIds: [actorId]
    });
  }
}

module.exports = { register, maybeEscalate, triggerHoneypotAlert };
