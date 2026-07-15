const { ChannelType, PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * "Modo Honeypot" (funcionalidade extra sugerida): cria uma role e/ou
 * canal administrativo falso, sem uso real, invisível para membros
 * legítimos. Qualquer interação com estes objetos (editar, apagar,
 * conceder a alguém) é um forte indicador de conta comprometida e
 * pode ser usada por eventHandlers para disparar investigação/emergência.
 */
async function setupHoneypot(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config) return null;

  let role = config.honeypot?.roleId ? guild.roles.cache.get(config.honeypot.roleId) : null;
  if (!role) {
    role = await guild.roles.create({
      name: "⚠︎ system-reserved", // nome discreto, parece uma role de sistema
      permissions: [PermissionsBitField.Flags.Administrator],
      hoist: false,
      mentionable: false,
      reason: "Sentinel: criação da role honeypot"
    });
  }

  let channel = config.honeypot?.channelId ? guild.channels.cache.get(config.honeypot.channelId) : null;
  if (!channel) {
    channel = await guild.channels.create({
      name: "system-config",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel] }
      ],
      reason: "Sentinel: criação do canal honeypot"
    });
  }

  config.honeypot = { enabled: true, roleId: role.id, channelId: channel.id };
  await config.save();

  logger.info(`Honeypot configurado em ${guild.id}: role=${role.id} canal=${channel.id}`);
  return { role, channel };
}

/**
 * Verifica se um determinado id de role/canal corresponde ao honeypot
 * configurado no servidor. Usar dentro dos event handlers relevantes
 * (roleUpdate, roleDelete, channelUpdate, channelDelete, guildMemberUpdate
 * ao conceder a role honeypot a alguém).
 */
async function isHoneypotTriggered(guildId, { roleId = null, channelId = null } = {}) {
  const config = await GuildConfig.findOne({ guildId }).lean();
  if (!config?.honeypot?.enabled) return false;

  if (roleId && config.honeypot.roleId === roleId) return true;
  if (channelId && config.honeypot.channelId === channelId) return true;
  return false;
}

module.exports = { setupHoneypot, isHoneypotTriggered };
