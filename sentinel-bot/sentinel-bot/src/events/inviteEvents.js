const GuildConfig = require("../models/GuildConfig");
const { logForensic } = require("../services/forensicsLogger");

function register(client) {
  client.on("inviteCreate", async (invite) => {
    const config = await GuildConfig.findOne({ guildId: invite.guild.id }).lean();
    if (config?.maintenanceMode) return;
    await logForensic(invite.guild, {
      actorId: invite.inviter?.id,
      action: `Convite criado: ${invite.code}`,
      detail: { summary: `Canal: #${invite.channel?.name}` }
    });
  });

  client.on("inviteDelete", async (invite) => {
    const config = await GuildConfig.findOne({ guildId: invite.guild.id }).lean();
    if (config?.maintenanceMode) return;
    await logForensic(invite.guild, { action: `Convite removido: ${invite.code}` });
  });
}

module.exports = { register };
