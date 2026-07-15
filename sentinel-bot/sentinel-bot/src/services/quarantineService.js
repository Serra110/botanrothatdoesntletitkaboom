const { PermissionsBitField, ChannelType } = require("discord.js");
const Quarantine = require("../models/Quarantine");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * Garante que existe uma role de quarentena no servidor; cria uma se
 * não existir e configura os permission overwrites necessários.
 */
async function ensureQuarantineRole(guild, config) {
  if (config.quarantineRoleId) {
    const existing = guild.roles.cache.get(config.quarantineRoleId);
    if (existing) return existing;
  }

  const role = await guild.roles.create({
    name: "Quarentena (Sentinel)",
    color: "DarkGrey",
    permissions: [],
    reason: "Criação automática da role de quarentena pelo Sentinel"
  });

  // Bloqueia envio de mensagens e interação em todos os canais de texto
  await Promise.all(
    guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
      .map((c) =>
        c.permissionOverwrites
          .edit(role, {
            SendMessages: false,
            Speak: false,
            AddReactions: false,
            CreateInstantInvite: false
          })
          .catch(() => {})
      )
  );

  await GuildConfig.updateOne({ guildId: guild.id }, { $set: { quarantineRoleId: role.id } });
  logger.info(`Role de quarentena criada em ${guild.id}: ${role.id}`);

  return role;
}

/**
 * Coloca um membro em quarentena: guarda as roles atuais, remove-as
 * (exceto @everyone) e atribui a role de quarentena.
 */
async function quarantineMember(guild, member, reason = "Comportamento suspeito", incidentId = null) {
  const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
  const role = await ensureQuarantineRole(guild, config);

  const previousRoleIds = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);

  await Quarantine.findOneAndUpdate(
    { guildId: guild.id, userId: member.id, status: "active" },
    { guildId: guild.id, userId: member.id, reason, incidentId, previousRoleIds, status: "active", quarantinedAt: new Date() },
    { upsert: true, new: true }
  );

  await member.roles.set([role.id]).catch((e) => logger.error(`Falha ao aplicar quarentena: ${e.message}`));

  logger.info(`Utilizador ${member.id} colocado em quarentena em ${guild.id} (${reason})`);
}

/**
 * Remove a quarentena. Se innocent=true, restaura as roles anteriores.
 * Caso contrário, mantém a role de quarentena até decisão manual
 * (é apenas marcado como "guilty" — a remoção efetiva de roles fica
 * a cargo do staff).
 */
async function clearQuarantine(guild, userId, innocent, decidedById = null) {
  const record = await Quarantine.findOne({ guildId: guild.id, userId, status: "active" });
  if (!record) return false;

  record.status = innocent ? "cleared" : "guilty";
  record.decidedAt = new Date();
  record.decidedBy = decidedById;
  await record.save();

  if (innocent) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      const rolesToRestore = record.previousRoleIds.filter((id) => guild.roles.cache.has(id));
      await member.roles.set(rolesToRestore).catch((e) => logger.error(`Falha ao restaurar roles: ${e.message}`));
    }
    logger.info(`Quarentena de ${userId} removida (inocente) em ${guild.id}`);
  } else {
    logger.info(`Utilizador ${userId} marcado como culpado em ${guild.id}, permanece em quarentena`);
  }

  return true;
}

async function isQuarantined(guildId, userId) {
  const record = await Quarantine.findOne({ guildId, userId, status: "active" }).lean();
  return !!record;
}

module.exports = { ensureQuarantineRole, quarantineMember, clearQuarantine, isQuarantined };
