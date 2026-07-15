const { ChannelType, PermissionsBitField } = require("discord.js");
const Backup = require("../models/Backup");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("./backupService");
const logger = require("../utils/logger");
const { getOwnerIds } = require("../utils/permissions");
const { neutralEmbed } = require("../utils/embeds");

/**
 * Applies a backup to the server: recreates missing
 * categories/channels/roles and restores basic permissions. This is a
 * best-effort reconstruction — Discord doesn't allow "undoing" directly,
 * so the bot recreates what's missing and adjusts what exists.
 */
async function applyBackup(guild, backup) {
  backupService.markRollback(guild.id, true);
  try {
    const { data } = backup;

    // 1. Missing roles (ignores @everyone and integration-managed roles)
    const existingRoleIds = new Set(guild.roles.cache.keys());
    for (const roleData of data.roles) {
      if (existingRoleIds.has(roleData.id)) continue;
      if (roleData.name === "@everyone") continue;
      await guild.roles
        .create({
          name: roleData.name,
          color: roleData.color,
          hoist: roleData.hoist,
          permissions: BigInt(roleData.permissions),
          mentionable: roleData.mentionable,
          reason: "Sentinel rollback: role recreated from backup"
        })
        .catch((e) => logger.error(`Failed to recreate role ${roleData.name}: ${e.message}`));
    }

    // 2. Missing categories
    const existingChannelIds = new Set(guild.channels.cache.keys());
    for (const catData of data.categories) {
      if (existingChannelIds.has(catData.id)) continue;
      await guild.channels
        .create({ name: catData.name, type: ChannelType.GuildCategory, reason: "Sentinel rollback" })
        .catch((e) => logger.error(`Failed to recreate category ${catData.name}: ${e.message}`));
    }

    // 3. Missing channels
    for (const chData of data.channels) {
      if (existingChannelIds.has(chData.id)) continue;
      await guild.channels
        .create({
          name: chData.name,
          type: chData.type,
          topic: chData.topic || undefined,
          nsfw: chData.nsfw,
          rateLimitPerUser: chData.rateLimitPerUser,
          reason: "Sentinel rollback: channel recreated from backup"
        })
        .catch((e) => logger.error(`Failed to recreate channel ${chData.name}: ${e.message}`));
    }

    logger.info(`Rollback applied in ${guild.id} from backup ${backup._id}`);
  } finally {
    backupService.markRollback(guild.id, false);
  }
}

/**
 * Post-emergency rollback flow: gives the Owner N minutes to
 * choose a backup; otherwise, automatically restores the most
 * recent valid one (section 12).
 */
async function initiateRollbackFlow(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const windowMinutes = config?.rollback?.ownerDecisionWindowMinutes ?? 10;

  const backups = await backupService.listBackups(guild.id);
  if (!backups.length) {
    logger.warn(`No backups available for rollback in ${guild.id}`);
    return null;
  }

  const ownerIds = getOwnerIds();
  const owner = ownerIds[0] ? await guild.members.fetch(ownerIds[0]).catch(() => null) : null;

  if (owner) {
    const list = backups
      .slice(0, 5)
      .map((b, i) => `**${i + 1}.** ${new Date(b.createdAt).toLocaleString("en-US")} ${b.manual ? "(manual)" : ""}`)
      .join("\n");

    const embed = neutralEmbed(
      "🔄 Choose a backup to restore",
      `Use \`/rollback\` in the server to choose, or do nothing and the most recent backup will be automatically restored in ${windowMinutes} minutes.\n\n${list}`
    );

    owner.send({ embeds: [embed] }).catch(() => {});
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      const latest = await backupService.getLatestValidBackup(guild.id);
      if (latest) {
        await applyBackup(guild, latest);
      }
      resolve(latest);
    }, windowMinutes * 60 * 1000);

    pendingRollbacks.set(guild.id, { resolve, timeout });
  });
}

const pendingRollbacks = new Map();

/**
 * Called by the /rollback command when the Owner chooses manually,
 * cancelling the automatic timeout.
 */
async function manualRollback(guild, backupId) {
  const backup = await Backup.findById(backupId);
  if (!backup || backup.guildId !== guild.id) return null;

  await applyBackup(guild, backup);

  const pending = pendingRollbacks.get(guild.id);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve(backup);
    pendingRollbacks.delete(guild.id);
  }

  return backup;
}

module.exports = { applyBackup, initiateRollbackFlow, manualRollback };
