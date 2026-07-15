const { ChannelType, PermissionsBitField } = require("discord.js");
const Backup = require("../models/Backup");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("./backupService");
const logger = require("../utils/logger");
const { getOwnerIds } = require("../utils/permissions");
const { neutralEmbed, successEmbed } = require("../utils/embeds");

const pendingRollbacks = new Map();
const rollbackApplied = new Map(); // guildId -> true (prevents double rollback)

async function applyBackup(guild, backup) {
  backupService.markRollback(guild.id, true);
  rollbackApplied.set(guild.id, true);
  try {
    const { data } = backup;

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

    const existingChannelIds = new Set(guild.channels.cache.keys());
    for (const catData of data.categories) {
      if (existingChannelIds.has(catData.id)) continue;
      await guild.channels
        .create({ name: catData.name, type: ChannelType.GuildCategory, reason: "Sentinel rollback" })
        .catch((e) => logger.error(`Failed to recreate category ${catData.name}: ${e.message}`));
    }

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
 * After rollback, ask owner if emergency is done.
 */
async function promptEmergencyResolution(guild, backup) {
  const ownerIds = getOwnerIds();
  const owner = ownerIds[0] ? await guild.members.fetch(ownerIds[0]).catch(() => null) : null;

  if (!owner) return;

  const embed = neutralEmbed(
    "🔄 Rollback Complete",
    `Backup \`${backup._id}\` has been restored.\n\n**Is the emergency over?**\nUse \`/emergency stop\` to deactivate emergency mode, or do nothing to keep it active.`
  );

  await owner.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Post-emergency rollback flow: gives the Owner N minutes to
 * choose a backup; otherwise, automatically restores the most
 * recent valid one.
 */
async function initiateRollbackFlow(guild) {
  // Don't auto-rollback if already applied
  if (rollbackApplied.has(guild.id)) {
    logger.debug(`Rollback already applied in ${guild.id}, skipping auto-rollback.`);
    return null;
  }

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
      // Don't auto-rollback if already applied
      if (rollbackApplied.has(guild.id)) {
        pendingRollbacks.delete(guild.id);
        resolve(null);
        return;
      }

      const latest = await backupService.getLatestValidBackup(guild.id);
      if (latest) {
        await applyBackup(guild, latest);
        await promptEmergencyResolution(guild, latest);
      }
      pendingRollbacks.delete(guild.id);
      resolve(latest);
    }, windowMinutes * 60 * 1000);

    pendingRollbacks.set(guild.id, { resolve, timeout });
  });
}

/**
 * Called by the /rollback command when the Owner chooses manually,
 * cancelling the automatic timeout.
 */
async function manualRollback(guild, backupId) {
  const backup = await Backup.findById(backupId);
  if (!backup || backup.guildId !== guild.id) return null;

  // Cancel auto-rollback if pending
  const pending = pendingRollbacks.get(guild.id);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve(backup);
    pendingRollbacks.delete(guild.id);
  }

  await applyBackup(guild, backup);
  await promptEmergencyResolution(guild, backup);

  return backup;
}

module.exports = { applyBackup, initiateRollbackFlow, manualRollback };
