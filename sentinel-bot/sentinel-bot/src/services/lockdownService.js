const { PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

// Permissões bloqueadas durante lockdown (secção 8) — Kick/Ban/Timeout
// ficam de fora propositadamente, reservados às roles autorizadas.
const LOCKDOWN_PERMISSIONS = [
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageGuildExpressions, // emojis/stickers
  PermissionsBitField.Flags.CreateInstantInvite
];

// Snapshot em memória das permissões removidas, por servidor, para
// poderem ser restauradas ao desativar o lockdown.
const lockdownSnapshots = new Map();

async function enableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config?.lockdownActive) return;

  const snapshot = [];

  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue; // @everyone tratado à parte, mas mantemos regra simples aqui
    if (config?.authorizedRoleIds?.includes(role.id)) continue; // roles autorizadas ficam intactas
    if (role.id === config?.quarantineRoleId) continue;

    const hasAny = LOCKDOWN_PERMISSIONS.some((p) => role.permissions.has(p));
    if (!hasAny) continue;

    snapshot.push({ roleId: role.id, permissions: role.permissions.bitfield.toString() });

    const newPermissions = role.permissions.remove(LOCKDOWN_PERMISSIONS);
    await role.setPermissions(newPermissions, "Sentinel: lockdown ativado").catch((e) =>
      logger.error(`Falha ao remover permissões de ${role.id} durante lockdown: ${e.message}`)
    );
  }

  lockdownSnapshots.set(guild.id, snapshot);

  if (config) {
    config.lockdownActive = true;
    await config.save();
  }

  logger.warn(`Lockdown ativado em ${guild.id} (${snapshot.length} roles afetadas)`);
}

async function disableLockdown(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (config && !config.lockdownActive) return;

  const snapshot = lockdownSnapshots.get(guild.id) || [];

  for (const { roleId, permissions } of snapshot) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await role
      .setPermissions(BigInt(permissions), "Sentinel: lockdown desativado")
      .catch((e) => logger.error(`Falha ao restaurar permissões de ${roleId}: ${e.message}`));
  }

  lockdownSnapshots.delete(guild.id);

  if (config) {
    config.lockdownActive = false;
    await config.save();
  }

  logger.info(`Lockdown desativado em ${guild.id}`);
}

async function isLockdownActive(guildId) {
  const config = await GuildConfig.findOne({ guildId }).lean();
  return !!config?.lockdownActive;
}

module.exports = { enableLockdown, disableLockdown, isLockdownActive, LOCKDOWN_PERMISSIONS };
