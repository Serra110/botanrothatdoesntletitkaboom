const { PermissionsBitField } = require("discord.js");

const DANGEROUS_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageGuildExpressions
];

function isOwnerOrCoOwner(member, guildConfig) {
  if (!member || !guildConfig) return false;
  return member.id === guildConfig.ownerId || member.id === guildConfig.coOwnerId;
}

function isAuthorized(member, guildConfig) {
  if (isOwnerOrCoOwner(member, guildConfig)) return true;
  if (!guildConfig.authorizedRoleIds?.length) return false;
  return member.roles.cache.some((r) => guildConfig.authorizedRoleIds.includes(r.id));
}

function isProtectedRole(roleId, guildConfig) {
  return guildConfig.protectedRoleIds?.includes(roleId) ?? false;
}

function isCriticalChannel(channelId, guildConfig) {
  return guildConfig.criticalChannelIds?.includes(channelId) ?? false;
}

function hasDangerousPermissions(permissionsBitField) {
  return DANGEROUS_PERMISSIONS.some((perm) => permissionsBitField.has(perm));
}

function hasAdministrator(permissionsBitField) {
  return permissionsBitField.has(PermissionsBitField.Flags.Administrator);
}

module.exports = {
  DANGEROUS_PERMISSIONS,
  isOwnerOrCoOwner,
  isAuthorized,
  isProtectedRole,
  isCriticalChannel,
  hasDangerousPermissions,
  hasAdministrator
};
