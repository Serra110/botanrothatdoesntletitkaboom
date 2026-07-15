const { ChannelType, PermissionsBitField } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const logger = require("../utils/logger");

/**
 * "Honeypot Mode" (extra suggested functionality): creates a role and/or
 * fake admin channel, unused, invisible to legitimate members.
 * Any interaction with these objects (edit, delete,
 * grant to someone) is a strong indicator of a compromised account and
 * can be used by eventHandlers to trigger investigation/emergency.
 */
async function setupHoneypot(guild) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config) return null;

  let role = config.honeypot?.roleId ? guild.roles.cache.get(config.honeypot.roleId) : null;
  if (!role) {
    role = await guild.roles.create({
      name: "⚠︎ system-reserved", // discreet name, looks like a system role
      permissions: [PermissionsBitField.Flags.Administrator],
      hoist: false,
      mentionable: false,
      reason: "Sentinel: honeypot role creation"
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
      reason: "Sentinel: honeypot channel creation"
    });
  }

  config.honeypot = { enabled: true, roleId: role.id, channelId: channel.id };
  await config.save();

  logger.info(`Honeypot configured in ${guild.id}: role=${role.id} channel=${channel.id}`);
  return { role, channel };
}

/**
 * Checks if a given role/channel ID matches the honeypot
 * configured on the server. Use within the relevant event handlers
 * (roleUpdate, roleDelete, channelUpdate, channelDelete, guildMemberUpdate
 * when granting the honeypot role to someone).
 */
async function isHoneypotTriggered(guildId, { roleId = null, channelId = null } = {}) {
  const config = await GuildConfig.findOne({ guildId }).lean();
  if (!config?.honeypot?.enabled) return false;

  if (roleId && config.honeypot.roleId === roleId) return true;
  if (channelId && config.honeypot.channelId === channelId) return true;
  return false;
}

module.exports = { setupHoneypot, isHoneypotTriggered };
