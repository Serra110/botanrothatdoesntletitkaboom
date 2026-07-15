const { PermissionsBitField, ChannelType } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { getOwnerIds, getTrustedRoles } = require("../utils/permissions");
const logger = require("../utils/logger");

const lockdownSnapshots = new Map();

async function enableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config?.lockdownActive) return;

  const ownerIds = getOwnerIds();
  const trustedRoles = getTrustedRoles();
  const snapshot = { roles: [], channels: [], adminStripped: [] };

  // 1. Strip Administrator and dangerous permissions from ALL roles (except trusted + @everyone)
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue; // @everyone
    if (trustedRoles.includes(role.id)) continue;
    if (role.managed) continue; // integration-managed roles (bots, etc.)

    const dangerousPerms = [
      PermissionsBitField.Flags.Administrator,
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ManageWebhooks,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.ManageGuildExpressions,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.SendMessagesInThreads,
      PermissionsBitField.Flags.CreatePublicThreads,
      PermissionsBitField.Flags.CreatePrivateThreads,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Stream,
      PermissionsBitField.Flags.UseApplicationCommands,
      PermissionsBitField.Flags.CreateInstantInvite
    ];

    const hasAny = dangerousPerms.some((p) => role.permissions.has(p));
    if (!hasAny) continue;

    snapshot.roles.push({ roleId: role.id, permissions: role.permissions.bitfield.toString() });

    const newPermissions = role.permissions.remove(dangerousPerms);
    await role.setPermissions(newPermissions, "Sentinel: lockdown - permissions stripped").catch((e) =>
      logger.error(`Failed to strip permissions from role ${role.id}: ${e.message}`)
    );
  }

  // 2. Block ALL channels for @everyone, allow only trusted roles + owner
  await guild.channels.fetch();
  for (const channel of guild.channels.cache.values()) {
    const isText = channel.isTextBased() || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum;
    const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;

    if (!isText && !isVoice) continue;

    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
    const currentDeny = everyoneOverwrite?.deny?.bitfield?.toString() || "0";

    // Build deny for @everyone: block everything
    const textDeny = PermissionsBitField.Flags.SendMessages |
      PermissionsBitField.Flags.SendMessagesInThreads |
      PermissionsBitField.Flags.CreatePublicThreads |
      PermissionsBitField.Flags.CreatePrivateThreads |
      PermissionsBitField.Flags.AddReactions |
      PermissionsBitField.Flags.UseApplicationCommands |
      PermissionsBitField.Flags.CreateInstantInvite;

    const voiceDeny = PermissionsBitField.Flags.Connect |
      PermissionsBitField.Flags.Speak |
      PermissionsBitField.Flags.Stream |
      PermissionsBitField.Flags.UseEmbeddedActivities |
      PermissionsBitField.Flags.CreateInstantInvite;

    const denyAll = isText ? textDeny : voiceDeny;

    snapshot.channels.push({
      channelId: channel.id,
      everyoneDeny: currentDeny
    });

    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, {
      reason: "Sentinel: lockdown - @everyone blocked"
    }).catch((e) => logger.error(`Failed to lockdown channel ${channel.id}: ${e.message}`));

    // Also explicitly deny in the overwrites for text channels
    if (isText) {
      await channel.permissionOverwrites.edit(guild.id, {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        AddReactions: false,
        UseApplicationCommands: false
      }, { reason: "Sentinel: lockdown - full text deny" }).catch(() => {});
    }

    if (isVoice) {
      await channel.permissionOverwrites.edit(guild.id, {
        Connect: false,
        Speak: false,
        Stream: false
      }, { reason: "Sentinel: lockdown - voice deny" }).catch(() => {});
    }

    // 3. Explicitly ALLOW trusted roles + owner on each channel
    const trustedMemberIds = [];
    for (const roleId of trustedRoles) {
      await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        SendMessagesInThreads: true,
        CreatePublicThreads: true,
        CreatePrivateThreads: true,
        AddReactions: true,
        UseApplicationCommands: true,
        Connect: true,
        Speak: true,
        Stream: true
      }, { reason: "Sentinel: lockdown - trusted role allowed" }).catch(() => {});
    }
  }

  lockdownSnapshots.set(guild.id, snapshot);

  if (config) {
    config.lockdownActive = true;
    await config.save();
  }

  logger.warn(`Lockdown ENABLED in ${guild.id} — ${snapshot.roles.length} roles stripped, ${snapshot.channels.length} channels locked`);
}

async function disableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config && !config.lockdownActive) return;

  const snapshot = lockdownSnapshots.get(guild.id) || { roles: [], channels: [] };

  // Restore role permissions
  for (const { roleId, permissions } of snapshot.roles || []) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await role
      .setPermissions(BigInt(permissions), "Sentinel: lockdown disabled - permissions restored")
      .catch((e) => logger.error(`Failed to restore permissions for ${roleId}: ${e.message}`));
  }

  // Restore channel overwrites for @everyone
  for (const { channelId, everyoneDeny } of snapshot.channels || []) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    // Reset @everyone to original deny
    await channel.permissionOverwrites.edit(guild.id, {
      SendMessages: null,
      SendMessagesInThreads: null,
      CreatePublicThreads: null,
      CreatePrivateThreads: null,
      AddReactions: null,
      UseApplicationCommands: null,
      Connect: null,
      Speak: null,
      Stream: null
    }, "Sentinel: lockdown disabled - channels restored").catch((e) =>
      logger.error(`Failed to restore channel ${channelId}: ${e.message}`)
    );

    // Remove trusted role overwrites we added
    const trustedRoles = getTrustedRoles();
    for (const roleId of trustedRoles) {
      const ow = channel.permissionOverwrites.cache.get(roleId);
      if (ow) {
        await ow.delete("Sentinel: lockdown disabled - removing trusted overwrite").catch(() => {});
      }
    }
  }

  lockdownSnapshots.delete(guild.id);

  if (config) {
    config.lockdownActive = false;
    await config.save();
  }

  logger.info(`Lockdown DISABLED in ${guild.id}`);
}

async function isLockdownActive(guildId) {
  const config = await GuildConfig.findOne({ guildId }).lean();
  return !!config?.lockdownActive;
}

module.exports = { enableLockdown, disableLockdown, isLockdownActive };
