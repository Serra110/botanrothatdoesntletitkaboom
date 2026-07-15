const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Enables/disables maintenance mode (suspends detections, keeps logs and backups).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("start").setDescription("Enables maintenance mode."))
    .addSubcommand((sub) => sub.setName("end").setDescription("Disables maintenance mode.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id });

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "Only the Owner or Co-Owner can manage maintenance mode.")],
        ephemeral: true
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (!config) {
      await interaction.reply({ embeds: [dangerEmbed("Server not configured", "Use /config first.")], ephemeral: true });
      return;
    }

    config.maintenanceMode = sub === "start";
    await config.save();

    await interaction.reply({
      embeds: [
        successEmbed(
          sub === "start" ? "🛠️ Maintenance mode enabled" : "✅ Maintenance mode disabled",
          sub === "start"
            ? "Real-time detections and threat score suspended. Logs and backups remain active."
            : "Real-time detections resumed."
        )
      ],
      ephemeral: true
    });
  }
};
