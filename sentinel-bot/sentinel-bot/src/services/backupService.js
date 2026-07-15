const { ChannelType } = require("discord.js");
const Backup = require("../models/Backup");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

let emergencyInProgress = new Set(); // guildIds
let rollbackInProgress = new Set(); // guildIds

function markEmergency(guildId, active) {
  active ? emergencyInProgress.add(guildId) : emergencyInProgress.delete(guildId);
}
function markRollback(guildId, active) {
  active ? rollbackInProgress.add(guildId) : rollbackInProgress.delete(guildId);
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    position: channel.position,
    topic: channel.topic ?? null,
    nsfw: channel.nsfw ?? false,
    rateLimitPerUser: channel.rateLimitPerUser ?? 0,
    permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.bitfield.toString(),
      deny: o.deny.bitfield.toString()
    }))
  };
}

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable
  };
}

/**
 * Cria um backup completo do servidor. Nunca deve ser chamado durante
 * emergência ou rollback (secção 11).
 */
async function createBackup(guild, { manual = false } = {}) {
  if (emergencyInProgress.has(guild.id)) {
    logger.warn(`Backup ignorado em ${guild.id}: emergência em curso.`);
    return null;
  }
  if (rollbackInProgress.has(guild.id)) {
    logger.warn(`Backup ignorado em ${guild.id}: rollback em curso.`);
    return null;
  }

  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();

  await guild.channels.fetch();
  await guild.roles.fetch();

  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).map(serializeChannel);
  const channels = guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).map(serializeChannel);
  const roles = guild.roles.cache.map(serializeRole);
  const roleOrder = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position).map((r) => r.id);
  const emojis = guild.emojis.cache.map((e) => ({ id: e.id, name: e.name, url: e.imageURL() }));
  const stickers = guild.stickers.cache.map((s) => ({ id: s.id, name: s.name, description: s.description }));

  let webhooks = [];
  try {
    const fetched = await guild.fetchWebhooks();
    webhooks = fetched.map((w) => ({ id: w.id, name: w.name, channelId: w.channelId }));
  } catch (e) {
    logger.debug(`Não foi possível listar webhooks: ${e.message}`);
  }

  // Mensagens: apenas dos canais explicitamente configurados (secção 11)
  const messages = {};
  if (config?.backupMessageChannelIds?.length) {
    for (const channelId of config.backupMessageChannelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel?.isTextBased()) continue;
      try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        messages[channelId] = fetched.map((m) => ({
          authorId: m.author?.id,
          content: m.content,
          createdAt: m.createdAt
        }));
      } catch (e) {
        logger.debug(`Não foi possível salvar mensagens de ${channelId}: ${e.message}`);
      }
    }
  }

  const backup = await Backup.create({
    guildId: guild.id,
    manual,
    data: {
      guildName: guild.name,
      channels,
      categories,
      roles,
      roleOrder,
      emojis,
      stickers,
      webhooks,
      messages,
      config: config || {}
    }
  });

  await rotateBackups(guild.id, config?.backupRetentionCount ?? 3);

  logger.info(`Backup ${manual ? "manual" : "automático"} criado para ${guild.id} (${backup._id})`);
  return backup;
}

/**
 * Mantém apenas N backups por servidor, removendo o mais antigo.
 */
async function rotateBackups(guildId, retentionCount) {
  const backups = await Backup.find({ guildId }).sort({ createdAt: -1 });
  if (backups.length <= retentionCount) return;

  const toRemove = backups.slice(retentionCount);
  await Backup.deleteMany({ _id: { $in: toRemove.map((b) => b._id) } });
}

async function listBackups(guildId) {
  return Backup.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function getLatestValidBackup(guildId) {
  return Backup.findOne({ guildId, valid: true }).sort({ createdAt: -1 });
}

module.exports = {
  createBackup,
  listBackups,
  getLatestValidBackup,
  rotateBackups,
  markEmergency,
  markRollback,
  emergencyInProgress,
  rollbackInProgress
};
