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

function getOwnerIds() {
  const owner = process.env.OWNER_ID || null;
  const coOwner = process.env.CO_OWNER_ID || null;
  return [owner, coOwner].filter(Boolean);
}

function getCriticalChannelIds() {
  const raw = process.env.CRITICAL_CHANNELS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function getAdminRolesToRemove() {
  const raw = process.env.ADMIN_ROLES_TO_REMOVE || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function getTrustedRoles() {
  const raw = process.env.TRUSTED_ROLES || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function getSaveChannels() {
  const raw = process.env.SAVE_CHANNELS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function getExcludeChannels() {
  const raw = process.env.EXCLUDE_CHANNELS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isOwnerOrCoOwner(member, guildConfig) {
  if (!member) return false;
  const ids = getOwnerIds();
  return ids.includes(member.id);
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
  return getCriticalChannelIds().includes(channelId);
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
  hasAdministrator,
  getOwnerIds,
  getCriticalChannelIds,
  getAdminRolesToRemove,
  getTrustedRoles,
  getSaveChannels,
  getExcludeChannels
};
