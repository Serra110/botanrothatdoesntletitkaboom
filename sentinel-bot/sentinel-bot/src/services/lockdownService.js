const { PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

// Permissions blocked during lockdown (section 8) — Kick/Ban/Timeout
// are intentionally excluded, reserved for authorized roles.
const LOCKDOWN_PERMISSIONS = [
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageGuildExpressions, // emojis/stickers
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

  lockdownSnapshots.set(guild.id, snapshot);

  if (config) {
    config.lockdownActive = true;
    await config.save();
  }

  logger.warn(`Lockdown enabled in ${guild.id} (${snapshot.length} roles affected)`);
}

async function disableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config && !config.lockdownActive) return;

  const snapshot = lockdownSnapshots.get(guild.id) || [];

  for (const { roleId, permissions } of snapshot) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await role
      .setPermissions(BigInt(permissions), "Sentinel: lockdown disabled")
      .catch((e) => logger.error(`Failed to restore permissions for ${roleId}: ${e.message}`));
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
