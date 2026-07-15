const GuildConfig = require("../models/GuildConfig");
const { logForensic } = require("../services/forensicsLogger");

function register(client) {
  client.on("inviteCreate", async (invite) => {
    const config = await GuildConfig.findOne({ guildId: invite.guild.id }).lean();
    if (config?.maintenanceMode) return;
    await logForensic(invite.guild, {
      actorId: invite.inviter?.id,
      action: `Invite created: ${invite.code}`,
      detail: { summary: `Channel: #${invite.channel?.name}` }
    });
  });

  client.on("inviteDelete", async (invite) => {
    const config = await GuildConfig.findOne({ guildId: invite.guild.id }).lean();
    if (config?.maintenanceMode) return;
    await logForensic(invite.guild, { action: `Invite removed: ${invite.code}` });
  });
}

module.exports = { register };
