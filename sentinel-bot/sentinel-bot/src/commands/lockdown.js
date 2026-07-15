const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const lockdownService = require("../services/lockdownService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Enables or disables lockdown manually.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName("on").setDescription("Enables lockdown."))
    .addSubcommand((sub) => sub.setName("off").setDescription("Disables lockdown.")),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "You are not authorized to manage lockdown.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "on") {
      await lockdownService.enableLockdown(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("🔒 Lockdown enabled")] });
    } else {
      await lockdownService.disableLockdown(interaction.guild);
      await interaction.editReply({ embeds: [successEmbed("🔓 Lockdown disabled")] });
    }
  }
};
