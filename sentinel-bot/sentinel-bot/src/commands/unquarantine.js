const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const quarantineService = require("../services/quarantineService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unquarantine")
    .setDescription("Removes quarantine from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName("user").setDescription("Member to release from quarantine").setRequired(true))
    .addBooleanOption((opt) =>
      opt.setName("innocent").setDescription("Restore previous roles (true) or keep marked as guilty (false)").setRequired(true)
    ),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "You are not authorized to remove quarantines.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const innocent = interaction.options.getBoolean("innocent");

    const result = await quarantineService.clearQuarantine(interaction.guild, targetUser.id, innocent, interaction.user.id);

    if (!result) {
      await interaction.editReply({ embeds: [dangerEmbed("No active quarantine for this member", null)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          innocent ? "✅ Quarantine removed (innocent)" : "User marked as guilty",
          `${targetUser.tag}`
        )
      ]
    });
  }
};
