const { PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

// Permissions blocked during lockdown (section 8) — Kick/Ban/Timeout
// are intentionally excluded, reserved for authorized roles.
const LOCKDOWN_PERMISSIONS = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageGuildExpressions,
  PermissionsBitField.Flags.CreateInstantInvite
];

// In-memory snapshot of removed permissions, per server, so
// they can be restored when lockdown is disabled.
const lockdownSnapshots = new Map();

async function enableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config?.lockdownActive) return;

  const snapshot = [];

  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue; // @everyone handled separately, but keeping simple rule here
    if (config?.authorizedRoleIds?.includes(role.id)) continue; // authorized roles stay intact
    if (role.id === config?.quarantineRoleId) continue;

    const hasAny = LOCKDOWN_PERMISSIONS.some((p) => role.permissions.has(p));
    if (!hasAny) continue;

    snapshot.push({ roleId: role.id, permissions: role.permissions.bitfield.toString() });

    const newPermissions = role.permissions.remove(LOCKDOWN_PERMISSIONS);
    await role.setPermissions(newPermissions, "Sentinel: lockdown enabled").catch((e) =>
      logger.error(`Failed to remove permissions from ${role.id} during lockdown: ${e.message}`)
    );
  }

  // Also deny SendMessages on @everyone for all text channels
  await guild.channels.fetch();
  const lockdownChannelOverwrites = [];
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased()) continue;
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
    const currentDeny = everyoneOverwrite?.deny || PermissionsBitField.DefaultBit;

    // Skip if already denied
    if (currentDeny & PermissionsBitField.Flags.SendMessages) continue;

    const newDeny = currentDeny | PermissionsBitField.Flags.SendMessages;
    lockdownChannelOverwrites.push({ channelId: channel.id, everyoneDeny: newDeny.toString() });

    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, "Sentinel: lockdown - chat disabled")
      .catch((e) => logger.error(`Failed to deny SendMessages in ${channel.id}: ${e.message}`));
  }

  lockdownSnapshots.set(guild.id, { roles: snapshot, channels: lockdownChannelOverwrites });

  if (config) {
    config.lockdownActive = true;
    await config.save();
  }

  logger.warn(`Lockdown enabled in ${guild.id} (${snapshot.length} roles affected)`);
}

async function disableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config && !config.lockdownActive) return;

  const snapshot = lockdownSnapshots.get(guild.id) || { roles: [], channels: [] };

  for (const { roleId, permissions } of snapshot.roles || []) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await role
      .setPermissions(BigInt(permissions), "Sentinel: lockdown disabled")
      .catch((e) => logger.error(`Failed to restore permissions for ${roleId}: ${e.message}`));
  }

  // Restore @everyone channel overwrites
  for (const { channelId } of snapshot.channels || []) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: null }, "Sentinel: lockdown - chat restored")
      .catch((e) => logger.error(`Failed to restore SendMessages in ${channelId}: ${e.message}`));
  }

  lockdownSnapshots.delete(guild.id);

  if (config) {
    config.lockdownActive = false;
    await config.save();
  }

  logger.info(`Lockdown disabled in ${guild.id}`);
}

async function isLockdownActive(guildId) {
  const config = await GuildConfig.findOne({ guildId }).lean();
  return !!config?.lockdownActive;
}

module.exports = { enableLockdown, disableLockdown, isLockdownActive, LOCKDOWN_PERMISSIONS };
