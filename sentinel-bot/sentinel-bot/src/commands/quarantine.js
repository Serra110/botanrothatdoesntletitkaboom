const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const quarantineService = require("../services/quarantineService");
const { isAuthorized } = require("../utils/permissions");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Coloca um membro em quarentena manualmente.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName("user").setDescription("Sends the member to quarantine").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("The reason for the quarantine").setRequired(false)),

  async execute(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();

    if (!isAuthorized(interaction.member, config || {})) {
      await interaction.reply({
        embeds: [dangerEmbed("No permission", "You do not have permission to quarantine members.")],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || `Manual quarantine by ${interaction.user.tag}`;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.editReply({ embeds: [dangerEmbed("Membro não encontrado", null)] });
      return;
    }

    await quarantineService.quarantineMember(interaction.guild, member, reason);
    await interaction.editReply({ embeds: [successEmbed("🔒 Member quarantined", `${targetUser.tag}: ${reason}`)] });
  }
};
