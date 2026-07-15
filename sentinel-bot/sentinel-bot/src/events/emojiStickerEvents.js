const { AuditLogEvent } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { fetchAuditEntry } = require("../utils/auditLog");
const { logForensic } = require("../services/forensicsLogger");

function register(client) {
  client.on("emojiCreate", async (emoji) => {
    const config = await GuildConfig.findOne({ guildId: emoji.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await logForensic(emoji.guild, { actorId: entry?.executor?.id, action: `Emoji created: ${emoji.name}` });
  });

  client.on("emojiUpdate", async (oldEmoji, newEmoji) => {
    const config = await GuildConfig.findOne({ guildId: newEmoji.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
    await logForensic(newEmoji.guild, {
      actorId: entry?.executor?.id,
      action: `Emoji updated: ${oldEmoji.name} → ${newEmoji.name}`
    });
  });

  client.on("emojiDelete", async (emoji) => {
    const config = await GuildConfig.findOne({ guildId: emoji.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
    await logForensic(emoji.guild, { actorId: entry?.executor?.id, action: `Emoji deleted: ${emoji.name}` });
  });

  client.on("stickerCreate", async (sticker) => {
    const config = await GuildConfig.findOne({ guildId: sticker.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(sticker.guild, AuditLogEvent.StickerCreate, sticker.id);
    await logForensic(sticker.guild, { actorId: entry?.executor?.id, action: `Sticker created: ${sticker.name}` });
  });

  client.on("stickerUpdate", async (oldSticker, newSticker) => {
    const config = await GuildConfig.findOne({ guildId: newSticker.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(newSticker.guild, AuditLogEvent.StickerUpdate, newSticker.id);
    await logForensic(newSticker.guild, {
      actorId: entry?.executor?.id,
      action: `Sticker updated: ${oldSticker.name} → ${newSticker.name}`
    });
  });

  client.on("stickerDelete", async (sticker) => {
    const config = await GuildConfig.findOne({ guildId: sticker.guild.id }).lean();
    if (config?.maintenanceMode) return;
    const entry = await fetchAuditEntry(sticker.guild, AuditLogEvent.StickerDelete, sticker.id);
    await logForensic(sticker.guild, { actorId: entry?.executor?.id, action: `Sticker deleted: ${sticker.name}` });
  });
}

module.exports = { register };
