const { AuditLogEvent } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { fetchAuditEntry } = require("../utils/auditLog");
const threatScoreService = require("../services/threatScoreService");
const { logForensic } = require("../services/forensicsLogger");
const { maybeEscalate } = require("./channelEvents");

/**
 * discord.js only exposes the generic "webhooksUpdate" event (indicates
 * something changed in a channel's webhooks, without detail on what).
 * Therefore we always rely on the audit log to reconstruct creation,
 * editing, or removal.
 */
function register(client) {
  client.on("webhooksUpdate", async (channel) => {
    const config = await GuildConfig.findOne({ guildId: channel.guild.id }).lean();
    if (config?.maintenanceMode) return;

    const createEntry = await fetchAuditEntry(channel.guild, AuditLogEvent.WebhookCreate, null, 5000);
    const updateEntry = await fetchAuditEntry(channel.guild, AuditLogEvent.WebhookUpdate, null, 5000);
    const deleteEntry = await fetchAuditEntry(channel.guild, AuditLogEvent.WebhookDelete, null, 5000);

    if (createEntry) {
      const actorId = createEntry.executor?.id;
      await logForensic(channel.guild, { actorId, action: `Webhook created in #${channel.name}` });

      if (actorId) {
        const result = await threatScoreService.addThreatPoints(
          channel.guild.id,
          actorId,
          "WEBHOOK_CREATE",
          config?.threatPoints?.webhookCreate ?? 40
        );
        await maybeEscalate(channel.guild, actorId, result.triggered, `Webhook created in #${channel.name}`);
      }
    }

    if (updateEntry) {
      await logForensic(channel.guild, {
        actorId: updateEntry.executor?.id,
        action: `Webhook updated in #${channel.name}`
      });
    }

    if (deleteEntry) {
      await logForensic(channel.guild, {
        actorId: deleteEntry.executor?.id,
        action: `Webhook removed in #${channel.name}`
      });
    }
  });
}

module.exports = { register };
