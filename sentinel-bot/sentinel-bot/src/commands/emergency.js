const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const emergencyService = require("../services/emergencyService");
const { isOwnerOrCoOwner } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emergency")
    .setDescription("Forces or disables emergency mode manually.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("start").setDescription("Enables emergency mode immediately."))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Disables emergency mode.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isOwnerOrCoOwner(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "Only the Owner or Co-Owner can use this command.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      await emergencyService.activateEmergency(interaction.guild, {
        reason: `Manual activation by ${interaction.user.tag}`,
        responsibleUserIds: []
      });
      await interaction.editReply({ embeds: [successEmbed("🚨 Emergency activated manually")] });
    } else {
      await emergencyService.deactivateEmergency(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("Emergency deactivated")] });
    }
  }
};
