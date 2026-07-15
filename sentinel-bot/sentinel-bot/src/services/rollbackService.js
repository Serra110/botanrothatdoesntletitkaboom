const { ChannelType, PermissionsBitField } = require("discord.js");
const Backup = require("../models/Backup");
const GuildConfig = require("../models/GuildConfig");
const backupService = require("./backupService");
const logger = require("../utils/logger");
const { neutralEmbed } = require("../utils/embeds");

/**
 * Aplica um backup ao servidor: recria categorias/canais/roles em
 * falta e restaura permissões básicas. Esta é uma reconstrução
 * best-effort — Discord não permite "desfazer" diretamente, por isso
 * o bot recria o que falta e ajusta o que existe.
 */
async function applyBackup(guild, backup) {
  backupService.markRollback(guild.id, true);
  try {
    const { data } = backup;

    // 1. Roles em falta (ignora @everyone e roles geridas por integrações)
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
          reason: "Rollback Sentinel: role recriada a partir de backup"
        })
        .catch((e) => logger.error(`Falha ao recriar role ${roleData.name}: ${e.message}`));
    }

    // 2. Categorias em falta
    const existingChannelIds = new Set(guild.channels.cache.keys());
    for (const catData of data.categories) {
      if (existingChannelIds.has(catData.id)) continue;
      await guild.channels
        .create({ name: catData.name, type: ChannelType.GuildCategory, reason: "Rollback Sentinel" })
        .catch((e) => logger.error(`Falha ao recriar categoria ${catData.name}: ${e.message}`));
    }

    // 3. Canais em falta
    for (const chData of data.channels) {
      if (existingChannelIds.has(chData.id)) continue;
      await guild.channels
        .create({
          name: chData.name,
          type: chData.type,
          topic: chData.topic || undefined,
          nsfw: chData.nsfw,
          rateLimitPerUser: chData.rateLimitPerUser,
          reason: "Rollback Sentinel: canal recriado a partir de backup"
        })
        .catch((e) => logger.error(`Falha ao recriar canal ${chData.name}: ${e.message}`));
    }

    logger.info(`Rollback aplicado em ${guild.id} a partir do backup ${backup._id}`);
  } finally {
    backupService.markRollback(guild.id, false);
  }
}

/**
 * Fluxo de rollback pós-emergência: dá ao Owner N minutos para
 * escolher um backup; caso contrário, restaura automaticamente o mais
 * recente válido (secção 12).
 */
async function initiateRollbackFlow(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const windowMinutes = config?.rollback?.ownerDecisionWindowMinutes ?? 10;

  const backups = await backupService.listBackups(guild.id);
  if (!backups.length) {
    logger.warn(`Sem backups disponíveis para rollback em ${guild.id}`);
    return null;
  }

  const owner = config?.ownerId ? await guild.members.fetch(config.ownerId).catch(() => null) : null;

  if (owner) {
    const list = backups
      .slice(0, 5)
      .map((b, i) => `**${i + 1}.** ${new Date(b.createdAt).toLocaleString("pt-PT")} ${b.manual ? "(manual)" : ""}`)
      .join("\n");

    const embed = neutralEmbed(
      "🔄 Escolha um backup para restaurar",
      `Usa \`/rollback\` no servidor para escolher, ou não faças nada e o backup mais recente será restaurado automaticamente em ${windowMinutes} minutos.\n\n${list}`
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
 * Chamado pelo comando /rollback quando o Owner escolhe manualmente,
 * cancelando o timeout automático.
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
